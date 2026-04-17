-- Account Phase 2 - data migration. No column drops yet.

-- ===== Agent type collapse =====
-- page_system_agent rows: convert to system_agent + scope (was page_scope)
UPDATE agent
SET agent_type = 'system_agent',
    scope      = COALESCE(scope, page_scope)
WHERE agent_type = 'page_system_agent';

-- Existing system_agent (is_system=TRUE) rows: scope must remain NULL (global orchestrator)
UPDATE agent
SET scope = NULL
WHERE agent_type = 'system_agent' AND is_system = TRUE AND scope IS NOT NULL;

-- ===== Status merge: online_status + workload_status -> status =====
UPDATE agent SET status =
    CASE
      WHEN workload_status = 'suspended'                                    THEN 'suspended'
      WHEN workload_status = 'blocked'                                      THEN 'blocked'
      WHEN workload_status = 'degraded'                                     THEN 'degraded'
      WHEN workload_status = 'busy'                                         THEN 'busy'
      WHEN online_status = 'offline'                                        THEN 'offline'
      WHEN online_status = 'online' AND (workload_status IS NULL OR workload_status = 'idle')
                                                                            THEN 'idle'
      ELSE 'online'
    END
WHERE status IS NULL OR status NOT IN
    ('offline','online','idle','busy','blocked','degraded','suspended');

-- ===== Owner type backfill (idempotent) =====
UPDATE agent SET owner_type = 'organization'
    WHERE owner_type IS NULL AND agent_type = 'system_agent';
UPDATE agent SET owner_type = 'user'
    WHERE owner_type IS NULL AND owner_id IS NOT NULL;

-- ===== Runtime: mode column from runtime_mode (idempotent) =====
UPDATE agent_runtime SET mode = runtime_mode WHERE mode IS NULL;
ALTER TABLE agent_runtime ALTER COLUMN mode SET DEFAULT 'local';

-- mode SET NOT NULL only if no NULLs remain
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM agent_runtime WHERE mode IS NULL) THEN
    ALTER TABLE agent_runtime ALTER COLUMN mode SET NOT NULL;
  END IF;
END$$;

-- ===== Runtime: last_heartbeat_at from last_seen_at (idempotent) =====
UPDATE agent_runtime SET last_heartbeat_at = last_seen_at WHERE last_heartbeat_at IS NULL;

-- ===== Provider value normalization =====
UPDATE agent_runtime SET provider = 'cloud_llm' WHERE provider = 'multica_agent';
UPDATE agent_runtime SET provider = 'claude'    WHERE provider = 'legacy_local';

-- ===== Scope: 'session' → 'conversation' =====
-- Plan 1 added 'conversation' as a valid scope value alongside legacy 'session'.
-- Plan 2 frontend drops 'session'. Migrate any residual rows now.
UPDATE agent SET scope = 'conversation' WHERE scope = 'session';

-- Tighten the CHECK to drop 'session'.
ALTER TABLE agent DROP CONSTRAINT IF EXISTS agent_scope_values_check;
ALTER TABLE agent
    ADD CONSTRAINT agent_scope_values_check
    CHECK (scope IS NULL OR scope IN ('account', 'conversation', 'project', 'file'));
