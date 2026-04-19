// Package memory: store.go — vector Store interface. Relational ops
// (insert/list memory_record rows) live on *db.Queries; this interface
// is for the embeddings layer ONLY.
//
// Phase 0 contract; pgvector impl + Qdrant alt-impl land in Phase 3.
package memory

import (
	"context"

	"github.com/google/uuid"
)

// Chunk is one indexable unit. Belongs to a Memory; carries the actual
// text + embedding. Persistence in Phase 3 = `memory_chunk` table.
type Chunk struct {
	ID         uuid.UUID `json:"id"`
	MemoryID   uuid.UUID `json:"memory_id"`
	ByteOffset int64     `json:"byte_offset"` // offset into the raw source
	ByteLen    int64     `json:"byte_len"`
	Text       string    `json:"text"`
	Embedding  []float32 `json:"-"` // dim depends on Embedder
	Model      string    `json:"model"`
	Dim        int       `json:"dim"`
}

// Filter narrows a vector search. workspace_id is required by Store
// impls; nil-other-fields means no narrowing.
type Filter struct {
	WorkspaceID uuid.UUID
	Types       []MemoryType
	Scopes      []MemoryScope
	Tags        []string
	Entities    []string
	StatusOnly  []MemoryStatus // default: confirmed only
}

// Hit is one search result with similarity score.
type Hit struct {
	Chunk Chunk
	Score float64 // cosine similarity, [0,1]; higher = closer
}

// Store is the contract for the vector backend (pgvector / Qdrant /
// Weaviate). Relational lookups (memory_record CRUD) bypass this
// interface and go through *db.Queries directly.
type Store interface {
	// Upsert writes chunks; existing rows by Chunk.ID are replaced.
	Upsert(ctx context.Context, chunks []Chunk) error

	// Search returns top-K chunks by cosine similarity to the embedding,
	// narrowed by filter.
	Search(ctx context.Context, embedding []float32, topK int, filter Filter) ([]Hit, error)

	// DeleteByMemory removes every chunk for a memory_id (cascade on
	// memory deletion or re-index).
	DeleteByMemory(ctx context.Context, memoryID uuid.UUID) error

	// ReplaceByMemory atomically deletes existing chunks for memoryID and
	// inserts the new ones in a single transaction. Solves the gap left
	// by Delete+Upsert: if Upsert fails or the process crashes mid-write,
	// the prior chunks stay in place instead of leaving the memory with
	// zero searchable chunks. Issue #65.
	ReplaceByMemory(ctx context.Context, memoryID uuid.UUID, chunks []Chunk) error
}
