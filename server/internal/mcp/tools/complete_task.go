package tools

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/multica-ai/multica/server/internal/mcp/mcptool"
	"github.com/multica-ai/multica/server/internal/service"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

// CompleteTask marks a task as complete with a result payload, routing
// the cascade through SchedulerService.HandleTaskCompletion. Direct
// task.status mutation would skip slot activation, downstream task
// scheduling, and run-completion checks.
//
// Auth: caller agent must be the task's actual_agent_id OR primary_assignee_id
// (cross-cutting PRD §7.2).
type CompleteTask struct{}

func (CompleteTask) Name() string { return "complete_task" }

func (CompleteTask) InputSchema() any {
	return map[string]any{
		"type":     "object",
		"required": []string{"task_id", "result"},
		"properties": map[string]any{
			"task_id":      map[string]string{"type": "string", "format": "uuid"},
			"execution_id": map[string]string{"type": "string", "format": "uuid"},
			"result":       map[string]any{"type": "object"},
		},
	}
}

func (CompleteTask) RuntimeModes() []string {
	return []string{mcptool.RuntimeLocal, mcptool.RuntimeCloud}
}

func (CompleteTask) Exec(ctx context.Context, q *db.Queries, ws mcptool.Context, args map[string]any) (mcptool.Result, error) {
	taskID, err := uuidArg(args, "task_id")
	if err != nil {
		return mcptool.Result{}, err
	}
	result, _ := mapArg(args, "result") // tolerated empty by HandleTaskCompletion

	task, deny, err := ensureAgentOnTask(ctx, q, ws, taskID)
	if err != nil {
		return mcptool.Result{}, err
	}
	if deny.Note != "" {
		return deny, nil
	}

	// Resolve the execution_id: prefer the explicit arg, otherwise pick
	// the most-recent execution for the task. SchedulerService tolerates
	// uuid.Nil but we surface the chosen id back so callers can audit.
	execID, err := optionalUUIDArg(args, "execution_id")
	if err != nil {
		return mcptool.Result{}, err
	}
	if execID == uuid.Nil {
		execs, err := q.ListExecutionsByTask(ctx, task.ID)
		if err != nil {
			return mcptool.Result{}, fmt.Errorf("list executions: %w", err)
		}
		if len(execs) > 0 {
			// ListExecutionsByTask orders newest-first per execution.sql.
			execID = uuid.UUID(execs[0].ID.Bytes)
		}
	}

	scheduler := buildScheduler(q)
	if err := scheduler.HandleTaskCompletion(ctx, taskID, execID, result); err != nil {
		return mcptool.Result{}, fmt.Errorf("handle task completion: %w", err)
	}

	// Reload the task so callers see the post-cascade status.
	updated, err := q.GetTask(ctx, toPgUUID(taskID))
	if err != nil {
		return mcptool.Result{}, fmt.Errorf("reload task: %w", err)
	}
	return mcptool.Result{Data: completeTaskPayload(updated, execID)}, nil
}

// buildScheduler constructs a SchedulerService instance from the *db.Queries
// available to MCP tools. Bus + Hub are nil — the scheduler tolerates that
// (events / WS broadcasts become silent no-ops). MCP callers operate at the
// daemon/cloud-executor layer and do not own a Bus/Hub reference.
func buildScheduler(q *db.Queries) *service.SchedulerService {
	slots := service.NewSlotService(q)
	artifacts := service.NewArtifactService(q)
	reviews := service.NewReviewService(q, slots)
	quota := service.NewQuotaService(q)
	return service.NewSchedulerService(q, slots, artifacts, reviews, quota, nil, nil)
}

// completeTaskPayload is the JSON returned to the MCP caller after the
// scheduler cascade runs. Includes the new task status so callers know
// whether the task fully completed or moved to under_review.
func completeTaskPayload(task db.Task, execID uuid.UUID) map[string]any {
	out := map[string]any{
		"task_id": uuid.UUID(task.ID.Bytes).String(),
		"status":  task.Status,
	}
	if execID != uuid.Nil {
		out["execution_id"] = execID.String()
	}
	if task.RunID.Valid {
		out["run_id"] = uuid.UUID(task.RunID.Bytes).String()
	}
	if task.CompletedAt.Valid {
		out["completed_at"] = task.CompletedAt.Time
	}
	return out
}
