-- name: InsertSessionMigrationMap :exec
INSERT INTO session_migration_map (session_id, channel_id, thread_id)
VALUES ($1, $2, $3)
ON CONFLICT (session_id) DO NOTHING;

-- name: GetSessionMigrationMap :one
SELECT * FROM session_migration_map WHERE session_id = $1;

-- name: GetSessionMigrationByThread :one
SELECT * FROM session_migration_map WHERE thread_id = $1 LIMIT 1;
