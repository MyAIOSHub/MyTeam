-- 064_file_index_backend.up.sql
-- Add backend tag to file_index so multi-storage (S3, Volcengine TOS,
-- future local-disk) can coexist. Existing rows default to 's3' since
-- that's the only backend wired before this migration.

ALTER TABLE file_index
    ADD COLUMN IF NOT EXISTS backend TEXT NOT NULL DEFAULT 's3';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_file_index_backend'
    ) THEN
        ALTER TABLE file_index
            ADD CONSTRAINT chk_file_index_backend
            CHECK (backend IN ('s3', 'tos', 'local'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_file_index_backend
    ON file_index (workspace_id, backend);
