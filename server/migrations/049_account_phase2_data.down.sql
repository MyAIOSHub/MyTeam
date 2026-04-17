-- Reverse data migration is mostly impossible (can't recover original
-- workload_status from a single status). Best-effort:
ALTER TABLE agent_runtime ALTER COLUMN mode DROP NOT NULL;
ALTER TABLE agent_runtime ALTER COLUMN mode DROP DEFAULT;
-- agent.status, agent.scope, owner_type backfills remain — harmless.

-- Restore 'session' in scope enum (data that was migrated stays as 'conversation').
ALTER TABLE agent DROP CONSTRAINT IF EXISTS agent_scope_values_check;
ALTER TABLE agent
    ADD CONSTRAINT agent_scope_values_check
    CHECK (scope IS NULL OR scope IN ('account', 'session', 'conversation', 'project', 'file'));
