package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListProvidersReturnsRegistry(t *testing.T) {
	h := NewProviderHandler()
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/providers", nil)
	h.List(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status %d, body %s", rr.Code, rr.Body.String())
	}

	var got []map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got) != 4 {
		t.Errorf("expected 4 providers, got %d", len(got))
	}

	if rr.Header().Get("Content-Type") != "application/json" {
		t.Errorf("expected JSON content-type, got %q", rr.Header().Get("Content-Type"))
	}
}
