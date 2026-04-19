package memory

import (
	"context"
	"errors"
	"math/rand"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func newTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func randVec(t *testing.T, dim int) []float32 {
	t.Helper()
	r := rand.New(rand.NewSource(int64(dim) + int64(rand.Int())))
	v := make([]float32, dim)
	for i := range v {
		v[i] = r.Float32()
	}
	return v
}

func TestPgvectorStore_UpsertSearchDelete(t *testing.T) {
	pool := newTestPool(t)
	ctx := context.Background()

	// Reuse seedFile from service_test.go to get workspace + file +
	// then build a memory_record pointing at it.
	q := newTestQ(t)
	wsID, userID, fileID := seedFile(t, q)
	svc := NewService(q)
	mem, err := svc.Append(ctx, AppendInput{
		WorkspaceID: wsID,
		Type:        TypeSummary,
		Scope:       ScopeSharedSummary,
		Source:      "test",
		Raw:         RawRef{Kind: RawFileIndex, ID: fileID},
		Summary:     "vec test",
		Status:      StatusConfirmed, // Search default filters confirmed
		CreatedBy:   userID,
	})
	if err != nil {
		t.Fatalf("append: %v", err)
	}

	store := NewPgvectorStore(pool, 1024)

	// Upsert two chunks under that memory.
	chunkA := Chunk{
		MemoryID:  mem.ID,
		Text:      "alpha",
		Embedding: randVec(t, 1024),
		Model:     "text-embedding-v4",
		Dim:       1024,
	}
	chunkB := Chunk{
		MemoryID:  mem.ID,
		Text:      "beta",
		Embedding: randVec(t, 1024),
		Model:     "text-embedding-v4",
		Dim:       1024,
	}
	if err := store.Upsert(ctx, []Chunk{chunkA, chunkB}); err != nil {
		t.Fatalf("upsert: %v", err)
	}

	// Search by chunkA's embedding — chunkA should rank top.
	hits, err := store.Search(ctx, chunkA.Embedding, 5, Filter{
		WorkspaceID: wsID,
	})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(hits) < 1 {
		t.Fatalf("no hits")
	}
	if hits[0].Score < 0.9 {
		t.Errorf("self-similarity should be ~1, got %v", hits[0].Score)
	}

	// Wrong dim → ErrDimMismatch.
	if _, err := store.Search(ctx, []float32{0.1, 0.2}, 1, Filter{WorkspaceID: wsID}); !errors.Is(err, ErrDimMismatch) {
		t.Errorf("want ErrDimMismatch, got %v", err)
	}

	// Delete by memory → no hits.
	if err := store.DeleteByMemory(ctx, mem.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	hits, err = store.Search(ctx, chunkA.Embedding, 5, Filter{WorkspaceID: wsID})
	if err != nil {
		t.Fatalf("search after delete: %v", err)
	}
	if len(hits) != 0 {
		t.Errorf("want 0 hits after delete, got %d", len(hits))
	}
}

func TestPgvectorStore_DimMismatchOnUpsert(t *testing.T) {
	pool := newTestPool(t)
	store := NewPgvectorStore(pool, 1024)
	bad := Chunk{
		ID:        uuid.New(),
		MemoryID:  uuid.New(),
		Text:      "x",
		Embedding: []float32{1, 2, 3}, // dim 3, not 1024
		Model:     "test",
	}
	if err := store.Upsert(context.Background(), []Chunk{bad}); !errors.Is(err, ErrDimMismatch) {
		t.Fatalf("want ErrDimMismatch, got %v", err)
	}
}
