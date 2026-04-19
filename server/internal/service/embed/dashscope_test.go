package embed

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDashScopeClient_HappyPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer sk-test" {
			t.Errorf("missing/wrong bearer: %q", r.Header.Get("Authorization"))
		}
		var req dashscopeReq
		_ = json.NewDecoder(r.Body).Decode(&req)
		// Echo two distinct embeddings for two inputs.
		out := dashscopeResp{}
		for i := range req.Input.Texts {
			out.Output.Embeddings = append(out.Output.Embeddings, struct {
				TextIndex int       `json:"text_index"`
				Embedding []float32 `json:"embedding"`
			}{TextIndex: i, Embedding: []float32{float32(i + 1), 0.5, -0.5}})
		}
		_ = json.NewEncoder(w).Encode(out)
	}))
	defer srv.Close()

	c := NewDashScopeClient("sk-test", "text-embedding-v4")
	c.Endpoint = srv.URL
	c.HTTP = srv.Client()

	vecs, err := c.Embed(context.Background(), []string{"alpha", "beta"})
	if err != nil {
		t.Fatalf("Embed: %v", err)
	}
	if len(vecs) != 2 {
		t.Fatalf("got %d vectors", len(vecs))
	}
	if vecs[0][0] != 1 || vecs[1][0] != 2 {
		t.Errorf("vectors not in input order: %v", vecs)
	}
	if c.Dim() != 1024 || c.Model() != "text-embedding-v4" {
		t.Errorf("dim/model: %d/%s", c.Dim(), c.Model())
	}
}

func TestDashScopeClient_RedactsKeyInError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		// Pretend the upstream echoes the auth header (some proxies do).
		_, _ = w.Write([]byte(`{"error": "bad key sk-leaked-secret"}`))
	}))
	defer srv.Close()

	c := NewDashScopeClient("sk-leaked-secret", "text-embedding-v4")
	c.Endpoint = srv.URL
	c.HTTP = srv.Client()

	_, err := c.Embed(context.Background(), []string{"x"})
	if err == nil {
		t.Fatal("expected error")
	}
	if strings.Contains(err.Error(), "sk-leaked-secret") {
		t.Errorf("api key leaked into error: %v", err)
	}
	if !strings.Contains(err.Error(), "REDACTED") {
		t.Errorf("redaction marker missing: %v", err)
	}
}

func TestDashScopeClient_EmptyInput(t *testing.T) {
	c := NewDashScopeClient("sk", "text-embedding-v4")
	out, err := c.Embed(context.Background(), nil)
	if err != nil || out != nil {
		t.Errorf("empty input: out=%v err=%v", out, err)
	}
}
