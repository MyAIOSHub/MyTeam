-- Reverse Phase 1 additive changes.

DROP TABLE IF EXISTS session_migration_map;
DROP TABLE IF EXISTS thread_context_item;

DROP INDEX IF EXISTS idx_thread_workspace;
DROP INDEX IF EXISTS idx_thread_issue;

ALTER TABLE thread
    DROP CONSTRAINT IF EXISTS thread_workspace_fkey,
    DROP CONSTRAINT IF EXISTS thread_root_message_fkey,
    DROP CONSTRAINT IF EXISTS thread_issue_fkey,
    DROP CONSTRAINT IF EXISTS thread_status_check,
    DROP CONSTRAINT IF EXISTS thread_created_by_type_check;

ALTER TABLE thread
    DROP COLUMN IF EXISTS workspace_id,
    DROP COLUMN IF EXISTS root_message_id,
    DROP COLUMN IF EXISTS issue_id,
    DROP COLUMN IF EXISTS created_by,
    DROP COLUMN IF EXISTS created_by_type,
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS metadata,
    DROP COLUMN IF EXISTS last_activity_at;

ALTER TABLE thread ALTER COLUMN id DROP DEFAULT;
