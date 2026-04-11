package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/multica-ai/multica/server/internal/util"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

// CloudLLMConfig is the JSON shape stored in agent.cloud_llm_config.
type CloudLLMConfig struct {
	Endpoint string `json:"endpoint,omitempty"`
	APIKey   string `json:"api_key,omitempty"`
	Model    string `json:"model,omitempty"`
}

// EnsurePersonalAgent creates a cloud personal agent for an owner if one doesn't exist.
// It also ensures a cloud runtime exists for the workspace.
func EnsurePersonalAgent(ctx context.Context, queries *db.Queries, workspaceID, ownerID pgtype.UUID, userName string) (db.Agent, error) {
	// Check if personal agent already exists.
	existing, err := queries.GetPersonalAgent(ctx, db.GetPersonalAgentParams{
		WorkspaceID: workspaceID,
		OwnerID:     ownerID,
	})
	if err == nil {
		return existing, nil
	}

	// Ensure cloud runtime exists for the workspace.
	runtime, err := queries.EnsureCloudRuntime(ctx, workspaceID)
	if err != nil {
		return db.Agent{}, fmt.Errorf("ensure cloud runtime: %w", err)
	}

	// Build cloud LLM config from environment.
	apiKey := os.Getenv("DASHSCOPE_API_KEY")
	if apiKey == "" {
		apiKey = "sk-b7085211c57b474e838936c8e6381b2b"
	}

	llmConfig := CloudLLMConfig{
		Endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
		APIKey:   apiKey,
		Model:    "qwen-plus",
	}
	configJSON, _ := json.Marshal(llmConfig)

	triggers, _ := json.Marshal([]map[string]any{
		{"type": "on_assign", "enabled": true},
		{"type": "on_comment", "enabled": true},
		{"type": "on_mention", "enabled": true},
	})

	agentName := userName + "'s Assistant"
	agent, err := queries.CreatePersonalAgent(ctx, db.CreatePersonalAgentParams{
		WorkspaceID:    workspaceID,
		Name:           agentName,
		Description:    "Personal AI assistant powered by cloud LLM",
		RuntimeID:      runtime.ID,
		OwnerID:        ownerID,
		CloudLlmConfig: configJSON,
		Triggers:       triggers,
	})
	if err != nil {
		return db.Agent{}, fmt.Errorf("create personal agent: %w", err)
	}

	slog.Info("personal agent created",
		"agent_id", util.UUIDToString(agent.ID),
		"owner_id", util.UUIDToString(ownerID),
		"workspace_id", util.UUIDToString(workspaceID),
	)

	return agent, nil
}
