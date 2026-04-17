-- Phase 1 (Session/Channel Restructure) - additive only.
-- Extends thread table, adds thread_context_item + session_migration_map tables.

-- ===== Thread enhancement =====

-- Switch id default so new threads can be created independently of a root message.
ALTER TABLE thread ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE thread
    ADD COLUMN IF NOT EXISTS workspace_id       UUID,
    ADD COLUMN IF NOT EXISTS root_message_id    UUID,
    ADD COLUMN IF NOT EXISTS issue_id           UUID,
    ADD COLUMN IF NOT EXISTS created_by         UUID,
    ADD COLUMN IF NOT EXISTS created_by_type    TEXT,
    ADD COLUMN IF NOT EXISTS status             TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS metadata           JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS last_activity_at   TIMESTAMPTZ;

-- Backfill: historical thread.id was set to the root_message.id, so replicate that.
UPDATE thread SET root_message_id = id WHERE root_message_id IS NULL;

-- Backfill workspace_id from channel.
UPDATE thread t
SET workspace_id = c.workspace_id
FROM channel c
WHERE t.channel_id = c.id AND t.workspace_id IS NULL;

-- Seed last_activity_at from existing last_reply_at / created_at (NULL for empty threads is acceptable).
UPDATE thread
SET last_activity_at = COALESCE(last_reply_at, created_at)
WHERE last_activity_at IS NULL;

-- Add FK constraints now that backfill is done.
ALTER TABLE thread
    ADD CONSTRAINT thread_workspace_fkey
        FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE CASCADE,
    ADD CONSTRAINT thread_root_message_fkey
        FOREIGN KEY (root_message_id) REFERENCES message(id) ON DELETE SET NULL,
    ADD CONSTRAINT thread_issue_fkey
        FOREIGN KEY (issue_id) REFERENCES issue(id) ON DELETE SET NULL,
    ADD CONSTRAINT thread_status_check
        CHECK (status IN ('active', 'archived')),
    ADD CONSTRAINT thread_created_by_type_check
        CHECK (created_by_type IS NULL OR created_by_type IN ('member', 'agent', 'system'));

-- Indexes for workspace-scoped and issue-scoped thread queries.
CREATE INDEX IF NOT EXISTS idx_thread_workspace ON thread(workspace_id);
CREATE INDEX IF NOT EXISTS idx_thread_issue ON thread(issue_id) WHERE issue_id IS NOT NULL;

-- Promote workspace_id to NOT NULL when all rows are backfilled.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM thread WHERE workspace_id IS NULL) THEN
    ALTER TABLE thread ALTER COLUMN workspace_id SET NOT NULL;
  END IF;
END$$;

-- ===== thread_context_item =====
CREATE TABLE IF NOT EXISTS thread_context_item (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id       UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    thread_id          UUID NOT NULL REFERENCES thread(id) ON DELETE CASCADE,
    item_type          TEXT NOT NULL CHECK (item_type IN ('decision','file','code_snippet','summary','reference')),
    title              TEXT,
    body               TEXT,
    metadata           JSONB NOT NULL DEFAULT '{}',
    source_message_id  UUID REFERENCES message(id) ON DELETE SET NULL,
    retention_class    TEXT NOT NULL DEFAULT 'ttl'
        CHECK (retention_class IN ('permanent','ttl','temp')),
    expires_at         TIMESTAMPTZ,
    created_by         UUID,
    created_by_type    TEXT DEFAULT 'system'
        CHECK (created_by_type IS NULL OR created_by_type IN ('member', 'agent', 'system')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thread_context_item_thread
    ON thread_context_item(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_context_item_workspace
    ON thread_context_item(workspace_id);
CREATE INDEX IF NOT EXISTS idx_thread_context_item_expires
    ON thread_context_item(expires_at)
    WHERE retention_class = 'ttl' AND expires_at IS NOT NULL;

-- ===== session_migration_map =====
CREATE TABLE IF NOT EXISTS session_migration_map (
    session_id  UUID PRIMARY KEY,
    channel_id  UUID NOT NULL REFERENCES channel(id),
    thread_id   UUID NOT NULL REFERENCES thread(id),
    migrated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_migration_map_thread
    ON session_migration_map(thread_id);
