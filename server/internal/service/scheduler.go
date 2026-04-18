// TODO(plan5-c3): scheduler will be rewritten around Task + Execution in
// Batch C3. The previous implementation orchestrated workflow_step rows
// (claim agent, retry, fallback, escalation). Migration 059 dropped the
// workflow / workflow_step tables, so the implementation has been reduced
// to no-op stubs that keep the SchedulerService type and its public method
// surface intact for callers (handlers, ProjectLifecycleService) until the
// task-driven rewrite lands.

package service

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/multica-ai/multica/server/internal/events"
	"github.com/multica-ai/multica/server/internal/realtime"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

// RetryRule defines the retry behaviour for a workflow step.
//
// TODO(plan5-c3): retry policy will be re-modeled per Task / Execution.
type RetryRule struct {
	MaxRetries        int `json:"max_retries"`
	RetryDelaySeconds int `json:"retry_delay_seconds"`
}

// DefaultRetryRule returns the default retry rule per the spec.
func DefaultRetryRule() RetryRule {
	return RetryRule{MaxRetries: 2, RetryDelaySeconds: 30}
}

// TimeoutRule defines the timeout behaviour for a workflow step.
//
// TODO(plan5-c3): timeout policy will be re-modeled per Task / Execution.
type TimeoutRule struct {
	MaxDurationSeconds int    `json:"max_duration_seconds"`
	Action             string `json:"action"` // "retry", "fail", or "escalate"
}

// DefaultTimeoutRule returns the default timeout rule per the spec.
func DefaultTimeoutRule() TimeoutRule {
	return TimeoutRule{MaxDurationSeconds: 1800, Action: "retry"}
}

// OwnerEscalationPolicy defines how to escalate to the owner.
//
// TODO(plan5-c3): escalation policy will be re-modeled per Task / Execution.
type OwnerEscalationPolicy struct {
	EscalateAfterSeconds int    `json:"escalate_after_seconds"`
	EscalateTo           string `json:"escalate_to"` // owner user ID
}

// DefaultOwnerEscalationPolicy returns the default escalation policy.
func DefaultOwnerEscalationPolicy() OwnerEscalationPolicy {
	return OwnerEscalationPolicy{EscalateAfterSeconds: 600}
}

// SchedulerService is a stub awaiting the Task / Execution rewrite. All
// methods are no-ops that log a warning so production callers fail loudly
// in observability rather than silently dropping work.
type SchedulerService struct {
	Queries *db.Queries
	Hub     *realtime.Hub
	Bus     *events.Bus
}

// NewSchedulerService constructs a stub scheduler.
func NewSchedulerService(q *db.Queries, hub *realtime.Hub) *SchedulerService {
	return &SchedulerService{Queries: q, Hub: hub}
}

// ScheduleWorkflow is a no-op stub.
//
// TODO(plan5-c3): replace with task-driven scheduling.
func (s *SchedulerService) ScheduleWorkflow(ctx context.Context, workflowID string, runID string) error {
	slog.Warn("scheduler stub: ScheduleWorkflow called but not implemented",
		"workflow_id", workflowID,
		"run_id", runID,
	)
	_ = ctx
	return nil
}

// HandleStepCompletion is a no-op stub.
//
// TODO(plan5-c3): replace with execution-completion handling.
func (s *SchedulerService) HandleStepCompletion(ctx context.Context, stepID string, result json.RawMessage) error {
	slog.Warn("scheduler stub: HandleStepCompletion called but not implemented",
		"step_id", stepID,
	)
	_ = ctx
	_ = result
	return nil
}

// HandleStepFailure is a no-op stub.
//
// TODO(plan5-c3): replace with execution-failure handling (with retry +
// fallback + escalation).
func (s *SchedulerService) HandleStepFailure(ctx context.Context, stepID string, errMsg string) error {
	slog.Warn("scheduler stub: HandleStepFailure called but not implemented",
		"step_id", stepID,
		"error", errMsg,
	)
	_ = ctx
	return nil
}

// HandleStepTimeout is a no-op stub.
//
// TODO(plan5-c3): replace with execution-timeout handling.
func (s *SchedulerService) HandleStepTimeout(ctx context.Context, stepID string) error {
	slog.Warn("scheduler stub: HandleStepTimeout called but not implemented",
		"step_id", stepID,
	)
	_ = ctx
	return nil
}
