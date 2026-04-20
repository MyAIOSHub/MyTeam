-- name: CreateProjectVersion :one
INSERT INTO project_version (project_id, parent_version_id, version_number, branch_name, fork_reason, created_by)
VALUES (@project_id, @parent_version_id, @version_number, @branch_name, @fork_reason, @created_by)
RETURNING
    id,
    project_id,
    parent_version_id,
    version_number,
    branch_name,
    fork_reason,
    version_status,
    created_by,
    created_at,
    context_imports;

-- name: ListProjectVersions :many
SELECT
    id,
    project_id,
    parent_version_id,
    version_number,
    branch_name,
    fork_reason,
    version_status,
    created_by,
    created_at
FROM project_version
WHERE project_id = @project_id
ORDER BY version_number DESC;

-- name: GetProjectVersion :one
SELECT
    id,
    project_id,
    parent_version_id,
    version_number,
    branch_name,
    fork_reason,
    version_status,
    created_by,
    created_at,
    context_imports
FROM project_version
WHERE id = @id;

-- name: GetLatestProjectVersion :one
SELECT
    id,
    project_id,
    parent_version_id,
    version_number,
    branch_name,
    fork_reason,
    version_status,
    created_by,
    created_at,
    context_imports
FROM project_version
WHERE project_id = @project_id
ORDER BY version_number DESC
LIMIT 1;
