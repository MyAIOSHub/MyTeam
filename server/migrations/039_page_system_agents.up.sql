-- Page system agents: one per workspace per page scope.
-- These are system agents tied to a product area (account, session, project, file)
-- and drive page-level automation (identity generation, mediation, plan execution, etc.).

ALTER TABLE agent ADD COLUMN IF NOT EXISTS agent_type TEXT NOT NULL DEFAULT 'user';

ALTER TABLE agent ADD COLUMN IF NOT EXISTS page_scope TEXT
  CHECK (page_scope IS NULL OR page_scope IN ('account', 'session', 'project', 'file'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_page_scope
  ON agent(workspace_id, page_scope) WHERE page_scope IS NOT NULL;

ALTER TABLE agent ADD COLUMN IF NOT EXISTS needs_attention BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE agent ADD COLUMN IF NOT EXISTS needs_attention_reason TEXT;
