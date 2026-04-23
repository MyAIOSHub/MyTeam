package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/MyAIOSHub/MyTeam/server/pkg/db/generated"
)

type createLocalAgentRequest struct {
	RuntimeID string `json:"runtime_id"`
	Name      string `json:"name,omitempty"`
}

// ListLocalAgents returns the caller's local_agent rows in the current
// workspace.
//
// GET /api/agents/local
func (h *Handler) ListLocalAgents(w http.ResponseWriter, r *http.Request) {
	workspaceID := resolveWorkspaceID(r)
	if workspaceID == "" {
		writeError(w, http.StatusBadRequest, "workspace_id is required")
		return
	}
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	rows, err := h.Queries.ListLocalAgentsByOwner(r.Context(), db.ListLocalAgentsByOwnerParams{
		WorkspaceID: parseUUID(workspaceID),
		OwnerID:     parseUUID(userID),
	})
	if err != nil {
		slog.Error("list local agents failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to list local agents")
		return
	}

	out := make([]AgentResponse, 0, len(rows))
	for _, a := range rows {
		out = append(out, agentToResponse(a))
	}
	writeJSON(w, http.StatusOK, out)
}

// CreateLocalAgent binds a daemon runtime to a new local_agent row owned
// by the caller. Default name is "<user-name> · <runtime-name>" and can
// be overridden in the request body.
//
// POST /api/agents/local
func (h *Handler) CreateLocalAgent(w http.ResponseWriter, r *http.Request) {
	workspaceID := resolveWorkspaceID(r)
	if workspaceID == "" {
		writeError(w, http.StatusBadRequest, "workspace_id is required")
		return
	}
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	var req createLocalAgentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RuntimeID == "" {
		writeError(w, http.StatusBadRequest, "runtime_id is required")
		return
	}

	runtimeUUID := parseUUID(req.RuntimeID)
	runtime, err := h.Queries.GetAgentRuntimeForWorkspace(r.Context(), db.GetAgentRuntimeForWorkspaceParams{
		ID:          runtimeUUID,
		WorkspaceID: parseUUID(workspaceID),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "runtime not found in this workspace")
			return
		}
		slog.Error("load runtime for local agent failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load runtime")
		return
	}
	if !runtime.Mode.Valid || runtime.Mode.String != "local" {
		writeError(w, http.StatusBadRequest, "runtime is not a local runtime")
		return
	}

	name := req.Name
	if name == "" {
		user, userErr := h.Queries.GetUser(r.Context(), parseUUID(userID))
		userDisplay := "user"
		if userErr == nil && user.Name != "" {
			userDisplay = user.Name
		}
		name = fmt.Sprintf("%s · %s", userDisplay, runtime.Name)
	}

	agent, err := h.Queries.CreateLocalAgent(r.Context(), db.CreateLocalAgentParams{
		WorkspaceID: parseUUID(workspaceID),
		Name:        name,
		Description: "Local runtime agent",
		RuntimeID:   runtimeUUID,
		OwnerID:     parseUUID(userID),
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, http.StatusConflict, "local agent for this runtime already exists")
			return
		}
		slog.Error("create local agent failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create local agent")
		return
	}

	writeJSON(w, http.StatusCreated, agentToResponse(agent))
}

// ArchiveLocalAgent soft-deletes a local_agent the caller owns.
//
// DELETE /api/agents/local/{id}
func (h *Handler) ArchiveLocalAgent(w http.ResponseWriter, r *http.Request) {
	workspaceID := resolveWorkspaceID(r)
	if workspaceID == "" {
		writeError(w, http.StatusBadRequest, "workspace_id is required")
		return
	}
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "id is required")
		return
	}

	existing, err := h.Queries.GetAgent(r.Context(), parseUUID(id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "local agent not found")
			return
		}
		slog.Error("lookup local agent failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load local agent")
		return
	}
	if existing.AgentType != "local_agent" ||
		uuidToString(existing.WorkspaceID) != workspaceID ||
		uuidToString(existing.OwnerID) != userID {
		writeError(w, http.StatusNotFound, "local agent not found")
		return
	}

	if err := h.Queries.ArchiveLocalAgent(r.Context(), db.ArchiveLocalAgentParams{
		ID:         parseUUID(id),
		ArchivedBy: pgtype.UUID{Bytes: parseUUID(userID).Bytes, Valid: true},
	}); err != nil {
		slog.Error("archive local agent failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to archive local agent")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
