package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

// CreateProjectFromChatRequest is the request body for creating a project from a chat conversation.
type CreateProjectFromChatRequest struct {
	Title       string          `json:"title"`
	Description *string         `json:"description"`
	PlanID      *string         `json:"plan_id,omitempty"`
	Steps       json.RawMessage `json:"steps,omitempty"`
}

// ProjectResponse is the JSON response for a project.
type ProjectResponse struct {
	ID          string  `json:"id"`
	WorkspaceID string  `json:"workspace_id"`
	Title       string  `json:"title"`
	Description *string `json:"description"`
	Status      string  `json:"status"`
	CreatedBy   string  `json:"created_by"`
	PlanID      *string `json:"plan_id"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

func projectToResponse(p db.Project) ProjectResponse {
	return ProjectResponse{
		ID:          uuidToString(p.ID),
		WorkspaceID: uuidToString(p.WorkspaceID),
		Title:       p.Title,
		Description: textToPtr(p.Description),
		Status:      p.Status,
		CreatedBy:   uuidToString(p.CreatedBy),
		PlanID:      uuidToPtr(p.PlanID),
		CreatedAt:   timestampToString(p.CreatedAt),
		UpdatedAt:   timestampToString(p.UpdatedAt),
	}
}

// CreateProjectFromChat creates a project from a chat conversation.
// It creates the project record, an initial project_version, and links to
// the plan if provided.
// POST /api/projects/from-chat
func (h *Handler) CreateProjectFromChat(w http.ResponseWriter, r *http.Request) {
	var req CreateProjectFromChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}

	workspaceID := resolveWorkspaceID(r)
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	// 1. Create the project record
	project, err := h.Queries.CreateProject(r.Context(), db.CreateProjectParams{
		WorkspaceID: parseUUID(workspaceID),
		Title:       req.Title,
		Description: ptrToText(req.Description),
		Status:      "draft",
		CreatedBy:   parseUUID(userID),
		PlanID:      optionalUUID(req.PlanID),
	})
	if err != nil {
		slog.Error("failed to create project", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create project")
		return
	}

	// 2. Create the initial project_version record
	planSnapshot := req.Steps
	if planSnapshot == nil {
		planSnapshot = []byte("[]")
	}

	_, err = h.Queries.CreateProjectVersion(r.Context(), db.CreateProjectVersionParams{
		ProjectID:    project.ID,
		Version:      1,
		Title:        req.Title,
		Description:  ptrToText(req.Description),
		PlanSnapshot: planSnapshot,
		CreatedBy:    parseUUID(userID),
	})
	if err != nil {
		slog.Error("failed to create project version", "error", err)
		// Project was created, version failed — log but continue
	}

	// 3. Link plan to project if plan_id was provided
	if req.PlanID != nil && *req.PlanID != "" {
		err = h.Queries.LinkPlanToProject(r.Context(), db.LinkPlanToProjectParams{
			ID:        parseUUID(*req.PlanID),
			ProjectID: project.ID,
		})
		if err != nil {
			slog.Warn("failed to link plan to project", "plan_id", *req.PlanID, "project_id", uuidToString(project.ID), "error", err)
		}
	}

	// 4. Publish event
	actorType, actorID := h.resolveActor(r, userID, workspaceID)
	h.publish("project.created", workspaceID, actorType, actorID, map[string]string{
		"project_id": uuidToString(project.ID),
	})

	writeJSON(w, http.StatusCreated, projectToResponse(project))
}

// ListProjects lists all projects in a workspace.
// GET /api/projects
func (h *Handler) ListProjects(w http.ResponseWriter, r *http.Request) {
	workspaceID := resolveWorkspaceID(r)

	projects, err := h.Queries.ListProjects(r.Context(), db.ListProjectsParams{
		WorkspaceID: parseUUID(workspaceID),
		Limit:       50,
		Offset:      0,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list projects")
		return
	}

	resp := make([]ProjectResponse, len(projects))
	for i, p := range projects {
		resp[i] = projectToResponse(p)
	}
	writeJSON(w, http.StatusOK, map[string]any{"projects": resp, "total": len(resp)})
}
