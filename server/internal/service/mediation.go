package service

import (
	"log/slog"
	"sync"

	"github.com/multica-ai/multica/server/internal/events"
	"github.com/multica-ai/multica/server/internal/realtime"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

// MediationService ensures every message in a session receives an appropriate
// reply by coordinating auto-reply routing and @mention enforcement. It is
// driven by the Session page system agent.
//
// The current implementation is a lightweight scaffold: it subscribes to
// message events on the bus and logs them. As the feature grows it will route
// to auto-reply, track unanswered @mentions, and broadcast attention signals.
type MediationService struct {
	Queries *db.Queries
	Hub     *realtime.Hub
	Bus     *events.Bus

	mu      sync.Mutex
	started bool
}

// NewMediationService constructs a MediationService. The service does nothing
// until Start is called.
func NewMediationService(q *db.Queries, hub *realtime.Hub, bus *events.Bus) *MediationService {
	return &MediationService{Queries: q, Hub: hub, Bus: bus}
}

// Start subscribes the service to the event bus. Safe to call multiple times;
// subsequent calls are no-ops.
func (s *MediationService) Start() {
	if s == nil || s.Bus == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.started {
		return
	}
	s.started = true

	s.Bus.Subscribe("message:created", func(e events.Event) {
		slog.Debug("mediation observed message",
			"workspace_id", e.WorkspaceID,
			"actor_type", e.ActorType,
			"actor_id", e.ActorID,
		)
	})
	s.Bus.Subscribe("message:mention", func(e events.Event) {
		slog.Debug("mediation observed mention",
			"workspace_id", e.WorkspaceID,
			"actor_type", e.ActorType,
			"actor_id", e.ActorID,
		)
	})

	slog.Info("mediation service started")
}
