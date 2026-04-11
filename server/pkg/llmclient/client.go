// Package llmclient provides a minimal OpenAI-compatible chat client.
// It works with DashScope, OpenAI, and any API that follows the
// OpenAI /chat/completions request/response shape.
package llmclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

// Config configures an LLM client.
type Config struct {
	Endpoint  string // e.g. "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
	APIKey    string
	Model     string
	MaxTokens int
}

// DashScope returns a Config pre-filled for the DashScope API.
func DashScope(apiKey string) Config {
	return Config{
		Endpoint:  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
		APIKey:    apiKey,
		Model:     "qwen-plus",
		MaxTokens: 4096,
	}
}

// DashScopeFromEnv reads DASHSCOPE_API_KEY from the environment.
func DashScopeFromEnv() Config {
	return DashScope(os.Getenv("DASHSCOPE_API_KEY"))
}

// Message is a chat message.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Client is a simple OpenAI-compatible chat client.
type Client struct {
	cfg    Config
	client *http.Client
}

// New creates a new Client.
func New(cfg Config) *Client {
	if cfg.MaxTokens == 0 {
		cfg.MaxTokens = 4096
	}
	return &Client{cfg: cfg, client: &http.Client{}}
}

// chatRequest is the OpenAI-compatible request body.
type chatRequest struct {
	Model     string    `json:"model"`
	Messages  []Message `json:"messages"`
	MaxTokens int       `json:"max_tokens"`
}

// chatResponse is the OpenAI-compatible response body.
type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

// Chat sends a chat completion request and returns the assistant's reply.
func (c *Client) Chat(ctx context.Context, systemPrompt string, messages []Message) (string, error) {
	if c.cfg.APIKey == "" {
		return "", fmt.Errorf("llmclient: API key is empty")
	}

	allMessages := make([]Message, 0, len(messages)+1)
	if systemPrompt != "" {
		allMessages = append(allMessages, Message{Role: "system", Content: systemPrompt})
	}
	allMessages = append(allMessages, messages...)

	body := chatRequest{
		Model:     c.cfg.Model,
		Messages:  allMessages,
		MaxTokens: c.cfg.MaxTokens,
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("llmclient: marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.cfg.Endpoint, bytes.NewReader(payload))
	if err != nil {
		return "", fmt.Errorf("llmclient: create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.cfg.APIKey)

	resp, err := c.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("llmclient: request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("llmclient: read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("llmclient: HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	var chatResp chatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return "", fmt.Errorf("llmclient: unmarshal response: %w", err)
	}

	if len(chatResp.Choices) == 0 {
		return "", fmt.Errorf("llmclient: no choices in response")
	}

	return chatResp.Choices[0].Message.Content, nil
}
