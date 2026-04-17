-- Reverse data migration is mostly impossible (can't recover original
-- workload_status from a single status). Best-effort:
ALTER TABLE agent_runtime ALTER COLUMN mode DROP NOT NULL;
ALTER TABLE agent_runtime ALTER COLUMN mode DROP DEFAULT;
-- agent.status, agent.scope, owner_type backfills remain — harmless.
