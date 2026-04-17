-- Best-effort reverse of 053. Data is permanently lost; this only
-- restores the empty schema shells so a re-up succeeds.

-- Restore session table to match the original 020_task_session schema.
CREATE TABLE IF NOT EXISTS session (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  creator_id   UUID NOT NULL,
  creator_type TEXT NOT NULL DEFAULT 'member',
  status       TEXT NOT NULL DEFAULT 'active',
  max_turns    INTEGER NOT NULL DEFAULT 0,
  current_turn INTEGER NOT NULL DEFAULT 0,
  context      JSONB,
  issue_id     UUID REFERENCES issue(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_workspace ON session(workspace_id);
CREATE INDEX IF NOT EXISTS idx_session_issue ON session(issue_id);

CREATE TABLE IF NOT EXISTS session_participant (
  session_id       UUID NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  participant_id   UUID NOT NULL,
  participant_type TEXT NOT NULL DEFAULT 'member',
  role             TEXT NOT NULL DEFAULT 'participant',
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, participant_id, participant_type)
);

-- Restore message.session_id as nullable, with the original index.
ALTER TABLE message ADD COLUMN IF NOT EXISTS session_id UUID;
CREATE INDEX IF NOT EXISTS idx_message_session ON message(session_id, created_at);

-- Restore scope CHECK constraint with 'session' value alongside 'conversation'.
-- Note: scope data already updated from 'session' to 'conversation' is NOT
-- reverted here. If a true rollback is desired, run separately:
--   UPDATE agent SET scope = 'session' WHERE scope = 'conversation';
ALTER TABLE agent DROP CONSTRAINT IF EXISTS agent_scope_values_check;
ALTER TABLE agent
  ADD CONSTRAINT agent_scope_values_check
  CHECK (scope IS NULL OR scope IN ('account', 'session', 'conversation', 'project', 'file'));
