package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/multica-ai/multica/server/internal/events"
	"github.com/multica-ai/multica/server/internal/realtime"
	"github.com/multica-ai/multica/server/internal/util"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

// ResultsReporterService listens to workflow and run completion events,
// composes summary messages, and delivers them to project channels,
// source conversations, and participant inboxes.
type ResultsReporterService struct {
	Queries  *db.Queries
	Hub      *realtime.Hub
	EventBus *events.Bus
}

// NewResultsReporterService creates a new ResultsReporterService.
func NewResultsReporterService(q *db.Queries, hub *realtime.Hub, bus *events.Bus) *ResultsReporterService {
	return &ResultsReporterService{
		Queries:  q,
		Hub:      hub,
		EventBus: bus,
	}
}

// Start subscribes to workflow.completed and run:completed events.
func (s *ResultsReporterService) Start() {
	s.EventBus.Subscribe(protocol.EventWorkflowCompleted, s.handleWorkflowCompleted)
	s.EventBus.Subscribe(protocol.EventRunCompleted, s.handleRunCompleted)

	slog.Info("results reporter service started")
}

// handleWorkflowCompleted handles workflow completion by logging the event.
// The actual summary is deferred to run completion since a workflow may be
// part of a larger project run.
func (s *ResultsReporterService) handleWorkflowCompleted(e events.Event) {
	payload, ok := e.Payload.(map[string]any)
	if !ok {
		return
	}

	workflowID, _ := payload["workflow_id"].(string)
	status, _ := payload["status"].(string)

	slog.Info("results reporter: workflow completed",
		"workflow_id", workflowID,
		"status", status,
		"workspace_id", e.WorkspaceID,
	)

	// Workflow completion alone does not trigger a full report.
	// The run:completed event triggers the summary.
}

// handleRunCompleted produces and delivers the run completion summary.
func (s *ResultsReporterService) handleRunCompleted(e events.Event) {
	payload, ok := e.Payload.(map[string]any)
	if !ok {
		return
	}

	runID, _ := payload["run_id"].(string)
	if runID == "" {
		return
	}

	slog.Info("results reporter: run completed, generating summary",
		"run_id", runID,
		"workspace_id", e.WorkspaceID,
	)

	ctx := context.Background()
	s.reportRunCompletion(ctx, e.WorkspaceID, runID)
}

// reportRunCompletion composes and delivers the run summary.
//
// Steps:
// 1. Get the project run.
// 2. Get all workflow steps and their results.
// 3. Compose a summary message (plain text, structured).
// 4. Post summary to the project's channel (create a message record).
// 5. Post summary to each source_conversation from project.source_conversations.
// 6. Create inbox notifications for all project participants.
// 7. Update project status to "completed".
func (s *ResultsReporterService) reportRunCompletion(ctx context.Context, workspaceID, runID string) {
	// Step 1: Get the project run.
	run, err := s.Queries.GetProjectRun(ctx, util.ParseUUID(runID))
	if err != nil {
		slog.Error("results reporter: failed to get project run", "run_id", runID, "error", err)
		return
	}
	projectID := util.UUIDToString(run.ProjectID)

	// Step 2: Get workflow steps for this run.
	dbSteps, _ := s.Queries.ListWorkflowStepsByRun(ctx, util.ParseUUID(runID))
	var steps []stepResult
	for _, st := range dbSteps {
		sr := stepResult{
			Order:       st.StepOrder,
			Description: st.Description,
			Status:      st.Status,
			Error:       st.Error.String,
			Result:      st.Result,
		}
		steps = append(steps, sr)
	}

	summary := s.composeSummary(runID, steps)

	slog.Info("results reporter: summary composed",
		"run_id", runID,
		"project_id", projectID,
		"summary_length", len(summary),
		"steps", len(steps),
	)

	// Step 3-4: Post summary to the project's channel.
	project, projErr := s.Queries.GetProject(ctx, util.ParseUUID(projectID))
	if projErr == nil && project.ChannelID.Valid {
		s.postSummaryToChannel(ctx, workspaceID, util.UUIDToString(project.ChannelID), summary)
	}

	// Step 6: Notify project participants via inbox.
	if projErr == nil {
		s.notifyProjectParticipants(ctx, workspaceID, projectID, runID, summary)
	}

	// Step 7: Update project status.
	runStatus := "completed"
	for _, st := range steps {
		if st.Status == "failed" {
			runStatus = "failed"
			break
		}
	}
	s.Queries.UpdateProjectStatus(ctx, db.UpdateProjectStatusParams{
		ID:     util.ParseUUID(projectID),
		Status: runStatus,
	})

	// Broadcast a project status change event.
	s.EventBus.Publish(events.Event{
		Type:        protocol.EventProjectStatusChanged,
		WorkspaceID: workspaceID,
		ActorType:   "system",
		ActorID:     "",
		Payload: map[string]any{
			"run_id": runID,
			"status": "completed",
		},
	})

	_ = ctx
}

// composeSummary builds a structured summary from workflow step results.
func (s *ResultsReporterService) composeSummary(runID string, steps []stepResult) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("## Run Completed: %s\n\n", runID))
	sb.WriteString(fmt.Sprintf("**Completed at:** %s\n\n", time.Now().UTC().Format(time.RFC3339)))

	if len(steps) == 0 {
		sb.WriteString("No step results available.\n")
		return sb.String()
	}

	sb.WriteString("### Step Results\n\n")
	completed := 0
	failed := 0
	for _, step := range steps {
		status := "completed"
		if step.Error != "" {
			status = "failed"
			failed++
		} else {
			completed++
		}
		sb.WriteString(fmt.Sprintf("- **Step %d** (%s): %s\n", step.Order, step.Description, status))
		if step.Error != "" {
			sb.WriteString(fmt.Sprintf("  - Error: %s\n", step.Error))
		}
	}

	sb.WriteString(fmt.Sprintf("\n**Summary:** %d completed, %d failed out of %d total steps.\n",
		completed, failed, len(steps)))

	return sb.String()
}

// stepResult holds the relevant fields from a workflow step for summary generation.
type stepResult struct {
	Order       int32
	Description string
	Status      string
	Error       string
	Result      json.RawMessage
}

// postSummaryToChannel creates a message record and broadcasts it.
func (s *ResultsReporterService) postSummaryToChannel(ctx context.Context, workspaceID, channelID, summary string) {
	// Create a message record in the database.
	_, msgErr := s.Queries.CreateMessage(ctx, db.CreateMessageParams{
		WorkspaceID: util.ParseUUID(workspaceID),
		ChannelID:   util.ParseUUID(channelID),
		SenderType:  "system",
		SenderID:    pgtype.UUID{},
		Content:     summary,
		ContentType: "text",
	})
	if msgErr != nil {
		slog.Error("results reporter: failed to post summary", "channel_id", channelID, "error", msgErr)
	}

	// Broadcast via WebSocket.
	data, err := json.Marshal(map[string]any{
		"type": "message:created",
		"payload": map[string]any{
			"channel_id":  channelID,
			"content":     summary,
			"sender_type": "system",
		},
	})
	if err != nil {
		slog.Error("results reporter: failed to marshal WS message", "error", err)
		return
	}

	s.Hub.BroadcastToWorkspace(workspaceID, data)
}

// notifyProjectParticipants creates inbox items for all participants.
func (s *ResultsReporterService) notifyProjectParticipants(ctx context.Context, workspaceID, projectID, runID, summary string) {
	// Get project and its channel members, create inbox items.
	project, projErr := s.Queries.GetProject(ctx, util.ParseUUID(projectID))
	if projErr != nil {
		slog.Warn("results reporter: project not found for inbox", "project_id", projectID)
		return
	}
	if !project.ChannelID.Valid {
		return
	}
	members, memErr := s.Queries.ListChannelMembers(ctx, project.ChannelID)
	if memErr != nil {
		slog.Warn("results reporter: failed to list channel members", "error", memErr)
		return
	}
	for _, m := range members {
		if m.MemberType != "member" {
			continue
		}
		s.Queries.CreateInboxItem(ctx, db.CreateInboxItemParams{
			WorkspaceID:   util.ParseUUID(workspaceID),
			RecipientType: "member",
			RecipientID:   m.MemberID,
			Type:          "run_completed",
			Title:         fmt.Sprintf("Project run completed: %s", runID[:8]),
			Body:          pgtype.Text{String: summary, Valid: true},
			Severity:      "info",
		})
	}

	slog.Debug("results reporter: inbox notifications created",
		"project_id", projectID,
		"run_id", runID,
	)
}

// Ensure util import is used.
var _ = util.ParseUUID
