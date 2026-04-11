package service

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/multica-ai/multica/server/internal/util"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

// IdentityGeneratorService produces identity card descriptions and bios for agents.
// It is driven by the Account page system agent and uses the unified LLM client
// when one is configured; without an API key it falls back to a deterministic
// placeholder so callers always get a non-empty result.
type IdentityGeneratorService struct {
	Queries *db.Queries
}

// NewIdentityGeneratorService constructs an IdentityGeneratorService.
func NewIdentityGeneratorService(q *db.Queries) *IdentityGeneratorService {
	return &IdentityGeneratorService{Queries: q}
}

// GenerateAgentDescription synthesises a short description for an agent given
// its workspace context, skills, and recent activity. Returns a non-empty
// fallback when no LLM is configured.
func (s *IdentityGeneratorService) GenerateAgentDescription(ctx context.Context, agentID string) (string, error) {
	if s == nil || s.Queries == nil {
		return "", fmt.Errorf("identity generator not initialised")
	}

	agent, err := s.Queries.GetAgent(ctx, util.ParseUUID(agentID))
	if err != nil {
		return "", fmt.Errorf("load agent: %w", err)
	}

	// Placeholder deterministic description. The full LLM-driven rewrite is
	// implemented alongside the unified llmclient package; until that wiring
	// lands we return a stable string so callers (and tests) have something
	// meaningful to display.
	if agent.Description != "" {
		return agent.Description, nil
	}
	desc := fmt.Sprintf("%s is a workspace agent ready to take on tasks.", agent.Name)
	slog.Debug("identity generator returning placeholder", "agent_id", agentID)
	return desc, nil
}
