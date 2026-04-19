package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func insertProjectVersionFixture(t *testing.T, projectID string) string {
	t.Helper()

	ctx := context.Background()
	rows, err := testPool.Query(ctx, `
		SELECT column_name
		FROM information_schema.columns
		WHERE table_name = 'project_version'
	`)
	if err != nil {
		t.Fatalf("load project_version columns: %v", err)
	}
	defer rows.Close()

	columns := map[string]bool{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatalf("scan project_version column: %v", err)
		}
		columns[name] = true
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate project_version columns: %v", err)
	}

	insertColumns := []string{"project_id"}
	values := []any{projectID}
	if columns["created_by"] {
		insertColumns = append(insertColumns, "created_by")
		values = append(values, testUserID)
	}
	if columns["version_number"] {
		insertColumns = append(insertColumns, "version_number")
		values = append(values, 1)
	}
	if columns["branch_name"] {
		insertColumns = append(insertColumns, "branch_name")
		values = append(values, "main")
	}
	if columns["fork_reason"] {
		insertColumns = append(insertColumns, "fork_reason")
		values = append(values, "regression-test")
	}
	if columns["version_status"] {
		insertColumns = append(insertColumns, "version_status")
		values = append(values, "active")
	}
	if columns["version"] {
		insertColumns = append(insertColumns, "version")
		values = append(values, 1)
	}
	if columns["title"] {
		insertColumns = append(insertColumns, "title")
		values = append(values, "Version 1")
	}
	if columns["description"] {
		insertColumns = append(insertColumns, "description")
		values = append(values, "Project version fixture")
	}

	placeholders := make([]string, len(values))
	for i := range values {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
	}

	var versionID string
	query := fmt.Sprintf(
		`INSERT INTO project_version (%s) VALUES (%s) RETURNING id`,
		strings.Join(insertColumns, ", "),
		strings.Join(placeholders, ", "),
	)
	if err := testPool.QueryRow(ctx, query, values...).Scan(&versionID); err != nil {
		t.Fatalf("insert project version fixture: %v", err)
	}
	return versionID
}

func TestListProjectVersions(t *testing.T) {
	ctx := context.Background()

	var projectID string
	if err := testPool.QueryRow(ctx, `
		INSERT INTO project (workspace_id, title, description, status, created_by, schedule_type, source_conversations, creator_owner_id)
		VALUES ($1, $2, '', 'not_started', $3, 'one_time', '[]'::jsonb, $3)
		RETURNING id
	`, testWorkspaceID, "Project Versions Test", testUserID).Scan(&projectID); err != nil {
		t.Fatalf("create project: %v", err)
	}

	t.Cleanup(func() {
		if _, err := testPool.Exec(context.Background(), `DELETE FROM project WHERE id = $1`, projectID); err != nil {
			t.Fatalf("cleanup project: %v", err)
		}
	})

	insertProjectVersionFixture(t, projectID)

	w := httptest.NewRecorder()
	req := newRequest("GET", "/api/projects/"+projectID+"/versions", nil)
	req = withURLParam(req, "projectID", projectID)
	testHandler.ListProjectVersions(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("ListProjectVersions: want 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Total    int                      `json:"total"`
		Versions []ProjectVersionResponse `json:"versions"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Total != 1 {
		t.Fatalf("ListProjectVersions: want total=1, got %d", resp.Total)
	}
	if len(resp.Versions) != 1 {
		t.Fatalf("ListProjectVersions: want 1 version, got %d", len(resp.Versions))
	}
	if resp.Versions[0].ProjectID != projectID {
		t.Fatalf("ListProjectVersions: want project_id=%s, got %s", projectID, resp.Versions[0].ProjectID)
	}
	if resp.Versions[0].VersionNumber != 1 {
		t.Fatalf("ListProjectVersions: want version_number=1, got %d", resp.Versions[0].VersionNumber)
	}
}
