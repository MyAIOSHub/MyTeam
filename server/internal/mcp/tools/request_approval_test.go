package tools

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/multica-ai/multica/server/internal/mcp/mcptool"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

func TestRequestApproval_HappyPath(t *testing.T) {
	q := testDB(t)
	env := setupTaskEnv(t, q)
	ctx := context.Background()

	res, err := RequestApproval{}.Exec(ctx, q, mcptool.Context{
		WorkspaceID: pgxToUUID(t, env.WorkspaceID),
		UserID:      pgxToUUID(t, env.OwnerID),
		AgentID:     pgxToUUID(t, env.AgentID),
		RuntimeMode: mcptool.RuntimeCloud,
	}, map[string]any{
		"task_id": pgxToUUID(t, env.TaskID).String(),
		"slot_id": uuid.Nil.String(),
		"context": "needs human go/no-go before deploy",
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
	if data["recipient_id"] != pgxToUUID(t, env.OwnerID).String() {
		t.Errorf("recipient_id: want owner %s, got %v", pgxToUUID(t, env.OwnerID).String(), data["recipient_id"])
	}
	inboxIDStr, _ := data["inbox_item_id"].(string)
	if _, err := uuid.Parse(inboxIDStr); err != nil {
		t.Errorf("inbox_item_id is not a valid uuid: %q", inboxIDStr)
	}

	// The row should be retrievable via the standard list query.
	items, err := q.ListInboxUnresolved(ctx, db.ListInboxUnresolvedParams{
		RecipientID: env.OwnerID,
		LimitCount:  10,
		OffsetCount: 0,
	})
	if err != nil {
		t.Fatalf("ListInboxUnresolved: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 inbox item, got %d", len(items))
	}
	if items[0].Type != "human_input_needed" {
		t.Errorf("type: want human_input_needed, got %s", items[0].Type)
	}
	if items[0].Severity != "action_required" {
		t.Errorf("severity: want action_required, got %s", items[0].Severity)
	}
}
