// Package memory: types.go — canonical Memory record + supporting
// types. This is THE shape that local-agent and cloud-agent both speak
// per the user-supplied reference doc §四 ("最关键的不是同步，而是
// '统一记忆模型'").
//
// Hard rule (per user 2026-04-19):
//   - Raw data MUST be preserved. Memory NEVER stores the original
//     content — RawRef points at it (file_index, thread_context_item,
//     message, artifact). Memory.Body is the derived/summary form.
package memory

import (
	"time"

	"github.com/google/uuid"
)

// MemoryType mirrors the user reference doc §四. fact / summary /
// transcript / task / decision / profile / context.
type MemoryType string

const (
	TypeFact       MemoryType = "fact"
	TypeSummary    MemoryType = "summary"
	TypeTranscript MemoryType = "transcript"
	TypeTask       MemoryType = "task"
	TypeDecision   MemoryType = "decision"
	TypeProfile    MemoryType = "profile"
	TypeContext    MemoryType = "context"
)

// MemoryScope drives cloud-vs-local sync. Per reference §六 ("做权限
// 与分层"). private_local stays on the local node, shared_summary syncs
// up after confirmation, team is workspace-wide, agent_state is
// scheduler/run state, archive is read-only history.
type MemoryScope string

const (
	ScopePrivateLocal  MemoryScope = "private_local"
	ScopeSharedSummary MemoryScope = "shared_summary"
	ScopeTeam          MemoryScope = "team"
	ScopeAgentState    MemoryScope = "agent_state"
	ScopeArchive       MemoryScope = "archive"
)

// MemoryStatus is the candidate→confirmed→archived flow per reference
// §七.4. Agents write candidates; humans (or rules) promote.
type MemoryStatus string

const (
	StatusCandidate MemoryStatus = "candidate"
	StatusConfirmed MemoryStatus = "confirmed"
	StatusArchived  MemoryStatus = "archived"
)

// RawKind enumerates the tables a Memory may point at. Polymorphic FK
// (no SQL constraint) so the service layer must validate existence on
// Append. Per plan §2 risk #2 a future cleanup job lists orphans.
type RawKind string

const (
	RawFileIndex         RawKind = "file_index"
	RawThreadContextItem RawKind = "thread_context_item"
	RawMessage           RawKind = "message"
	RawArtifact          RawKind = "artifact"
)

// RawRef is the pointer to the raw row. ID's table is RawKind.
type RawRef struct {
	Kind RawKind   `json:"kind"`
	ID   uuid.UUID `json:"id"`
}

// Memory is the canonical record. Mirrors memory_record table
// (migration 065, Phase 2). All fields except CreatedAt/UpdatedAt are
// caller-controlled.
type Memory struct {
	ID          uuid.UUID    `json:"id"`
	WorkspaceID uuid.UUID    `json:"workspace_id"`
	Type        MemoryType   `json:"type"`
	Scope       MemoryScope  `json:"scope"`
	Source      string       `json:"source"` // meeting | chat | manual | file | agent
	Raw         RawRef       `json:"raw"`
	Summary     string       `json:"summary,omitempty"`
	Body        string       `json:"body,omitempty"`
	Tags        []string     `json:"tags"`
	Entities    []string     `json:"entities"`
	Confidence  float64      `json:"confidence"`
	Status      MemoryStatus `json:"status"`
	Version     int          `json:"version"`
	CreatedBy   uuid.UUID    `json:"created_by"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
}
