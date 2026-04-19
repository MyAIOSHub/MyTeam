// Package memory: pgvector_store.go — Store impl backed by Postgres
// pgvector. Bypasses sqlc because vector(N) types aren't first-class
// in sqlc; uses raw pgx via *pgxpool.Pool.
//
// Design intent (per plan §3): swap to Qdrant / Weaviate by writing
// another file that satisfies the Store interface. Caller (Memory MCP
// tool / search handler) only sees the interface.
package memory

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	pgvec "github.com/pgvector/pgvector-go"
)

// PgvectorStore implements Store against the memory_chunk table from
// migration 066. Pool is required (sqlc Queries doesn't carry vector
// support).
type PgvectorStore struct {
	Pool *pgxpool.Pool
	Dim  int // expected embedding dim; rejects mismatched Upsert input
}

func NewPgvectorStore(pool *pgxpool.Pool, dim int) *PgvectorStore {
	if dim <= 0 {
		dim = 1024
	}
	return &PgvectorStore{Pool: pool, Dim: dim}
}

// ErrDimMismatch is returned when an input chunk's embedding length
// doesn't match the store's pinned dim. Catches accidental embedder
// swaps that would corrupt the index.
var ErrDimMismatch = errors.New("memory: embedding dim mismatch")

func (s *PgvectorStore) Upsert(ctx context.Context, chunks []Chunk) error {
	if len(chunks) == 0 {
		return nil
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx)

	// Pull workspace_id from the parent memory_record. All chunks in a
	// batch must share memory_id (caller convention) so one lookup is
	// fine; defensive code lookups per-chunk.
	wsCache := map[uuid.UUID]uuid.UUID{}
	for _, c := range chunks {
		if len(c.Embedding) != s.Dim {
			return fmt.Errorf("%w: chunk %s has dim %d, want %d",
				ErrDimMismatch, c.ID, len(c.Embedding), s.Dim)
		}
		wsID, ok := wsCache[c.MemoryID]
		if !ok {
			row := tx.QueryRow(ctx,
				`SELECT workspace_id FROM memory_record WHERE id = $1`, c.MemoryID)
			var wsPg pgvecUUIDScan
			if err := row.Scan(&wsPg); err != nil {
				return fmt.Errorf("lookup memory %s: %w", c.MemoryID, err)
			}
			wsID = uuid.UUID(wsPg)
			wsCache[c.MemoryID] = wsID
		}
		if c.ID == uuid.Nil {
			c.ID = uuid.New()
		}
		if c.Dim == 0 {
			c.Dim = s.Dim
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO memory_chunk
				(id, memory_id, workspace_id, byte_offset, byte_len,
				 text, embedding, model, dim)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			ON CONFLICT (id) DO UPDATE SET
				memory_id = EXCLUDED.memory_id,
				workspace_id = EXCLUDED.workspace_id,
				byte_offset = EXCLUDED.byte_offset,
				byte_len = EXCLUDED.byte_len,
				text = EXCLUDED.text,
				embedding = EXCLUDED.embedding,
				model = EXCLUDED.model,
				dim = EXCLUDED.dim
		`, c.ID, c.MemoryID, wsID, c.ByteOffset, c.ByteLen,
			c.Text, pgvec.NewVector(c.Embedding), c.Model, c.Dim)
		if err != nil {
			return fmt.Errorf("upsert chunk %s: %w", c.ID, err)
		}
	}
	return tx.Commit(ctx)
}

func (s *PgvectorStore) Search(ctx context.Context, embedding []float32, topK int, filter Filter) ([]Hit, error) {
	if len(embedding) != s.Dim {
		return nil, fmt.Errorf("%w: query dim %d, want %d",
			ErrDimMismatch, len(embedding), s.Dim)
	}
	if topK <= 0 {
		topK = 10
	}
	if filter.WorkspaceID == uuid.Nil {
		return nil, fmt.Errorf("memory.Search: workspace_id required")
	}

	// Build WHERE clause: workspace + optional join filters into
	// memory_record for type/scope/status narrowing. Args use $-numbered
	// placeholders.
	var conds []string
	args := []any{filter.WorkspaceID}
	conds = append(conds, "c.workspace_id = $1")
	idx := 2
	if len(filter.Types) > 0 {
		conds = append(conds, fmt.Sprintf("m.type = ANY($%d::text[])", idx))
		args = append(args, stringSliceFromTypes(filter.Types))
		idx++
	}
	if len(filter.Scopes) > 0 {
		conds = append(conds, fmt.Sprintf("m.scope = ANY($%d::text[])", idx))
		args = append(args, stringSliceFromScopes(filter.Scopes))
		idx++
	}
	statuses := filter.StatusOnly
	if len(statuses) == 0 {
		statuses = []MemoryStatus{StatusConfirmed}
	}
	conds = append(conds, fmt.Sprintf("m.status = ANY($%d::text[])", idx))
	args = append(args, stringSliceFromStatuses(statuses))
	idx++
	args = append(args, pgvec.NewVector(embedding))
	queryVecPos := idx
	idx++
	args = append(args, topK)
	limitPos := idx

	// Cosine distance in pgvector = `<=>`. Score = 1 - distance.
	q := fmt.Sprintf(`
		SELECT c.id, c.memory_id, c.byte_offset, c.byte_len,
		       c.text, c.model, c.dim,
		       1 - (c.embedding <=> $%d) AS score
		FROM memory_chunk c
		JOIN memory_record m ON m.id = c.memory_id
		WHERE %s
		ORDER BY c.embedding <=> $%d
		LIMIT $%d
	`, queryVecPos, strings.Join(conds, " AND "), queryVecPos, limitPos)

	rows, err := s.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("search: %w", err)
	}
	defer rows.Close()
	var hits []Hit
	for rows.Next() {
		var h Hit
		if err := rows.Scan(
			&h.Chunk.ID,
			&h.Chunk.MemoryID,
			&h.Chunk.ByteOffset,
			&h.Chunk.ByteLen,
			&h.Chunk.Text,
			&h.Chunk.Model,
			&h.Chunk.Dim,
			&h.Score,
		); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		hits = append(hits, h)
	}
	return hits, rows.Err()
}

func (s *PgvectorStore) DeleteByMemory(ctx context.Context, memoryID uuid.UUID) error {
	_, err := s.Pool.Exec(ctx,
		`DELETE FROM memory_chunk WHERE memory_id = $1`, memoryID)
	if err != nil {
		return fmt.Errorf("delete chunks for memory %s: %w", memoryID, err)
	}
	return nil
}

// pgvecUUIDScan exists to give pgx a destination for the workspace_id
// scan. uuid.UUID alone doesn't satisfy pgx.Scanner.
type pgvecUUIDScan [16]byte

func (u *pgvecUUIDScan) Scan(src any) error {
	switch v := src.(type) {
	case [16]byte:
		copy(u[:], v[:])
		return nil
	case []byte:
		if len(v) != 16 {
			return fmt.Errorf("uuid: bad len %d", len(v))
		}
		copy(u[:], v)
		return nil
	case string:
		parsed, err := uuid.Parse(v)
		if err != nil {
			return err
		}
		copy(u[:], parsed[:])
		return nil
	}
	return fmt.Errorf("uuid: unsupported type %T", src)
}

func stringSliceFromTypes(in []MemoryType) []string {
	out := make([]string, len(in))
	for i, t := range in {
		out[i] = string(t)
	}
	return out
}
func stringSliceFromScopes(in []MemoryScope) []string {
	out := make([]string, len(in))
	for i, s := range in {
		out[i] = string(s)
	}
	return out
}
func stringSliceFromStatuses(in []MemoryStatus) []string {
	out := make([]string, len(in))
	for i, s := range in {
		out[i] = string(s)
	}
	return out
}

// Compile-time interface assertion.
var _ Store = (*PgvectorStore)(nil)

// Silence the `errors`-only-used-in-doc linter.
var _ = pgx.ErrNoRows
