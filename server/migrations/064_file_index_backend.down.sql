-- Reverse 064_file_index_backend.up.sql.

DROP INDEX IF EXISTS idx_file_index_backend;
ALTER TABLE file_index DROP CONSTRAINT IF EXISTS chk_file_index_backend;
ALTER TABLE file_index DROP COLUMN IF EXISTS backend;
