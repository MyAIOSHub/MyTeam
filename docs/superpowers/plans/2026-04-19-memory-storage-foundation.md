# Memory + Storage Foundation (Phases 0-2)

**User decisions (2026-04-19)**: TOS via S3-compatible (B), embedding `text-embedding-v4` (1024-dim), phasing B (推 0+1+2 ~3 天后停看效果).

**Hard constraints from user**:
1. Data store, memory algo, agent SDK MUST be replaceable → all behind interfaces
2. Raw data MUST be preserved — derived/indexed records reference raw, never overwrite

**Architecture target** (per user-supplied reference doc, "本地优先 + 云端索引 + 事件同步"):
- Raw data + private memories → local/file_index
- Summaries + structured entities + embeddings → cloud (postgres + pgvector)
- Sync via events, not full-DB mirror
- Unified `Memory` record so local-agent and cloud-agent speak same language

---

## Phase 0 — Interface scaffolding (~0.5 day)

**Goal**: lock the seams before any backend lands. Future swaps touch one file each.

### Files

- `server/internal/storage/storage.go` — NEW. `Storage` interface:
  ```go
  type Storage interface {
      Put(ctx, key string, body io.Reader, contentType string) (storagePath string, err error)
      Get(ctx, storagePath string) (io.ReadCloser, error)
      Presign(ctx, storagePath string, ttl time.Duration) (url string, err error)
      Delete(ctx, storagePath string) error
      Backend() string  // "s3" | "tos" | "local"
  }
  ```
- `server/internal/storage/s3.go` — EDIT. Wrap existing `S3Storage` to satisfy `Storage`. Add `Backend() string { return "s3" }`. Keep direct `S3Storage` exported for back-compat callers; add `func NewS3() Storage`.
- `server/internal/service/embed/embedder.go` — NEW. `Embedder` interface:
  ```go
  type Embedder interface {
      Embed(ctx, texts []string) ([][]float32, error)
      Dim() int             // 1024 for text-embedding-v4
      Model() string
  }
  ```
- `server/internal/service/memory/store.go` — NEW. `Store` interface (vector ops only — relational stays in *db.Queries):
  ```go
  type Store interface {
      Upsert(ctx, chunks []Chunk) error
      Search(ctx, embedding []float32, topK int, filter Filter) ([]Hit, error)
  }
  ```
- `server/internal/service/memory/types.go` — NEW. Canonical `Memory` record (mirrors user's reference §四):
  ```go
  type Memory struct {
      ID         uuid.UUID
      WorkspaceID uuid.UUID
      Type       MemoryType    // fact|summary|transcript|task|decision|profile|context
      Scope      MemoryScope   // private_local|shared_summary|team|agent_state|archive
      Source     string        // meeting|chat|manual|file|agent
      RawRef     RawRef        // pointer to file_index.id OR thread_context_item.id OR message.id
      Summary    string        // short user-facing
      Body       string        // longer text (or empty if RawRef has it)
      Tags       []string
      Entities   []string
      Confidence float64       // [0,1]
      Status     MemoryStatus  // candidate|confirmed|archived (per user reference §七.4)
      Version    int
      CreatedAt, UpdatedAt time.Time
      CreatedBy uuid.UUID
  }
  type RawRef struct {
      Kind string  // "file_index" | "thread_context_item" | "message" | "artifact"
      ID   uuid.UUID
  }
  ```

**No backends yet**. Phase 0 is pure contract — code compiles, services constructable with nil backends so test rigs work.

### Tests

- Compile check.
- Mock impls in `_test.go` for downstream consumption.

---

## Phase 1 — TOS adapter + storage swap (~1 day)

**Goal**: file uploads land in either S3 or Volcengine TOS by workspace config.

### Why S3-compatible (B)

TOS supports S3v4 sig + custom endpoint. Use existing `aws-sdk-go-v2` with `BaseEndpoint` override. Zero new deps.

### Files

- `server/internal/storage/tos.go` — NEW. Wraps `aws-sdk-go-v2/service/s3` with TOS endpoint. Same `Storage` interface satisfaction as S3.
- `server/migrations/064_file_index_backend.up.sql` — NEW.
  ```sql
  ALTER TABLE file_index ADD COLUMN IF NOT EXISTS backend TEXT NOT NULL DEFAULT 's3';
  -- existing rows assumed s3.
  ```
- `server/internal/handler/workspace_secret.go` — EDIT. Add `PUT /api/workspaces/{id}/secrets/storage` shortcut for 5 keys at once: `tos_access_key_id`, `tos_secret_access_key`, `tos_bucket`, `tos_region`, `tos_endpoint`.
- `server/internal/storage/factory.go` — NEW. `NewFromWorkspace(ctx, q, secrets, workspaceID) (Storage, error)` reads workspace_secret to pick backend.

### env.scenario.example — placeholders only

```
# --- Volcengine TOS (S3-compatible) for meeting audio + memory raw store ---
# Apply at https://console.volcengine.com/tos
TOS_ACCESS_KEY_ID=""        # AKLT...
TOS_SECRET_ACCESS_KEY=""    # base64-ish
TOS_BUCKET=""               # bucket name
TOS_REGION="cn-beijing"     # default region
TOS_ENDPOINT="https://tos-s3-cn-beijing.volces.com"

# --- DashScope embedding for memory index (Phase 3) ---
DASHSCOPE_API_KEY=""        # sk-...
DASHSCOPE_EMBED_MODEL="text-embedding-v4"
```

### Tests

- `tos_test.go` — httptest mock S3 endpoint, verify SigV4 + presign.
- Reuse `storage_test.go` table-driven over both backends.

---

## Phase 2 — memory_record table + service + dual-write (~1.5 days)

**Goal**: unified `Memory` lands in DB. Existing scattered records (thread_context_item / artifact) get a parallel `memory_record` row pointing back via RawRef.

### Files

- `server/migrations/065_memory_record.up.sql` — NEW.
  ```sql
  CREATE TABLE memory_record (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id  UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
      type          TEXT NOT NULL CHECK (type IN ('fact','summary','transcript','task','decision','profile','context')),
      scope         TEXT NOT NULL CHECK (scope IN ('private_local','shared_summary','team','agent_state','archive')),
      source        TEXT NOT NULL,
      raw_kind      TEXT NOT NULL,           -- 'file_index'|'thread_context_item'|'message'|'artifact'
      raw_id        UUID NOT NULL,
      summary       TEXT,
      body          TEXT,
      tags          TEXT[] NOT NULL DEFAULT '{}',
      entities      TEXT[] NOT NULL DEFAULT '{}',
      confidence    REAL NOT NULL DEFAULT 0.5,
      status        TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','confirmed','archived')),
      version       INT NOT NULL DEFAULT 1,
      created_by    UUID,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_memory_workspace_type ON memory_record (workspace_id, type, status);
  CREATE INDEX idx_memory_raw ON memory_record (raw_kind, raw_id);
  CREATE INDEX idx_memory_tags ON memory_record USING GIN (tags);
  CREATE INDEX idx_memory_entities ON memory_record USING GIN (entities);
  ```
- `server/pkg/db/queries/memory_record.sql` — NEW. CRUD + `ListByScope` + `PromoteToConfirmed`.
- `server/internal/service/memory/service.go` — NEW. `MemoryService`:
  ```go
  Append(ctx, raw RawRef, m Memory) (Memory, error)        // raw must exist
  Promote(ctx, id uuid.UUID) (Memory, error)               // candidate → confirmed
  List(ctx, scope, type) ([]Memory, error)
  GetByRaw(ctx, ref RawRef) ([]Memory, error)              // find all memories pointing at one raw
  ```
- `server/internal/service/meeting.go` — EDIT. After `Summarize`, write a `memory_record` (type=summary, scope=shared_summary, raw=action_item or context_item id) alongside existing thread_context_item write. Dual-write transition.
- `server/internal/mcp/tools/memory_search.go` — NEW (stub for Phase 3 — returns 501 until Embedder lands).
- `server/internal/mcp/tools/memory_list.go` — NEW. `memory_list(scope, type)` for agents.

### Tests

- DB-backed integration: append → promote → list.
- Verify RawRef points at real row (FK-style check at service layer; not enforced by SQL because raw_kind is polymorphic).
- meeting_test.go updated: post-Summarize, memory_record rows exist with status=candidate.

---

## Phase 3+ deferred

- Phase 3 (pgvector + Chunker + Embedder DashScope impl)
- Phase 4 (scope-based sync + event bus)
- Phase 5 (full MCP surface)

Pause after Phase 2 to verify approach. Revisit phasing.

---

## Out of scope

- Frontend changes (memory browser UI)
- Migrating existing thread_context_item rows backward
- pgvector enable migration (Phase 3 territory)
- Cloud/local data residency policy (Phase 4)

---

## Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | Dual-write divergence (memory_record + thread_context_item) | Single tx in MeetingService; later migration drops thread_context_item write once memory_record is canonical |
| 2 | RawRef polymorphism — no SQL FK | Service-layer existence check on Append; cleanup job lists orphans |
| 3 | TOS S3 sig quirks | Use `aws-sdk-go-v2` BaseEndpoint + force PathStyle; test against real bucket once user approves |
| 4 | embedder swap mid-flight changes embedding dim → existing chunks unreadable | Phase 3 will store `embedder_model` + `dim` per chunk; re-index on swap |

---

## Approval

Phases 0 + 1 + 2 = ~3 days serial. Stop after Phase 2. Commit per phase.
