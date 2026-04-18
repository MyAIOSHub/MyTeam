package handler

import (
	"context"
	"log/slog"
	"net/http"
)

// ---------------------------------------------------------------------------
// MetricsResponse represents the aggregated workspace metrics.
// ---------------------------------------------------------------------------

type MetricsResponse struct {
	AgentResponseRate  *float64 `json:"agent_response_rate"`
	TaskCompletionRate *float64 `json:"task_completion_rate"`
	AverageTaskDuration *float64 `json:"average_task_duration_seconds"`
	TimeoutRate        *float64 `json:"timeout_rate"`
	ActiveProjects     int64    `json:"active_projects"`
	ActiveRuns         int64    `json:"active_runs"`
	PendingEscalations int64    `json:"pending_escalations"`
}

// ---------------------------------------------------------------------------
// GetWorkspaceMetrics — GET /api/metrics
//
// Returns aggregated metrics for the workspace:
// - agent_response_rate: responded / total needing response
// - task_completion_rate: completed / (completed + failed + cancelled)
// - average_task_duration: avg(completed_at - started_at) in seconds
// - timeout_rate: timed_out / total_dispatched
// - active_projects: count of running projects
// - active_runs: count of running project_runs
// - pending_escalations: count of inbox items with action_required and pending
// ---------------------------------------------------------------------------

func (h *Handler) GetWorkspaceMetrics(w http.ResponseWriter, r *http.Request) {
	_, ok := requireUserID(w, r)
	if !ok {
		return
	}

	workspaceID := resolveWorkspaceID(r)
	if workspaceID == "" {
		writeError(w, http.StatusBadRequest, "workspace_id is required")
		return
	}

	ctx := r.Context()
	wsUUID := parseUUID(workspaceID)

	metrics := MetricsResponse{}

	// Task completion rate: completed / (completed + failed + cancelled)
	metrics.TaskCompletionRate = h.queryTaskCompletionRate(ctx, workspaceID)

	// Average task duration: avg(completed_at - started_at) for completed steps
	metrics.AverageTaskDuration = h.queryAverageTaskDuration(ctx, workspaceID)

	// Timeout rate: timed_out / total_dispatched
	metrics.TimeoutRate = h.queryTimeoutRate(ctx, workspaceID)

	// Pending escalations: inbox items with action_required = true and resolution_status = 'pending'
	metrics.PendingEscalations = h.queryPendingEscalations(ctx, wsUUID)

	// TODO: Active projects and runs require project/project_run tables.
	// Once those tables exist, uncomment:
	//   metrics.ActiveProjects = h.queryActiveProjects(ctx, workspaceID)
	//   metrics.ActiveRuns = h.queryActiveRuns(ctx, workspaceID)

	// Agent response rate requires message assignment tracking (future).
	// metrics.AgentResponseRate = h.queryAgentResponseRate(ctx, workspaceID)

	writeJSON(w, http.StatusOK, metrics)
}

// queryTaskCompletionRate previously read completed/failed/cancelled counts
// from the workflow_step table. Migration 059 dropped that table.
//
// TODO(plan5): replace with task/execution metrics in Batch D once the
// new Task and Execution surfaces are in place.
func (h *Handler) queryTaskCompletionRate(ctx context.Context, workspaceID string) *float64 {
	_ = ctx
	_ = workspaceID
	return nil
}

// queryAverageTaskDuration previously averaged completed_at - started_at
// over workflow_step rows. Migration 059 dropped that table.
//
// TODO(plan5): replace with task/execution metrics in Batch D.
func (h *Handler) queryAverageTaskDuration(ctx context.Context, workspaceID string) *float64 {
	_ = ctx
	_ = workspaceID
	return nil
}

// queryTimeoutRate previously divided timed_out by total dispatched workflow
// steps. Migration 059 dropped that table.
//
// TODO(plan5): replace with task/execution metrics in Batch D.
func (h *Handler) queryTimeoutRate(ctx context.Context, workspaceID string) *float64 {
	_ = ctx
	_ = workspaceID
	return nil
}

// queryPendingEscalations counts inbox items with action_required = true
// and resolution_status = 'pending'.
func (h *Handler) queryPendingEscalations(ctx context.Context, workspaceID interface{}) int64 {
	if h.DB == nil {
		return 0
	}

	// Use a raw query since the inbox_item table may not yet have the
	// action_required and resolution_status columns. This will gracefully
	// return 0 if the columns don't exist.
	query := `
		SELECT COUNT(*)
		FROM inbox_item
		WHERE workspace_id = $1
		  AND action_required = true
		  AND resolution_status = 'pending'
	`

	var count int64
	err := h.DB.QueryRow(ctx, query, workspaceID).Scan(&count)
	if err != nil {
		// Columns may not exist yet; return 0.
		slog.Debug("metrics: failed to query pending escalations", "error", err)
		return 0
	}

	return count
}
