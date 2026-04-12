package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/multica-ai/multica/server/internal/util"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

// IdentityCard represents a generated identity card for an agent.
type IdentityCard struct {
	AgentID     string   `json:"agent_id"`
	DisplayName string   `json:"display_name"`
	Bio         string   `json:"bio"`
	Tags        []string `json:"tags"`
}

// IdentityGeneratorService generates and updates agent identity cards
// based on their recent activity and capabilities.
type IdentityGeneratorService struct {
	Queries *db.Queries
}

// NewIdentityGeneratorService creates a new IdentityGeneratorService.
func NewIdentityGeneratorService(q *db.Queries) *IdentityGeneratorService {
	return &IdentityGeneratorService{Queries: q}
}

// GenerateCard generates an identity card for an agent based on its profile and activity.
func (s *IdentityGeneratorService) GenerateCard(ctx context.Context, agentID string, workspaceID string) (*IdentityCard, error) {
	agent, err := s.Queries.GetAgent(ctx, util.ParseUUID(agentID))
	if err != nil {
		return nil, fmt.Errorf("get agent: %w", err)
	}

	// Build identity card from agent profile and capabilities
	displayName := agent.Name
	if agent.DisplayName.Valid && agent.DisplayName.String != "" {
		displayName = agent.DisplayName.String
	}

	bio := agent.Description
	if agent.Bio.Valid && agent.Bio.String != "" {
		bio = agent.Bio.String
	}

	tags := agent.Tags
	if len(tags) == 0 {
		tags = agent.Capabilities
	}

	card := &IdentityCard{
		AgentID:     agentID,
		DisplayName: displayName,
		Bio:         bio,
		Tags:        tags,
	}

	return card, nil
}

// SaveCard persists a generated identity card to the agent profile.
func (s *IdentityGeneratorService) SaveCard(ctx context.Context, card *IdentityCard) error {
	agentID := util.ParseUUID(card.AgentID)

	metadata, _ := json.Marshal(map[string]any{
		"identity_card": card,
	})

	return s.Queries.UpdateAgentProfile(ctx, db.UpdateAgentProfileParams{
		ID:            agentID,
		DisplayName:   pgtype.Text{String: card.DisplayName, Valid: card.DisplayName != ""},
		Bio:           pgtype.Text{String: card.Bio, Valid: card.Bio != ""},
		Tags:          card.Tags,
		AgentMetadata: metadata,
	})
}

// GenerateAndSave generates an identity card and saves it.
func (s *IdentityGeneratorService) GenerateAndSave(ctx context.Context, agentID string, workspaceID string) error {
	card, err := s.GenerateCard(ctx, agentID, workspaceID)
	if err != nil {
		return err
	}
	slog.Debug("[identity-generator] card generated", "agent_id", agentID, "display_name", card.DisplayName)
	return s.SaveCard(ctx, card)
}
