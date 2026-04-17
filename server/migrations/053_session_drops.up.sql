-- Plan 3 Phase 6 — DESTRUCTIVE.
-- Drops legacy session + session_participant tables, message.session_id,
-- renames scope='session' -> 'conversation' in CHECK constraint + data.

-- Pre-flight: abort if any session row lacks a migration map entry.
-- Migration 052 should have backfilled every session.id into
-- session_migration_map. If anything remains, refuse to drop.
DO $$
DECLARE
  unmapped INTEGER;
BEGIN
  SELECT COUNT(*) INTO unmapped
  FROM session s
  LEFT JOIN session_migration_map m ON m.session_id = s.id
  WHERE m.session_id IS NULL;

  IF unmapped > 0 THEN
    RAISE EXCEPTION 'REFUSING TO DROP: % session rows have no migration map entry. Run migration 052 first.', unmapped;
  END IF;
END$$;

-- ===== scope: 'session' -> 'conversation' =====
-- Data first.
UPDATE agent SET scope = 'conversation' WHERE scope = 'session';

-- Constraint: drop + recreate with new enum.
ALTER TABLE agent DROP CONSTRAINT IF EXISTS agent_scope_values_check;
ALTER TABLE agent
  ADD CONSTRAINT agent_scope_values_check
  CHECK (scope IS NULL OR scope IN ('account', 'conversation', 'project', 'file'));

-- ===== message.session_id drop =====
-- Drop the index that referenced this column.
DROP INDEX IF EXISTS idx_message_session;
ALTER TABLE message DROP COLUMN IF EXISTS session_id;

-- ===== session_participant drop (cascade kills the FK on session) =====
DROP TABLE IF EXISTS session_participant CASCADE;

-- ===== session drop =====
-- session_migration_map has NO FK to session in this schema, so dropping
-- session does not orphan the map. The map remains as a historical lookup
-- (session_id is now a loose UUID reference to a defunct row).
DROP TABLE IF EXISTS session CASCADE;
