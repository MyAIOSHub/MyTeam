-- Backfill for multi-local-agent rollout
-- (plan: docs/plans/2026-04-23-multiple-local-agents.md, Phase 6).
--
-- Prior to migration 080 a user had exactly one personal_agent; users
-- who bound a daemon runtime did so by pointing their personal_agent's
-- runtime_id at the local runtime. After 080, local bindings should
-- live in dedicated local_agent rows so the cloud personal_agent can
-- remain cloud-only and so a user can bind several local runtimes.
--
-- For every personal_agent currently pointing at a mode='local' runtime:
--   1. Insert a new local_agent row carrying the same (workspace, owner,
--      runtime_id). Name follows "<user-name> · <runtime-name>" to
--      match the CreateLocalAgent handler default.
--   2. Null out personal_agent.runtime_id so the cloud row is back to
--      cloud mode.
--
-- NOT EXISTS guards keep the migration idempotent; re-runs don't create
-- duplicate local_agent rows.

INSERT INTO agent (
    workspace_id, name, description,
    runtime_id, visibility, status, max_concurrent_tasks, owner_id,
    agent_type, owner_type, auto_reply_enabled
)
SELECT
    pa.workspace_id,
    COALESCE(u.name, 'user') || ' · ' || ar.name,
    COALESCE(NULLIF(pa.description, ''), 'Local runtime agent'),
    pa.runtime_id,
    'private',
    'idle',
    1,
    pa.owner_id,
    'local_agent',
    'user',
    TRUE
FROM agent pa
JOIN agent_runtime ar ON ar.id = pa.runtime_id
LEFT JOIN "user" u ON u.id = pa.owner_id
WHERE pa.agent_type = 'personal_agent'
  AND pa.archived_at IS NULL
  AND ar.mode = 'local'
  AND NOT EXISTS (
      SELECT 1 FROM agent existing
      WHERE existing.workspace_id = pa.workspace_id
        AND existing.owner_id     = pa.owner_id
        AND existing.runtime_id   = pa.runtime_id
        AND existing.agent_type   = 'local_agent'
        AND existing.archived_at IS NULL
  );

-- Sever the cloud personal_agent from the local runtime so it can go
-- back to its cloud kernel.
UPDATE agent pa
SET runtime_id = NULL, updated_at = NOW()
FROM agent_runtime ar
WHERE pa.runtime_id = ar.id
  AND pa.agent_type = 'personal_agent'
  AND pa.archived_at IS NULL
  AND ar.mode = 'local';
