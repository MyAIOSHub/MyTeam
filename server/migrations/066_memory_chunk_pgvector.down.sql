-- Reverse 066. Keep pgvector extension installed (it may be used by
-- other tables); just drop the chunk table + indexes.

DROP INDEX IF EXISTS idx_memory_chunk_workspace;
DROP INDEX IF EXISTS idx_memory_chunk_memory;
DROP INDEX IF EXISTS idx_memory_chunk_embedding_hnsw;
DROP TABLE IF EXISTS memory_chunk;
