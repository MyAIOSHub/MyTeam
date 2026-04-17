-- Account Phase 1: additive schema changes only.
-- Old columns are preserved so that existing code keeps working.

-- ===== Runtime extensions =====
ALTER TABLE agent_runtime
    ADD COLUMN IF NOT EXISTS concurrency_limit  INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS current_load       INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS lease_expires_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_heartbeat_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS mode               TEXT;

-- Backfill new columns from legacy fields without dropping the originals.
UPDATE agent_runtime SET last_heartbeat_at = last_seen_at WHERE last_heartbeat_at IS NULL;
UPDATE agent_runtime SET mode = runtime_mode WHERE mode IS NULL;

-- Expand status enum to include 'degraded'.
ALTER TABLE agent_runtime DROP CONSTRAINT IF EXISTS agent_runtime_status_check;
ALTER TABLE agent_runtime
    ADD CONSTRAINT agent_runtime_status_check
    CHECK (status IN ('online', 'offline', 'degraded'));

-- New CHECK on mode (allows NULL during transition; enforced after backfill below).
ALTER TABLE agent_runtime
    ADD CONSTRAINT agent_runtime_mode_check
    CHECK (mode IS NULL OR mode IN ('local', 'cloud'));

CREATE INDEX IF NOT EXISTS idx_agent_runtime_lease
    ON agent_runtime(lease_expires_at)
    WHERE lease_expires_at IS NOT NULL;

-- ===== Agent extensions =====
ALTER TABLE agent
    ADD COLUMN IF NOT EXISTS scope       TEXT,
    ADD COLUMN IF NOT EXISTS owner_type  TEXT;

-- Mirror page_scope into scope so reads can move first.
UPDATE agent SET scope = page_scope WHERE scope IS NULL AND page_scope IS NOT NULL;

-- Backfill owner_type from current data.
UPDATE agent SET owner_type = 'organization'
    WHERE owner_type IS NULL AND (agent_type = 'system_agent' OR agent_type = 'page_system_agent' OR is_system = TRUE);
UPDATE agent SET owner_type = 'user'
    WHERE owner_type IS NULL AND owner_id IS NOT NULL;

ALTER TABLE agent
    ADD CONSTRAINT agent_owner_type_check
    CHECK (owner_type IS NULL OR owner_type IN ('user', 'organization'));

ALTER TABLE agent
    ADD CONSTRAINT agent_scope_values_check
    CHECK (scope IS NULL OR scope IN ('account', 'session', 'conversation', 'project', 'file'));

-- ===== Message audit columns =====
ALTER TABLE message
    ADD COLUMN IF NOT EXISTS effective_actor_id   UUID,
    ADD COLUMN IF NOT EXISTS effective_actor_type TEXT,
    ADD COLUMN IF NOT EXISTS real_operator_id     UUID,
    ADD COLUMN IF NOT EXISTS real_operator_type   TEXT;

-- Backfill from existing sender_id / sender_type for non-impersonated messages.
UPDATE message
SET effective_actor_id = sender_id,
    effective_actor_type = sender_type,
    real_operator_id = sender_id,
    real_operator_type = sender_type
WHERE effective_actor_id IS NULL;

ALTER TABLE message
    ADD CONSTRAINT message_effective_actor_type_check
    CHECK (effective_actor_type IS NULL OR effective_actor_type IN ('member', 'agent', 'system')),
    ADD CONSTRAINT message_real_operator_type_check
    CHECK (real_operator_type IS NULL OR real_operator_type IN ('member', 'agent', 'system'));
