-- Plan 5: task table — replaces workflow_step.
-- 11-state machine; carries planning + execution state for the current Run.

CREATE TABLE IF NOT EXISTS task (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
  run_id UUID REFERENCES project_run(id) ON DELETE SET NULL,
  workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,

  -- Planning fields
  title TEXT NOT NULL,
  description TEXT,
  step_order INTEGER NOT NULL DEFAULT 0,
  depends_on UUID[] NOT NULL DEFAULT '{}',
  primary_assignee_id UUID REFERENCES agent(id) ON DELETE SET NULL,
  fallback_agent_ids UUID[] NOT NULL DEFAULT '{}',
  required_skills TEXT[] NOT NULL DEFAULT '{}',
  collaboration_mode TEXT NOT NULL DEFAULT 'agent_exec_human_review'
    CHECK (collaboration_mode IN ('agent_exec_human_review','human_input_agent_exec','agent_prepare_human_action','mixed')),
  acceptance_criteria TEXT,

  -- Execution state
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','ready','queued','assigned','running','needs_human','under_review','needs_attention','completed','failed','cancelled')),
  actual_agent_id UUID REFERENCES agent(id) ON DELETE SET NULL,
  current_retry INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result JSONB,
  error TEXT,

  -- Policy
  timeout_rule JSONB NOT NULL DEFAULT '{"max_duration_seconds":1800,"action":"retry"}',
  retry_rule JSONB NOT NULL DEFAULT '{"max_retries":2,"retry_delay_seconds":30}',
  escalation_policy JSONB NOT NULL DEFAULT '{"escalate_after_seconds":600}',

  -- Context
  input_context_refs JSONB NOT NULL DEFAULT '[]',
  output_refs JSONB NOT NULL DEFAULT '[]',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_plan_step ON task(plan_id, step_order);
CREATE INDEX IF NOT EXISTS idx_task_run ON task(run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_status ON task(status, plan_id);
CREATE INDEX IF NOT EXISTS idx_task_workspace ON task(workspace_id);
