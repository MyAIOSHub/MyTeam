-- System Agent: one per workspace, auto-created
ALTER TABLE agent ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE agent ADD COLUMN IF NOT EXISTS system_config JSONB;

-- File versioning
ALTER TABLE attachment ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE attachment ADD COLUMN IF NOT EXISTS parent_file_id UUID REFERENCES attachment(id);

CREATE INDEX IF NOT EXISTS idx_attachment_parent ON attachment(parent_file_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_system_agent_workspace ON agent(workspace_id) WHERE is_system = TRUE;
