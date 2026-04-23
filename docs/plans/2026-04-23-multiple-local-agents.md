# Multiple Local Agents per User — Plan

**Status:** Draft, 2026-04-23. Not yet implemented.

## Product rule

Each user has exactly **one cloud personal agent** (current behavior,
unchanged) and **N local agents**, one per daemon-registered runtime.
Both agent categories appear side-by-side in the Identity page Agent List
and in the Session sidebar DM list.

## Current state (what blocks this)

| Piece | Today | Problem |
|---|---|---|
| Schema | `agent_type ∈ {personal_agent, system_agent}` | No slot for local-runtime-backed agent |
| Unique | Migration 062 — one `personal_agent` per (workspace, owner) | Re-using `personal_agent` for local copies would collide |
| Provision | `EnsurePersonalAgent` creates one row on signup | No per-runtime creation path |
| Add Agent UI (`/account?tab=add-agent`) | "保存/更新本地 Agent" mutates the user's single personal_agent's `runtime_id` | Can't hold more than one local binding |
| ReplyToDM | Branches on `agent.runtime_id → runtime.mode='local'` | Fine — already supports per-agent runtime |
| Session sidebar | Lists the user's single personal agent | No loop over multiple local agents |

## Target model

```
workspace
 └─ member (user)
     ├─ personal_agent   (agent_type=personal_agent, runtime_id=cloud, 1 per user)
     └─ local_agent × N  (agent_type=local_agent,  runtime_id=<daemon runtime>)
```

- `local_agent` rows require `owner_type='user' + owner_id NOT NULL + runtime_id NOT NULL`.
- Uniqueness: `(workspace_id, owner_id, runtime_id)` partial-unique where
  `agent_type='local_agent' AND archived_at IS NULL`. One local agent per
  runtime per user — prevents duplicates if user saves twice.
- Name: auto-default on create (`<user-name> · <runtime-name>`), user
  can rename via the existing agent-profile update path.

## Phase 1 — Schema

**New migration `080_local_agent_type.up.sql`:**

1. Extend `agent_type` CHECK to include `'local_agent'`.
2. Extend `agent_type_owner_match` CHECK (from migration 079) to accept
   `(local_agent, user, owner_id NOT NULL)` with an implicit assertion
   that `runtime_id IS NOT NULL` — enforced via a separate CHECK
   constraint to avoid coupling two concerns in one expression.
3. Add partial unique index
   `uq_workspace_owner_runtime_local_agent (workspace_id, owner_id, runtime_id)
   WHERE agent_type='local_agent' AND archived_at IS NULL`.
4. Down migration reverses all three.

**Acceptance:** `make migrate-up` + `make migrate-down` + re-up is
idempotent and leaves no orphan rows or indexes.

## Phase 2 — Backend handler

### New endpoints

- `POST /api/agents/local` — body `{ runtime_id, name? }`. Creates a
  `local_agent` for the caller's (workspace, user) owning the chosen
  runtime. Returns the new agent. Default `name = "<user.name> · <runtime.name>"`.
- `DELETE /api/agents/local/{id}` — archives (sets `archived_at`) the
  local_agent when user unbinds a runtime.
- `GET /api/agents/local` — lists caller's local_agent rows for the
  current workspace.

### Handler changes

- `agent_profile.UpdateAgent` — already supports `name` update; no change
  needed for rename.
- `workspace.EnsurePersonalAgent` — unchanged. Only creates the single
  cloud personal_agent on first login.
- `AutoReplyService.ReplyToDM` — no change. The existing local-runtime
  branch already fires whenever `agent.runtime_id` points at a local
  runtime, regardless of `agent_type`.
- `AutoReplyService.replyAsMentionedAgent` — adopt the same local-runtime
  branch as `ReplyToDM` so channel @mention of a `local_agent` enqueues
  through the daemon instead of falling into the cloud LLM path. Related
  to existing channel flow; see also commit `ca6014e0`.

### Routing

Nothing new in `MediationService`. `parseMentionsFromContent` already
handles multi-word names; distinct `name` per local_agent keeps routing
unambiguous.

## Phase 3 — Frontend

### Add Agent page (`apps/web/app/(dashboard)/account/page.tsx`)

- Replace "保存/更新本地 Agent" button semantics: call `POST /api/agents/local`
  instead of mutating the existing personal_agent.
- After create, append the new local_agent to the Agent List (no redirect).
- Runtime dropdown hides runtimes that already have a local_agent for
  this user (query the new `GET /api/agents/local`).

### Agent List / Identity page

- Render cloud personal_agent + each local_agent as independent rows
  with badges: `Cloud` / `Local (codex)` / `Local (claude)`.
- Rename inline via existing agent update handler.
- Archive (soft-delete) via a new trash action — calls
  `DELETE /api/agents/local/{id}`.

### Session sidebar (`features/session/...`)

- Iterate all agents owned by the user instead of just the single
  personal_agent. Each agent gets its own DM entry.
- DM target resolution: recipient_id = clicked agent's id. Already
  supported by message send — no API change.

### Channel @mention picker

- Include all user-owned agents (cloud + local) in the mention candidate
  list. Already workspace-scoped; just make sure local_agent rows aren't
  filtered out by an implicit `agent_type='personal_agent'` filter in
  any query.

## Phase 4 — Tests

- Go: extend `service/personal_agent_test.go` with a second test table
  covering multiple local_agent creations per user; verify unique
  constraint rejects duplicates on the same runtime.
- Go: extend `mediation_test.go` — @mention resolves to `local_agent` and
  routes through the daemon queue, not cloud.
- TS: Vitest for the new Add Agent create-new flow (stubbed API).
- E2E: one Playwright spec covering "add local runtime → bind → DM the
  local agent → verify reply queued" (daemon stubbed).

## Phase 5 — Rollout

- Ship behind no flag — additive schema + new endpoints, old flow
  untouched.
- Backfill: none required. Existing personal_agent rows keep working;
  existing local-runtime bindings (where someone's personal_agent has a
  local runtime_id set) should be migrated to a new local_agent row by a
  one-shot script. Cloud personal_agent gets its `runtime_id` nulled so
  it returns to cloud mode.

## Out of scope

- Per-local-agent instructions (uses workspace default for now).
- Sharing local agents across workspaces.
- Daemon-side provider sub-splitting (one runtime = one local_agent).

## Issues to file

Split this plan into labeled GitHub issues:

1. `[schema] Migration 080 — add local_agent type + constraints`
2. `[backend] Local-agent CRUD endpoints (create / list / archive)`
3. `[backend] Route channel @mention of local_agent through daemon`
4. `[frontend] Agent List + Add Agent — multi-local-agent UX`
5. `[frontend] Session sidebar — show all user agents with DM entries`
6. `[migration] Backfill — split existing personal_agent+local runtime into local_agent row`
7. `[tests] Go + TS + Playwright coverage for multi-local-agent`
