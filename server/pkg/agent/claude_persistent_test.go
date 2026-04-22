package agent

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

// writeFakeClaude creates a POSIX shell script that emulates the `claude`
// CLI with --input-format stream-json: it prints a system-init event on
// startup, then for every line on stdin emits an assistant text block plus
// a result event. The script stays alive until stdin closes.
func writeFakeClaude(t *testing.T, dir string) string {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("fake claude script is POSIX shell")
	}
	path := filepath.Join(dir, "claude")
	const body = `#!/bin/sh
printf '{"type":"system","subtype":"init","session_id":"fake-ses"}\n'
while IFS= read -r line; do
  pid=$$
  printf '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"ack"}]}}\n'
  printf '{"type":"result","result":"ack","session_id":"fake-ses","is_error":false}\n'
done
`
	if err := os.WriteFile(path, []byte(body), 0o755); err != nil {
		t.Fatalf("write fake claude: %v", err)
	}
	return path
}

// prependPATH puts dir at the front of PATH for the duration of the test.
func prependPATH(t *testing.T, dir string) {
	t.Helper()
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))
}

// drainSession blocks until the Session's Result channel yields, draining
// Messages in the background so the backend goroutines don't deadlock on a
// full buffer.
func drainSession(t *testing.T, sess *Session, deadline time.Duration) Result {
	t.Helper()
	done := make(chan struct{})
	go func() {
		for range sess.Messages {
		}
		close(done)
	}()
	select {
	case r := <-sess.Result:
		<-done
		return r
	case <-time.After(deadline):
		t.Fatalf("timed out waiting for Result")
		return Result{}
	}
}

func newTestBackend(t *testing.T, execPath string, idle time.Duration) *claudePersistentBackend {
	t.Helper()
	b := newClaudePersistentBackend(Config{
		ExecutablePath: execPath,
		Logger:         slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError})),
	})
	if idle > 0 {
		b.idleTimeout = idle
	}
	return b
}

// ── Registration ──

func TestClaudePersistentRegisteredInNew(t *testing.T) {
	t.Parallel()
	b, err := New("claude-persistent", Config{ExecutablePath: "/nonexistent/claude"})
	if err != nil {
		t.Fatalf("New(claude-persistent): %v", err)
	}
	if _, ok := b.(*claudePersistentBackend); !ok {
		t.Fatalf("expected *claudePersistentBackend, got %T", b)
	}
}

func TestExecOptionsSessionKeyZeroValue(t *testing.T) {
	t.Parallel()
	opts := ExecOptions{}
	if opts.SessionKey != "" {
		t.Errorf("zero value SessionKey should be empty, got %q", opts.SessionKey)
	}
}

// ── Pool semantics ──

func TestClaudePersistentSessionKeyPoolReuse(t *testing.T) {
	dir := t.TempDir()
	execPath := writeFakeClaude(t, dir)
	prependPATH(t, dir)

	b := newTestBackend(t, execPath, 0)

	ctx := context.Background()
	sess1, err := b.Execute(ctx, "hello one", ExecOptions{SessionKey: "k1", Timeout: 5 * time.Second})
	if err != nil {
		t.Fatalf("first Execute: %v", err)
	}
	r1 := drainSession(t, sess1, 5*time.Second)
	if r1.Status != "completed" {
		t.Fatalf("first turn status: got %q, want completed — err=%q", r1.Status, r1.Error)
	}

	pid1, ok := b.sessionPID("k1")
	if !ok || pid1 == 0 {
		t.Fatalf("session k1 not in pool after first turn (pid=%d ok=%v)", pid1, ok)
	}

	sess2, err := b.Execute(ctx, "hello two", ExecOptions{SessionKey: "k1", Timeout: 5 * time.Second})
	if err != nil {
		t.Fatalf("second Execute: %v", err)
	}
	r2 := drainSession(t, sess2, 5*time.Second)
	if r2.Status != "completed" {
		t.Fatalf("second turn status: got %q", r2.Status)
	}

	pid2, ok := b.sessionPID("k1")
	if !ok {
		t.Fatalf("session k1 vanished from pool")
	}
	if pid1 != pid2 {
		t.Errorf("expected PID reuse — first=%d second=%d", pid1, pid2)
	}
	if got := b.sessionCount(); got != 1 {
		t.Errorf("sessionCount: got %d, want 1", got)
	}

	// Shutdown for cleanup.
	b.mu.RLock()
	s := b.sessions["k1"]
	b.mu.RUnlock()
	if s != nil {
		s.shutdownProcess()
	}
}

func TestClaudePersistentEphemeralKeyIsolated(t *testing.T) {
	dir := t.TempDir()
	execPath := writeFakeClaude(t, dir)
	prependPATH(t, dir)

	b := newTestBackend(t, execPath, 0)
	ctx := context.Background()

	for i := 0; i < 2; i++ {
		sess, err := b.Execute(ctx, fmt.Sprintf("ephemeral %d", i), ExecOptions{Timeout: 5 * time.Second})
		if err != nil {
			t.Fatalf("Execute #%d: %v", i, err)
		}
		r := drainSession(t, sess, 5*time.Second)
		if r.Status != "completed" {
			t.Fatalf("turn #%d status: got %q err=%q", i, r.Status, r.Error)
		}
	}

	if got := b.sessionCount(); got != 0 {
		t.Errorf("empty-key calls must not populate pool; got count=%d", got)
	}
}

func TestClaudePersistentSessionDeathEvictsFromPool(t *testing.T) {
	dir := t.TempDir()
	execPath := writeFakeClaude(t, dir)
	prependPATH(t, dir)

	b := newTestBackend(t, execPath, 0)
	ctx := context.Background()

	sess, err := b.Execute(ctx, "first", ExecOptions{SessionKey: "die", Timeout: 5 * time.Second})
	if err != nil {
		t.Fatalf("first Execute: %v", err)
	}
	if r := drainSession(t, sess, 5*time.Second); r.Status != "completed" {
		t.Fatalf("first turn status: got %q", r.Status)
	}

	pid1, ok := b.sessionPID("die")
	if !ok {
		t.Fatalf("session not in pool after first turn")
	}

	// Kill the fake process and wait for it to be evicted.
	b.mu.RLock()
	s := b.sessions["die"]
	b.mu.RUnlock()
	if s == nil || s.cmd.Process == nil {
		t.Fatalf("no live process to kill")
	}
	_ = s.cmd.Process.Kill()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if b.sessionCount() == 0 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if b.sessionCount() != 0 {
		t.Fatalf("dead session was not evicted from pool")
	}

	// Next call must spawn a new PID.
	sess, err = b.Execute(ctx, "second", ExecOptions{SessionKey: "die", Timeout: 5 * time.Second})
	if err != nil {
		t.Fatalf("second Execute: %v", err)
	}
	if r := drainSession(t, sess, 5*time.Second); r.Status != "completed" {
		t.Fatalf("second turn status: got %q", r.Status)
	}
	pid2, ok := b.sessionPID("die")
	if !ok || pid2 == pid1 {
		t.Errorf("expected fresh PID after death — pid1=%d pid2=%d ok=%v", pid1, pid2, ok)
	}

	b.mu.RLock()
	s = b.sessions["die"]
	b.mu.RUnlock()
	if s != nil {
		s.shutdownProcess()
	}
}

func TestClaudePersistentIdleCleanup(t *testing.T) {
	dir := t.TempDir()
	execPath := writeFakeClaude(t, dir)
	prependPATH(t, dir)

	b := newTestBackend(t, execPath, 200*time.Millisecond)
	ctx := context.Background()

	sess, err := b.Execute(ctx, "hi", ExecOptions{SessionKey: "idle", Timeout: 5 * time.Second})
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if r := drainSession(t, sess, 5*time.Second); r.Status != "completed" {
		t.Fatalf("turn status: got %q", r.Status)
	}

	// Wait for idle timer to fire and evict.
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if b.sessionCount() == 0 {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Errorf("idle timer did not evict session; count=%d", b.sessionCount())
}

func TestClaudePersistentExecuteMissingBinary(t *testing.T) {
	t.Parallel()
	b := newClaudePersistentBackend(Config{
		ExecutablePath: "/definitely/does/not/exist/claude",
		Logger:         slog.Default(),
	})
	_, err := b.Execute(context.Background(), "hi", ExecOptions{})
	if err == nil {
		t.Fatal("expected error for missing binary")
	}
}
