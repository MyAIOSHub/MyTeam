package tools

import (
	"context"
	"testing"

	"github.com/multica-ai/multica/server/internal/mcp/mcptool"
	"github.com/multica-ai/multica/server/internal/service"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

func TestCompleteTask_HappyPath(t *testing.T) {
	q := testDB(t)
	env := setupTaskEnv(t, q)
	ctx := context.Background()

	// Drive the scheduler to create an Execution row + assign the agent.
	if err := buildScheduler(q).ScheduleRun(ctx,
		pgxToUUID(t, env.PlanID),
		pgxToUUID(t, env.RunID),
	); err != nil {
		t.Fatalf("ScheduleRun: %v", err)
	}

	res, err := CompleteTask{}.Exec(ctx, q, mcptool.Context{
		WorkspaceID: pgxToUUID(t, env.WorkspaceID),
		UserID:      pgxToUUID(t, env.OwnerID),
		AgentID:     pgxToUUID(t, env.AgentID),
		RuntimeMode: mcptool.RuntimeCloud,
	}, map[string]any{
		"task_id": pgxToUUID(t, env.TaskID).String(),
		"result":  map[string]any{"output": "done"},
	})
	if err != nil {
		t.Fatalf("Exec: %v", err)
	}
	if len(res.Errors) > 0 {
		t.Fatalf("unexpected errors: %v (note=%s)", res.Errors, res.Note)
	}

	data, ok := res.Data.(map[string]any)
	if !ok {
		t.Fatalf("expected map result, got %T", res.Data)
	}
	if data["status"] != service.TaskStatusCompleted {
		t.Errorf("status: want completed, got %v", data["status"])
	}

	// Confirm the underlying task row matches and an artifact was created.
	got, err := q.GetTask(ctx, env.TaskID)
	if err != nil {
		t.Fatalf("GetTask: %v", err)
	}
	if got.Status != service.TaskStatusCompleted {
		t.Errorf("task row status: want completed, got %s", got.Status)
	}
	pool := openTestPool(t)
	var artifactCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM artifact WHERE task_id = $1`, env.TaskID).Scan(&artifactCount); err != nil {
		t.Fatalf("count artifacts: %v", err)
	}
	if artifactCount < 1 {
		t.Errorf("expected >= 1 artifact, got %d", artifactCount)
	}
}

func TestCompleteTask_DeniesUnrelatedAgent(t *testing.T) {
	q := testDB(t)
	env := setupTaskEnv(t, q)
	ctx := context.Background()

	// Create a separate agent with no relationship to the task.
	other, err := q.CreatePersonalAgent(ctx, db.CreatePersonalAgentParams{
		WorkspaceID: env.WorkspaceID,
		Name:        "Outsider",
		Description: "no relation to task",
		RuntimeID:   env.RuntimeID,
		OwnerID:     env.OwnerID,
	})
	if err != nil {
		t.Fatalf("create other agent: %v", err)
	}

	res, err := CompleteTask{}.Exec(ctx, q, mcptool.Context{
		WorkspaceID: pgxToUUID(t, env.WorkspaceID),
		UserID:      pgxToUUID(t, env.OwnerID),
		AgentID:     pgxToUUID(t, other.ID),
		RuntimeMode: mcptool.RuntimeCloud,
	}, map[string]any{
		"task_id": pgxToUUID(t, env.TaskID).String(),
		"result":  map[string]any{},
	})
	if err != nil {
		t.Fatalf("Exec: %v", err)
	}
	if len(res.Errors) == 0 || res.Errors[0] != "MCP_PERMISSION_DENIED" {
		t.Fatalf("expected MCP_PERMISSION_DENIED, got %v note=%s", res.Errors, res.Note)
	}
}
