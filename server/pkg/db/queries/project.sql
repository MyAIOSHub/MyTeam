-- name: CreateProject :one
INSERT INTO project (workspace_id, title, description, status, created_by, plan_id)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetProject :one
SELECT * FROM project WHERE id = $1;

-- name: ListProjects :many
SELECT * FROM project WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3;

-- name: UpdateProjectStatus :exec
UPDATE project SET status = $2, updated_at = NOW() WHERE id = $1;

-- name: CreateProjectVersion :one
INSERT INTO project_version (project_id, version, title, description, plan_snapshot, created_by)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: LinkPlanToProject :exec
UPDATE plan SET project_id = $2, updated_at = NOW() WHERE id = $1;
