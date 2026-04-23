-- Reverse the backfill from 082: re-attach the personal_agent to its
-- (former) local runtime, archive the spawned local_agent row.
--
-- Only applies to rows we can match by (workspace, owner, runtime_id)
-- where the personal_agent currently has NULL runtime_id and a matching
-- local_agent exists. This keeps the rollback safe when the user has
-- since manually adjusted either row.

UPDATE agent pa
SET runtime_id = la.runtime_id, updated_at = NOW()
FROM agent la
WHERE la.agent_type      = 'local_agent'
  AND la.archived_at IS NULL
  AND pa.agent_type      = 'personal_agent'
  AND pa.archived_at IS NULL
  AND pa.runtime_id IS NULL
  AND pa.workspace_id    = la.workspace_id
  AND pa.owner_id        = la.owner_id;

UPDATE agent
SET archived_at = NOW(), updated_at = NOW()
WHERE agent_type = 'local_agent'
  AND archived_at IS NULL;
