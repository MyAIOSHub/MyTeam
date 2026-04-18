package tools

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/multica-ai/multica/server/internal/errcode"
	"github.com/multica-ai/multica/server/internal/mcp/mcptool"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

var errMCPPermissionDenied = errors.New("mcp tool permission denied")

type workspaceRepo struct {
	URL         string `json:"url"`
	Description string `json:"description"`
}

func stringArg(args map[string]any, key string) string {
	value, _ := args[key].(string)
	return strings.TrimSpace(value)
}

func uuidArg(args map[string]any, key string) (uuid.UUID, error) {
	raw := stringArg(args, key)
	if raw == "" {
		return uuid.Nil, fmt.Errorf("%s is required", key)
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid %s: %w", key, err)
	}
	return id, nil
}

func pgUUID(id uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: id, Valid: id != uuid.Nil}
}

func uuidString(id pgtype.UUID) string {
	if !id.Valid {
		return ""
	}
	return uuid.UUID(id.Bytes).String()
}

func sameUUID(id pgtype.UUID, want uuid.UUID) bool {
	return id.Valid && uuid.UUID(id.Bytes) == want
}

func ensureWorkspaceMember(ctx context.Context, q *db.Queries, ws mcptool.Context) error {
	if q == nil {
		return fmt.Errorf("mcp tool: queries required")
	}
	if ws.WorkspaceID == uuid.Nil || ws.UserID == uuid.Nil {
		return errMCPPermissionDenied
	}
	if _, err := q.GetMemberByUserAndWorkspace(ctx, db.GetMemberByUserAndWorkspaceParams{
		UserID:      pgUUID(ws.UserID),
		WorkspaceID: pgUUID(ws.WorkspaceID),
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return errMCPPermissionDenied
		}
		return err
	}
	if ws.AgentID != uuid.Nil {
		if _, err := q.GetAgentInWorkspace(ctx, db.GetAgentInWorkspaceParams{
			ID:          pgUUID(ws.AgentID),
			WorkspaceID: pgUUID(ws.WorkspaceID),
		}); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return errMCPPermissionDenied
			}
			return err
		}
	}
	return nil
}

func loadProjectForWorkspace(ctx context.Context, q *db.Queries, ws mcptool.Context, projectID uuid.UUID) (db.Project, error) {
	if err := ensureWorkspaceMember(ctx, q, ws); err != nil {
		return db.Project{}, err
	}
	project, err := q.GetProject(ctx, pgUUID(projectID))
	if err != nil {
		return db.Project{}, err
	}
	if !sameUUID(project.WorkspaceID, ws.WorkspaceID) {
		return db.Project{}, errMCPPermissionDenied
	}
	return project, nil
}

func accessErrorResult(err error) (mcptool.Result, bool) {
	switch {
	case errors.Is(err, errMCPPermissionDenied):
		return mcptool.Result{
			Note:   "workspace permission denied",
			Errors: []string{errcode.MCPPermissionDenied.Code},
		}, true
	case errors.Is(err, pgx.ErrNoRows):
		return mcptool.Result{
			Note:   "project not found",
			Errors: []string{errcode.ProjectNotFound.Code},
		}, true
	default:
		return mcptool.Result{}, false
	}
}

func toolNotAvailable(note string) mcptool.Result {
	return mcptool.Result{
		Note:   note,
		Errors: []string{errcode.MCPToolNotAvailable.Code},
	}
}

func listWorkspaceRepos(ctx context.Context, q *db.Queries, workspaceID uuid.UUID) ([]workspaceRepo, error) {
	ws, err := q.GetWorkspace(ctx, pgUUID(workspaceID))
	if err != nil {
		return nil, err
	}
	if len(ws.Repos) == 0 {
		return nil, nil
	}
	var repos []workspaceRepo
	if err := json.Unmarshal(ws.Repos, &repos); err != nil {
		return nil, fmt.Errorf("decode workspace repos: %w", err)
	}
	return repos, nil
}

func selectRepoURL(ctx context.Context, q *db.Queries, workspaceID uuid.UUID, args map[string]any) (string, error) {
	if repoURL := stringArg(args, "repo_url"); repoURL != "" {
		return repoURL, nil
	}
	repos, err := listWorkspaceRepos(ctx, q, workspaceID)
	if err != nil {
		return "", err
	}
	for _, repo := range repos {
		if strings.TrimSpace(repo.URL) != "" {
			return strings.TrimSpace(repo.URL), nil
		}
	}
	return "", fmt.Errorf("workspace has no configured repository")
}

func inferProvider(repoURL string) string {
	lower := strings.ToLower(repoURL)
	switch {
	case strings.Contains(lower, "gitlab"):
		return "gitlab"
	default:
		return "github"
	}
}

func repoNameFromURL(repoURL string) string {
	repoURL = strings.TrimRight(strings.TrimSpace(repoURL), "/")
	repoURL = strings.TrimSuffix(repoURL, ".git")
	if i := strings.LastIndex(repoURL, "/"); i >= 0 {
		repoURL = repoURL[i+1:]
	}
	if i := strings.LastIndex(repoURL, ":"); i >= 0 {
		repoURL = repoURL[i+1:]
	}
	if repoURL == "" {
		return "repo"
	}
	return repoURL
}

func allowedPath(path string) (string, bool, error) {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return "", false, err
	}
	realPath, err := filepath.EvalSymlinks(absPath)
	if err == nil {
		absPath = realPath
	}

	roots, err := allowedPathRoots()
	if err != nil {
		return "", false, err
	}
	for _, root := range roots {
		if pathWithinRoot(absPath, root) {
			return absPath, true, nil
		}
	}
	return absPath, false, nil
}

func allowedPathRoots() ([]string, error) {
	var roots []string
	for _, env := range []string{"MULTICA_DAEMON_ALLOWED_PATHS", "MULTICA_ALLOWED_PATHS"} {
		for _, root := range filepath.SplitList(os.Getenv(env)) {
			if strings.TrimSpace(root) != "" {
				roots = append(roots, root)
			}
		}
	}
	for _, env := range []string{"MULTICA_WORKDIR", "MULTICA_WORKSPACES_ROOT"} {
		if root := strings.TrimSpace(os.Getenv(env)); root != "" {
			roots = append(roots, root)
		}
	}
	if cwd, err := os.Getwd(); err == nil {
		roots = append(roots, cwd)
	}

	seen := map[string]bool{}
	normalized := make([]string, 0, len(roots))
	for _, root := range roots {
		absRoot, err := filepath.Abs(root)
		if err != nil {
			return nil, err
		}
		if realRoot, err := filepath.EvalSymlinks(absRoot); err == nil {
			absRoot = realRoot
		}
		absRoot = filepath.Clean(absRoot)
		if !seen[absRoot] {
			normalized = append(normalized, absRoot)
			seen[absRoot] = true
		}
	}
	return normalized, nil
}

func pathWithinRoot(path, root string) bool {
	path = filepath.Clean(path)
	root = filepath.Clean(root)
	if path == root {
		return true
	}
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}
