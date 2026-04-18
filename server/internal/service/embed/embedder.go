// Package embed: embedder.go — Embedder interface for memory indexing.
// Phase 0 contract only; concrete impls (DashScope text-embedding-v4,
// future OpenAI / Anthropic) land in Phase 3.
//
// Design intent (per plan §0):
//   - Swap embedding model per-workspace via workspace_secret config.
//   - Dim is exposed because pgvector columns are dim-pinned at create
//     time; a dim change forces a full re-index. Phase 3 stores Model()
//     + Dim() per chunk row so re-index can detect a stale embedder.
package embed

import "context"

// Embedder turns text into a vector. Batch API because embedding APIs
// are charged per request, not per text — batching matters.
type Embedder interface {
	// Embed returns one vector per input text, in the same order.
	// All vectors share the embedder's Dim(). Returns error if any
	// single text exceeds the upstream's per-token limit (caller is
	// responsible for chunking before calling).
	Embed(ctx context.Context, texts []string) ([][]float32, error)

	// Dim is the vector dimensionality. Stable for the lifetime of an
	// Embedder instance. text-embedding-v4 = 1024.
	Dim() int

	// Model is the upstream model id (e.g. "text-embedding-v4"). Stored
	// alongside chunks so a future swap can detect mixed-model rows.
	Model() string
}
