DROP INDEX IF EXISTS idx_system_agent_workspace;
DROP INDEX IF EXISTS idx_attachment_parent;
ALTER TABLE attachment DROP COLUMN IF EXISTS parent_file_id;
ALTER TABLE attachment DROP COLUMN IF EXISTS version;
ALTER TABLE agent DROP COLUMN IF EXISTS system_config;
ALTER TABLE agent DROP COLUMN IF EXISTS is_system;
