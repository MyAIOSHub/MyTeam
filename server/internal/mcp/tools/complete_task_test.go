package tools

import (
	"context"
	"reflect"
	"testing"

	"github.com/multica-ai/multica/server/internal/events"
	"github.com/multica-ai/multica/server/internal/mcp/mcptool"
	"github.com/multica-ai/multica/server/internal/realtime"
	"github.com/multica-ai/multica/server/internal/service"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

func TestCompleteTask_HappyPath(t *testing.T) {
	q := testDB(t)
	env := setupTaskEnv(t, q)
	ctx := context.Background()

	// Drive the scheduler to create an Execution row + assign the agent.
	if err := buildScheduler(q, nil, nil).ScheduleRun(ctx,
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

	// Create a separate agent (different owner — migration 062 added a
	// (workspace_id, owner_id, agent_type='personal_agent') unique
	// constraint, so we need a fresh user) with no relationship to the task.
	otherUser, err := q.CreateUser(ctx, db.CreateUserParams{
		Name:  "Outsider " + t.Name(),
		Email: "outsider+" + uniqSuffix(t) + "@example.com",
	})
	if err != nil {
		t.Fatalf("create outsider user: %v", err)
	}
	other, err := q.CreatePersonalAgent(ctx, db.CreatePersonalAgentParams{
		WorkspaceID: env.WorkspaceID,
		Name:        "Outsider",
		Description: "no relation to task",
		RuntimeID:   env.RuntimeID,
		OwnerID:     otherUser.ID,
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

func TestCompleteTask_PublishesStatusChangeWhenBusIsWired(t *testing.T) {
	q := testDB(t)
	env := setupTaskEnv(t, q)
	ctx := context.Background()

	bus := events.New()
	hub := realtime.NewHub()
	var seen []events.Event
	bus.SubscribeAll(func(e events.Event) {
		seen = append(seen, e)
	})

	if err := buildScheduler(q, bus, hub).ScheduleRun(ctx,
		pgxToUUID(t, env.PlanID),
		pgxToUUID(t, env.RunID),
	); err != nil {
		t.Fatalf("ScheduleRun: %v", err)
	}
	before := len(seen)

	res, err := CompleteTask{}.Exec(ctx, q, mcptool.Context{
		WorkspaceID: pgxToUUID(t, env.WorkspaceID),
		UserID:      pgxToUUID(t, env.OwnerID),
		AgentID:     pgxToUUID(t, env.AgentID),
		RuntimeMode: mcptool.RuntimeCloud,
		Bus:         bus,
		Hub:         hub,
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

	if len(seen) <= before {
		t.Fatalf("expected bus events after completion, got %d before and %d after", before, len(seen))
	}
	found := false
	for _, e := range seen[before:] {
		if e.Type != "task:status_changed" {
			continue
		}
		payload, ok := e.Payload.(map[string]any)
		if !ok {
			t.Fatalf("expected task payload map, got %T", e.Payload)
		}
		if payload["task_id"] != pgxToUUID(t, env.TaskID).String() {
			continue
		}
		if payload["to"] != service.TaskStatusCompleted {
			t.Fatalf("status change payload: want completed, got %v", payload["to"])
		}
		found = true
		break
	}
	if !found {
		t.Fatalf("expected task:status_changed completed event in %+v", seen[before:])
	}
	if data, ok := res.Data.(map[string]any); !ok || !reflect.DeepEqual(data["status"], service.TaskStatusCompleted) {
		t.Fatalf("expected completed payload, got %+v", res.Data)
	}
}
