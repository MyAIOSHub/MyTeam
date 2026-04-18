// Package tools: helpers.go — shared utilities for the MCP tool
// implementations. Currently exposes the per-task agent permission check
// required by the cross-cutting PRD §7.2: an agent may only act on a task
// when it is the task's actual_agent_id OR primary_assignee_id.
package tools

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/multica-ai/multica/server/internal/errcode"
	"github.com/multica-ai/multica/server/internal/mcp/mcptool"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

// errArgMissing is returned when a required tool argument is absent.
var errArgMissing = errors.New("required argument missing")

// stringArg pulls a string-typed arg out of the args map. Empty/missing
// returns the zero value and ok=false so callers can decide whether to
// treat it as an error or default.
func stringArg(args map[string]any, key string) (string, bool) {
	v, ok := args[key]
	if !ok {
		return "", false
	}
	s, ok := v.(string)
	if !ok || s == "" {
		return "", false
	}
	return s, true
}

// uuidArg parses a uuid argument from the args map. Missing/invalid
// returns uuid.Nil and a typed error so callers can short-circuit.
func uuidArg(args map[string]any, key string) (uuid.UUID, error) {
	s, ok := stringArg(args, key)
	if !ok {
		return uuid.Nil, fmt.Errorf("%w: %s", errArgMissing, key)
	}
	u, err := uuid.Parse(s)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid uuid %s: %w", key, err)
	}
	return u, nil
}

// optionalUUIDArg parses a uuid argument when present. Missing returns
// uuid.Nil with no error; invalid still errors so we never silently drop
// a malformed FK.
func optionalUUIDArg(args map[string]any, key string) (uuid.UUID, error) {
	s, ok := stringArg(args, key)
	if !ok {
		return uuid.Nil, nil
	}
	u, err := uuid.Parse(s)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid uuid %s: %w", key, err)
	}
	return u, nil
}

// mapArg pulls a map-typed (JSON object) arg out of the args map. Missing
// returns nil, false so callers may default to an empty payload.
func mapArg(args map[string]any, key string) (map[string]any, bool) {
	v, ok := args[key]
	if !ok {
		return nil, false
	}
	m, ok := v.(map[string]any)
	if !ok {
		return nil, false
	}
	return m, true
}

// permissionDenied is the canonical "agent not allowed on this task"
// result. Callers should return this (with a nil error) to surface
// MCP_PERMISSION_DENIED to the caller without aborting the dispatcher.
func permissionDenied(note string) mcptool.Result {
	return mcptool.Result{
		Errors: []string{errcode.MCPPermissionDenied.Code},
		Note:   note,
	}
}

// notFoundResult is the canonical "row missing" result. Used for tasks
// and attachments referenced by id when the lookup misses.
func notFoundResult(kind string) mcptool.Result {
	return mcptool.Result{
		Errors: []string{kind + "_NOT_FOUND"},
		Note:   kind + " not found",
	}
}

// ensureAgentOnTask enforces cross-cutting PRD §7.2: an agent may act on
// a task only when it is the task's actual_agent_id OR primary_assignee_id.
// Workspace membership is NOT checked here — the dispatcher must establish
// that separately. Returns the loaded Task on success so callers can reuse
// it without a second GetTask query.
//
// When ws.AgentID is uuid.Nil (i.e. the call originated from a human
// interaction, not an agent execution) the check is skipped — those calls
// are gated by EnsureWorkspaceMember at the dispatcher layer.
//
// Returns (task, denyResult, err). When denyResult.Note is non-empty the
// caller MUST return denyResult immediately and skip its own logic.
func ensureAgentOnTask(ctx context.Context, q *db.Queries, ws mcptool.Context, taskID uuid.UUID) (db.Task, mcptool.Result, error) {
	task, err := q.GetTask(ctx, toPgUUID(taskID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.Task{}, notFoundResult("TASK"), nil
		}
		return db.Task{}, mcptool.Result{}, fmt.Errorf("get task: %w", err)
	}

	// Workspace check first: even if the agent is the task's actual_agent,
	// they cannot operate on a task in a different workspace.
	if task.WorkspaceID.Valid && task.WorkspaceID.Bytes != ws.WorkspaceID {
		return db.Task{}, permissionDenied("task does not belong to caller workspace"), nil
	}

	if ws.AgentID == uuid.Nil {
		// Human-initiated call; assume dispatcher already enforced
		// workspace membership. Cross-cutting PRD §7.2 only applies to
		// agent executions.
		return task, mcptool.Result{}, nil
	}

	agentBytes := ws.AgentID
	if task.ActualAgentID.Valid && task.ActualAgentID.Bytes == agentBytes {
		return task, mcptool.Result{}, nil
	}
	if task.PrimaryAssigneeID.Valid && task.PrimaryAssigneeID.Bytes == agentBytes {
		return task, mcptool.Result{}, nil
	}
	return db.Task{}, permissionDenied("agent is not actual_agent_id or primary_assignee_id of task"), nil
}

// toPgUUID converts a non-nil uuid.UUID to a valid pgtype.UUID. Mirror of
// service/activity.go toPgUUID; lives here so the tools package does not
// depend on the service package.
func toPgUUID(u uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: u, Valid: true}
}

// toPgNullUUID converts a possibly-nil uuid.UUID to pgtype.UUID;
// uuid.Nil becomes Valid=false (NULL).
func toPgNullUUID(u uuid.UUID) pgtype.UUID {
	if u == uuid.Nil {
		return pgtype.UUID{}
	}
	return pgtype.UUID{Bytes: u, Valid: true}
}

// toPgNullText converts a possibly-empty string to pgtype.Text;
// empty becomes Valid=false (NULL).
func toPgNullText(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}
