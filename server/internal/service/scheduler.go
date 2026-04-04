package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/multica-ai/multica/server/internal/realtime"
	"github.com/multica-ai/multica/server/internal/util"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

type SchedulerService struct {
	Queries *db.Queries
	Hub     *realtime.Hub
}

func NewSchedulerService(q *db.Queries, hub *realtime.Hub) *SchedulerService {
	return &SchedulerService{Queries: q, Hub: hub}
}

// ScheduleWorkflow starts executing a workflow.
func (s *SchedulerService) ScheduleWorkflow(ctx context.Context, workflowID string) error {
	err := s.Queries.UpdateWorkflowStatus(ctx, db.UpdateWorkflowStatusParams{
		ID:     util.ParseUUID(workflowID),
		Status: "running",
	})
	if err != nil {
		return fmt.Errorf("update workflow status: %w", err)
	}

	steps, err := s.Queries.ListWorkflowSteps(ctx, util.ParseUUID(workflowID))
	if err != nil {
		return fmt.Errorf("list steps: %w", err)
	}

	// Find steps with no dependencies and start them.
	for _, step := range steps {
		if len(step.DependsOn) == 0 {
			go s.scheduleStep(ctx, step)
		}
	}

	return nil
}

func (s *SchedulerService) scheduleStep(ctx context.Context, step db.WorkflowStep) {
	slog.Info("scheduling step", "step_id", util.UUIDToString(step.ID), "agent_id", util.UUIDToString(step.AgentID))

	s.Queries.UpdateWorkflowStepStatus(ctx, db.UpdateWorkflowStepStatusParams{
		ID:     step.ID,
		Status: "running",
		Result: nil,
		Error:  pgtype.Text{},
	})

	// Check if agent is assigned
	if !step.AgentID.Valid {
		s.Queries.UpdateWorkflowStepStatus(ctx, db.UpdateWorkflowStepStatusParams{
			ID:     step.ID,
			Status: "failed",
			Error:  pgtype.Text{String: "no agent assigned", Valid: true},
		})
		return
	}

	// Check agent availability
	agent, err := s.Queries.GetAgent(ctx, step.AgentID)
	if err != nil || agent.Status == "offline" {
		assigned := false
		for _, fbID := range step.FallbackAgentIds {
			fbAgent, fbErr := s.Queries.GetAgent(ctx, fbID)
			if fbErr == nil && fbAgent.Status != "offline" {
				slog.Info("using fallback agent", "step", util.UUIDToString(step.ID), "agent", util.UUIDToString(fbID))
				assigned = true
				break
			}
		}
		if !assigned {
			s.Queries.UpdateWorkflowStepStatus(ctx, db.UpdateWorkflowStepStatusParams{
				ID:     step.ID,
				Status: "failed",
				Error:  pgtype.Text{String: "all agents unavailable", Valid: true},
			})
			slog.Warn("all agents unavailable for step", "step_id", util.UUIDToString(step.ID))
			return
		}
	}

	// Dispatch step to agent
	slog.Info("step dispatched to agent", "step_id", util.UUIDToString(step.ID), "agent_id", util.UUIDToString(step.AgentID))
}

// HandleStepCompletion processes a completed step and triggers dependents.
func (s *SchedulerService) HandleStepCompletion(ctx context.Context, stepID string, result json.RawMessage) error {
	s.Queries.UpdateWorkflowStepStatus(ctx, db.UpdateWorkflowStepStatusParams{
		ID:     util.ParseUUID(stepID),
		Status: "completed",
		Result: result,
		Error:  pgtype.Text{},
	})

	step, err := s.Queries.GetWorkflowStep(ctx, util.ParseUUID(stepID))
	if err != nil {
		return fmt.Errorf("get step: %w", err)
	}

	steps, err := s.Queries.ListWorkflowSteps(ctx, step.WorkflowID)
	if err != nil {
		return fmt.Errorf("list steps: %w", err)
	}

	// Check if all steps completed.
	allDone := true
	for _, st := range steps {
		if st.Status != "completed" && st.Status != "failed" {
			allDone = false
		}
	}

	if allDone {
		s.Queries.UpdateWorkflowStatus(ctx, db.UpdateWorkflowStatusParams{
			ID:     step.WorkflowID,
			Status: "completed",
		})
	}

	// TODO: Find steps whose depends_on are all satisfied and schedule them.

	return nil
}
