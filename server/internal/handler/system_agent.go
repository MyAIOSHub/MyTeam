package handler

import (
	"log/slog"
	"net/http"

	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

// GetOrCreateSystemAgent — GET /api/system-agent
// Returns the workspace system agent, creating one if it doesn't exist.
func (h *Handler) GetOrCreateSystemAgent(w http.ResponseWriter, r *http.Request) {
	workspaceID := resolveWorkspaceID(r)
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

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
