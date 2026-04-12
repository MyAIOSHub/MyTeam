-- name: UpdateAgentProfile :exec
UPDATE agent SET
  display_name = COALESCE($2, display_name),
  avatar = COALESCE($3, avatar),
  bio = COALESCE($4, bio),
  tags = COALESCE($5, tags),
  agent_metadata = COALESCE($6, agent_metadata)
WHERE id = $1;

-- name: GetAgentProfile :one
SELECT id, name, display_name, avatar, bio, tags, capabilities, agent_metadata, status, description
FROM agent WHERE id = $1;

-- name: UpdateAgentAutoReply :exec
UPDATE agent SET
  auto_reply_enabled = $2,
  auto_reply_config = $3
WHERE id = $1;

-- name: GetAutoReplyAgents :many
SELECT id, name, capabilities, auto_reply_enabled, auto_reply_config
FROM agent
WHERE workspace_id = $1 AND auto_reply_enabled = TRUE AND archived_at IS NULL;

-- name: UpdateAgentCapabilities :exec
UPDATE agent SET capabilities = $2 WHERE id = $1;

-- name: GetAgentByName :one
SELECT * FROM agent WHERE workspace_id = $1 AND name = $2 AND archived_at IS NULL;

-- name: ListAgentsWithCapability :many
SELECT * FROM agent
WHERE workspace_id = $1
  AND $2 = ANY(capabilities)
  AND archived_at IS NULL;

-- name: GetSystemAgent :one
SELECT * FROM agent WHERE workspace_id = $1 AND is_system = TRUE LIMIT 1;

-- name: SetAgentNeedsAttention :exec
UPDATE agent SET needs_attention = $2, needs_attention_reason = $3 WHERE id = $1;

-- name: ListAllAgentsGlobal :many
SELECT * FROM agent WHERE archived_at IS NULL ORDER BY created_at ASC;

-- name: CreateSystemAgent :one
INSERT INTO agent (workspace_id, name, description, status, is_system, owner_id, visibility)
VALUES ($1, 'System Agent', 'Workspace system agent - manages defaults and automation', 'idle', TRUE, $2, 'workspace')
RETURNING *;
