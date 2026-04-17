package handler

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

// compatTestChannel creates a fresh channel bound to the test workspace and
// registers a cleanup hook. Returns the channel ID.
func compatTestChannel(t *testing.T, ctx context.Context, name string) string {
	t.Helper()
	var channelID string
	err := testPool.QueryRow(ctx,
		`INSERT INTO channel (workspace_id, name, description, created_by, created_by_type)
		 VALUES ($1, $2, '', $3, 'member') RETURNING id`,
		testWorkspaceID, name, testUserID,
	).Scan(&channelID)
	if err != nil {
		t.Fatalf("compatTestChannel: insert channel failed: %v", err)
	}
	t.Cleanup(func() {
		testPool.Exec(context.Background(), `DELETE FROM channel WHERE id = $1`, channelID)
	})
	return channelID
}

// compatTestThread creates an empty thread on the given channel and returns
// its ID. Channel deletion cascades so no per-thread cleanup is registered.
func compatTestThread(t *testing.T, ctx context.Context, channelID string) string {
	t.Helper()
	thread, err := testHandler.Queries.CreateThread(ctx, db.CreateThreadParams{
		ChannelID:   parseUUID(channelID),
		WorkspaceID: parseUUID(testWorkspaceID),
	})
	if err != nil {
		t.Fatalf("compatTestThread: CreateThread failed: %v", err)
	}
	return uuidToString(thread.ID)
}

// TestIncrementThreadCounters_Member verifies that a "member" sender bumps
// thread.reply_count and updates last_reply_at.
func TestIncrementThreadCounters_Member(t *testing.T) {
	ctx := context.Background()

	channelID := compatTestChannel(t, ctx, "compat-counters-member")
	threadIDStr := compatTestThread(t, ctx, channelID)
	threadID := parseUUID(threadIDStr)

	before, err := testHandler.Queries.GetThread(ctx, threadID)
	if err != nil {
		t.Fatalf("GetThread (before): %v", err)
	}

	testHandler.incrementThreadCounters(ctx, threadID, "member")

	after, err := testHandler.Queries.GetThread(ctx, threadID)
	if err != nil {
		t.Fatalf("GetThread (after): %v", err)
	}
	if after.ReplyCount != before.ReplyCount+1 {
		t.Fatalf("reply_count: expected %d, got %d", before.ReplyCount+1, after.ReplyCount)
	}
	if !after.LastReplyAt.Valid {
		t.Fatalf("last_reply_at: expected non-null after member post, got null")
	}
	if before.LastReplyAt.Valid && !after.LastReplyAt.Time.After(before.LastReplyAt.Time) {
		t.Fatalf("last_reply_at: expected to advance, got %v -> %v", before.LastReplyAt.Time, after.LastReplyAt.Time)
	}
}

// TestIncrementThreadCounters_System verifies that a "system" sender leaves
// reply_count unchanged but still advances last_activity_at.
func TestIncrementThreadCounters_System(t *testing.T) {
	ctx := context.Background()

	channelID := compatTestChannel(t, ctx, "compat-counters-system")
	threadIDStr := compatTestThread(t, ctx, channelID)
	threadID := parseUUID(threadIDStr)

	before, err := testHandler.Queries.GetThread(ctx, threadID)
	if err != nil {
		t.Fatalf("GetThread (before): %v", err)
	}

	// Sleep-free: rely on now() monotonic within the same transaction —
	// TouchThreadActivity uses now() which always advances between queries.
	testHandler.incrementThreadCounters(ctx, threadID, "system")

	after, err := testHandler.Queries.GetThread(ctx, threadID)
	if err != nil {
		t.Fatalf("GetThread (after): %v", err)
	}
	if after.ReplyCount != before.ReplyCount {
		t.Fatalf("reply_count: expected UNCHANGED (%d) for system sender, got %d", before.ReplyCount, after.ReplyCount)
	}
	if !after.LastActivityAt.Valid {
		t.Fatalf("last_activity_at: expected non-null after system touch, got null")
	}
	if before.LastActivityAt.Valid && after.LastActivityAt.Time.Before(before.LastActivityAt.Time) {
		t.Fatalf("last_activity_at: expected to advance or match, got %v -> %v", before.LastActivityAt.Time, after.LastActivityAt.Time)
	}
}

// TestIncrementThreadCounters_InvalidThread verifies that passing an invalid
// UUID is a no-op (no panic, no DB error).
func TestIncrementThreadCounters_InvalidThread(t *testing.T) {
	ctx := context.Background()
	// Invalid pgtype.UUID (Valid=false) must be ignored.
	testHandler.incrementThreadCounters(ctx, pgtype.UUID{}, "member")
}
