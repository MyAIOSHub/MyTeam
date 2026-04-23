-- Migration 074 seeds workspace-scoped role agents as
-- agent_type='personal_agent' + owner_type='organization' + owner_id=NULL,
-- but migration 050's agent_type_owner_match constraint only allowed
-- personal_agent+user+uuid or system_agent+organization+NULL. The seed
-- only ran without failure when the bundle had no matching subagents;
-- once it does (post skillsbundle data update), startup seed fails.
--
-- Relax the constraint to also accept the workspace-owned personal_agent
-- shape used by the role-agent seed. See Issue #104.

ALTER TABLE agent DROP CONSTRAINT IF EXISTS agent_type_owner_match;
ALTER TABLE agent ADD CONSTRAINT agent_type_owner_match CHECK (
  (agent_type = 'personal_agent' AND owner_type = 'user'         AND owner_id IS NOT NULL)
  OR
  (agent_type = 'personal_agent' AND owner_type = 'organization' AND owner_id IS NULL)
  OR
  (agent_type = 'system_agent'   AND owner_type = 'organization' AND owner_id IS NULL)
);
