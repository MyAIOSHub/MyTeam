ALTER TABLE agent DROP COLUMN IF EXISTS needs_attention_reason;
ALTER TABLE agent DROP COLUMN IF EXISTS needs_attention;
DROP INDEX IF EXISTS idx_agent_page_scope;
ALTER TABLE agent DROP COLUMN IF EXISTS page_scope;
ALTER TABLE agent DROP COLUMN IF EXISTS agent_type;
