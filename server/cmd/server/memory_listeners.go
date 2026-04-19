package main

import (
	"log/slog"

	"github.com/multica-ai/multica/server/internal/events"
	"github.com/multica-ai/multica/server/internal/service/memory"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

// registerMemoryListeners wires bus subscribers for memory lifecycle
// events (memory.appended / memory.confirmed / memory.archived). Phase M
// of the memory plan: scope-based sync. Per the user-supplied
// reference doc §三 ("通过事件总线同步"), memory.confirmed is the
// gate that lets a non-private memory escalate to the cloud-shared
// surface — handlers wired here can promote / fan-out / audit without
// the writer (memory.Service.Promote) knowing about them.
//
// Current handlers:
//   memory.confirmed  →  scope-based sync log + analytics hook point
//   memory.archived   →  retention audit (placeholder)
//   memory.appended   →  no-op (audit-writer subscribes via SubscribeAll
//                        in registerActivityListeners; no scope work)
//
// All handlers are best-effort: errors are logged, never re-published.
// The Bus already recovers from panics per bus.go.
func registerMemoryListeners(bus *events.Bus, _ *db.Queries) {
	bus.Subscribe(memory.EventMemoryConfirmed, func(e events.Event) {
		payload, ok := e.Payload.(map[string]any)
		if !ok {
			return
		}
		scope, _ := payload["scope"].(string)
		switch memory.MemoryScope(scope) {
		case memory.ScopePrivateLocal:
			// Per reference doc: private memories stay local. Skip.
			return
		case memory.ScopeSharedSummary,
			memory.ScopeTeam,
			memory.ScopeAgentState,
			memory.ScopeArchive:
			// Sharable scopes — log the confirmation. A future
			// cloud-sync handler hooks here to write a derived row
			// to the cross-org store; today the local memory_record
			// IS the source of truth, so this is just observability.
			slog.Info("memory: confirmed for sharable scope",
				"workspace_id", e.WorkspaceID,
				"memory_id", payload["memory_id"],
				"type", payload["type"],
				"scope", scope,
				"raw_kind", payload["raw_kind"],
				"version", payload["version"],
			)
		default:
			slog.Warn("memory: confirmed with unknown scope",
				"workspace_id", e.WorkspaceID,
				"memory_id", payload["memory_id"],
				"scope", scope,
			)
		}
	})

	bus.Subscribe(memory.EventMemoryArchived, func(e events.Event) {
		payload, ok := e.Payload.(map[string]any)
		if !ok {
			return
		}
		slog.Info("memory: archived",
			"workspace_id", e.WorkspaceID,
			"memory_id", payload["memory_id"],
			"type", payload["type"],
		)
	})
}
