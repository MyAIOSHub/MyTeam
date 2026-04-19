-- 066_memory_chunk_pgvector.up.sql
-- Phase 3 of memory + storage foundation: enable pgvector + add
-- memory_chunk table for semantic search over confirmed memories.
--
-- Dim 1024 = DashScope text-embedding-v4 (per user choice 2026-04-19).
-- A future swap to a different-dim embedder requires a new column or
-- a parallel chunk table; pgvector columns are dim-pinned at create.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memory_chunk (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id    UUID NOT NULL REFERENCES memory_record(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    byte_offset  BIGINT NOT NULL DEFAULT 0,
    byte_len     BIGINT NOT NULL DEFAULT 0,
    text         TEXT NOT NULL,
    embedding    vector(1024) NOT NULL,
    model        TEXT NOT NULL,
    dim          INT NOT NULL DEFAULT 1024,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cosine-distance HNSW index for fast top-K. Defaults: m=16, ef=64.
-- Skip if pgvector < 0.5.0 — fall back to ivfflat.
CREATE INDEX IF NOT EXISTS idx_memory_chunk_embedding_hnsw
    ON memory_chunk USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_memory_chunk_memory ON memory_chunk (memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_chunk_workspace ON memory_chunk (workspace_id, model);
