package handler

import (
	"log/slog"
	"net/http"

	"github.com/multica-ai/multica/server/internal/service"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

// GetOrCreateSystemAgent — GET /api/system-agent
// Returns the workspace system agent, creating one if it doesn't exist.
// Also ensures a personal agent exists for the current user.
func (h *Handler) GetOrCreateSystemAgent(w http.ResponseWriter, r *http.Request) {
	workspaceID := resolveWorkspaceID(r)
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	// Ensure personal agent exists for the user (fire-and-forget).
	go func() {
		user, err := h.Queries.GetUser(r.Context(), parseUUID(userID))
		if err != nil {
			return
		}
		if _, err := service.EnsurePersonalAgent(r.Context(), h.Queries, parseUUID(workspaceID), parseUUID(userID), user.Name); err != nil {
			slog.Debug("ensure personal agent failed", "error", err)
		}
	}()

	// Try to get existing
	agent, err := h.Queries.GetSystemAgent(r.Context(), parseUUID(workspaceID))
	if err == nil {
		writeJSON(w, http.StatusOK, agentToResponse(agent))
		return
	}

	// Create system agent
	agent, err = h.Queries.CreateSystemAgent(r.Context(), db.CreateSystemAgentParams{
		WorkspaceID: parseUUID(workspaceID),
		OwnerID:     parseUUID(userID),
	})
	if err != nil {
		slog.Warn("create system agent failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create system agent")
		return
	}

	h.publish("agent:created", workspaceID, "system", userID, map[string]any{
		"agent":     agentToResponse(agent),
		"is_system": true,
	})

	writeJSON(w, http.StatusCreated, agentToResponse(agent))
}
