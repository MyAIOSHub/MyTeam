ALTER TABLE agent DROP CONSTRAINT IF EXISTS agent_type_owner_match;
ALTER TABLE agent ADD CONSTRAINT agent_type_owner_match CHECK (
  (agent_type = 'personal_agent' AND owner_type = 'user' AND owner_id IS NOT NULL)
  OR
  (agent_type = 'system_agent' AND owner_type = 'organization' AND owner_id IS NULL)
);
