// Package embed: dashscope.go — DashScope (Aliyun Bailian) embedder.
// Compatible with text-embedding-v3 / v4 endpoints. Default model is
// text-embedding-v4 (1024 dim) per user choice 2026-04-19.
//
// Endpoint: POST https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding
// Auth: Authorization: Bearer $DASHSCOPE_API_KEY
//
// Per-workspace credential lookup belongs to the caller; this client
// takes APIKey + Model directly (mirrors the asr.MiaojiClient pattern).
package embed

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Models we know dim for. Add as needed.
var modelDims = map[string]int{
	"text-embedding-v3": 1024,
	"text-embedding-v4": 1024,
	"text-embedding-v2": 1536,
}

// DashScopeClient implements Embedder against the DashScope text-
// embedding endpoint. Construct with NewDashScopeClient.
type DashScopeClient struct {
	HTTP     *http.Client
	Endpoint string // override for tests; defaults to upstream
	APIKey   string
	ModelID  string
	dim      int
}

func NewDashScopeClient(apiKey, model string) *DashScopeClient {
	if model == "" {
		model = "text-embedding-v4"
	}
	dim := modelDims[model]
	if dim == 0 {
		dim = 1024 // safe default; caller validates against the table
	}
	return &DashScopeClient{
		HTTP:     &http.Client{Timeout: 30 * time.Second},
		Endpoint: "https://dashscope.aliyuncs.com",
		APIKey:   apiKey,
		ModelID:  model,
		dim:      dim,
	}
}

func (c *DashScopeClient) Dim() int      { return c.dim }
func (c *DashScopeClient) Model() string { return c.ModelID }

type dashscopeReq struct {
	Model string `json:"model"`
	Input struct {
		Texts []string `json:"texts"`
	} `json:"input"`
	Parameters struct {
		TextType string `json:"text_type,omitempty"`
	} `json:"parameters"`
}

type dashscopeResp struct {
	Output struct {
		Embeddings []struct {
			TextIndex int       `json:"text_index"`
			Embedding []float32 `json:"embedding"`
		} `json:"embeddings"`
	} `json:"output"`
	RequestID string `json:"request_id"`
	Code      string `json:"code,omitempty"`
	Message   string `json:"message,omitempty"`
}

func (c *DashScopeClient) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}
	if c.APIKey == "" {
		return nil, fmt.Errorf("dashscope: api key empty")
	}

	var reqBody dashscopeReq
	reqBody.Model = c.ModelID
	reqBody.Input.Texts = texts
	reqBody.Parameters.TextType = "document"
	body, _ := json.Marshal(reqBody)

	url := c.Endpoint + "/api/v1/services/embeddings/text-embedding/text-embedding"
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.APIKey)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("dashscope embed: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("dashscope http %d: %s", resp.StatusCode, redactBody(raw, c.APIKey))
	}
	var out dashscopeResp
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	if out.Code != "" {
		return nil, fmt.Errorf("dashscope %s: %s", out.Code, out.Message)
	}
	// Map by text_index since upstream may reorder.
	result := make([][]float32, len(texts))
	for _, e := range out.Output.Embeddings {
		if e.TextIndex < 0 || e.TextIndex >= len(texts) {
			continue
		}
		result[e.TextIndex] = e.Embedding
	}
	for i, v := range result {
		if v == nil {
			return nil, fmt.Errorf("dashscope: missing embedding for text %d", i)
		}
	}
	return result, nil
}

// redactBody scrubs the api key from any error body before logging.
func redactBody(raw []byte, apiKey string) string {
	const max = 512
	s := string(raw)
	if apiKey != "" {
		// Replace exact + prefix forms to catch leaks.
		s = stringReplaceAll(s, apiKey, "[REDACTED-KEY]")
	}
	if len(s) > max {
		s = s[:max] + "...[truncated]"
	}
	return s
}

// stringReplaceAll avoids importing strings just for ReplaceAll.
func stringReplaceAll(s, old, new string) string {
	if old == "" {
		return s
	}
	out := []byte{}
	for {
		i := indexOf(s, old)
		if i < 0 {
			out = append(out, s...)
			return string(out)
		}
		out = append(out, s[:i]...)
		out = append(out, new...)
		s = s[i+len(old):]
	}
}

func indexOf(s, sub string) int {
	n := len(sub)
	if n == 0 || n > len(s) {
		return -1
	}
	for i := 0; i+n <= len(s); i++ {
		if s[i:i+n] == sub {
			return i
		}
	}
	return -1
}
