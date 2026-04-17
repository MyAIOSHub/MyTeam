package handler

import "net/http"

// Plan 3 Phase 6: the legacy /api/sessions endpoints are retired. The
// session + session_participant tables have been dropped (migration 053)
// and the frontend has moved to /api/channels/{id}/threads. These handlers
// return 410 Gone so any stale callers receive a clear, actionable error
// instead of a 404 or 500.
//
// Keeping the handlers (rather than removing the routes) means surviving
// clients with cached URLs get a body that points them at the new API.

const sessionGoneBody = "session API removed - use /api/channels/{id}/threads"

func sessionGone(w http.ResponseWriter) {
	writeError(w, http.StatusGone, sessionGoneBody)
}

// POST /api/sessions
func (h *Handler) CreateSession(w http.ResponseWriter, r *http.Request) { sessionGone(w) }

// GET /api/sessions
func (h *Handler) ListSessions(w http.ResponseWriter, r *http.Request) { sessionGone(w) }

// GET /api/sessions/{sessionID}
func (h *Handler) GetSession(w http.ResponseWriter, r *http.Request) { sessionGone(w) }

// PATCH /api/sessions/{sessionID}
func (h *Handler) UpdateSession(w http.ResponseWriter, r *http.Request) { sessionGone(w) }

// POST /api/sessions/{sessionID}/join
func (h *Handler) JoinSession(w http.ResponseWriter, r *http.Request) { sessionGone(w) }

// GET /api/sessions/{sessionID}/messages
func (h *Handler) ListSessionMessages(w http.ResponseWriter, r *http.Request) { sessionGone(w) }

// GET /api/sessions/{sessionID}/summary
func (h *Handler) SessionSummary(w http.ResponseWriter, r *http.Request) { sessionGone(w) }

// POST /api/sessions/{sessionID}/auto-start
func (h *Handler) StartAutoDiscussion(w http.ResponseWriter, r *http.Request) { sessionGone(w) }

// POST /api/sessions/{sessionID}/auto-stop
func (h *Handler) StopAutoDiscussion(w http.ResponseWriter, r *http.Request) { sessionGone(w) }

// PUT /api/sessions/{sessionID}/context
func (h *Handler) ShareSessionContext(w http.ResponseWriter, r *http.Request) { sessionGone(w) }
