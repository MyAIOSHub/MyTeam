-- name: CreateThreadContextItem :one
INSERT INTO thread_context_item (
    id, workspace_id, thread_id, item_type, title, body,
    metadata, source_message_id, retention_class, expires_at,
    created_by, created_by_type, created_at
) VALUES (
    gen_random_uuid(), $1, $2, $3, $4, $5,
    COALESCE($6, '{}'::jsonb), $7, COALESCE($8, 'ttl'), $9,
    $10, COALESCE($11, 'system'), now()
)
RETURNING *;

-- name: GetThreadContextItem :one
SELECT * FROM thread_context_item WHERE id = $1;

-- name: ListThreadContextItems :many
SELECT * FROM thread_context_item
WHERE thread_id = $1
ORDER BY created_at ASC;

-- name: ListThreadContextItemsByType :many
SELECT * FROM thread_context_item
WHERE thread_id = $1 AND item_type = $2
ORDER BY created_at ASC;

-- name: DeleteThreadContextItem :exec
DELETE FROM thread_context_item WHERE id = $1;

-- name: ExpireTTLContextItems :exec
DELETE FROM thread_context_item
WHERE retention_class = 'ttl'
  AND expires_at IS NOT NULL
  AND expires_at < now();
