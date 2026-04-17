package handler

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// errSessionNotMigrated is returned by resolveSessionRouting when no row
// exists in session_migration_map for the given session_id. Task 7's bulk
// backfill will pre-create all maps, so during the transition window this
// condition should become rare. Callers log-and-continue (keep writing
// session_id on the row) rather than 4xx-ing client requests.
var errSessionNotMigrated = errors.New("session not yet migrated")

// resolveSessionRouting maps a legacy session_id to the new (channel_id,
// thread_id) routing pair via session_migration_map. It is the boundary
// translator for Phase 2 of Plan 3: new code writes channel/thread FKs,
// but handlers that still accept session_id look the map up here so both
// get populated on the `message` row.
//
// On a cache miss it returns (uuid.Nil, uuid.Nil, errSessionNotMigrated)
// rather than attempting on-the-fly creation — Task 7's bulk backfill
// pre-creates every session's map row, so callers can treat the miss as
// a transient "backfill not yet run" signal.
func (h *Handler) resolveSessionRouting(ctx context.Context, sessionID pgtype.UUID) (channelID pgtype.UUID, threadID pgtype.UUID, err error) {
	if !sessionID.Valid {
		return pgtype.UUID{}, pgtype.UUID{}, fmt.Errorf("resolveSessionRouting: invalid session_id")
	}
	row, lookupErr := h.Queries.GetSessionMigrationMap(ctx, sessionID)
	if lookupErr == nil {
		return row.ChannelID, row.ThreadID, nil
	}
	if errors.Is(lookupErr, pgx.ErrNoRows) {
		return pgtype.UUID{}, pgtype.UUID{}, errSessionNotMigrated
	}
	return pgtype.UUID{}, pgtype.UUID{}, fmt.Errorf("lookup session migration map: %w", lookupErr)
}

// incrementThreadCounters bumps thread.reply_count + last_reply_at only
// for messages whose sender_type is "member" or "agent" — the PRD §4
// semantics fix: system messages no longer inflate reply_count. For
// system senders we still touch last_activity_at so the thread sort
// order stays accurate.
//
// threadID may be an invalid/zero UUID — in that case the call is a no-op.
func (h *Handler) incrementThreadCounters(ctx context.Context, threadID pgtype.UUID, senderType string) {
	if !threadID.Valid {
		return
	}
	if senderType == "member" || senderType == "agent" {
		if err := h.Queries.IncrementThreadReply(ctx, threadID); err != nil {
			slog.Warn("incrementThreadReply failed", "error", err, "thread_id", uuidToString(threadID))
		}
		return
	}
	// system / unknown — touch activity only (no reply_count bump).
	if err := h.Queries.TouchThreadActivity(ctx, threadID); err != nil {
		slog.Warn("touchThreadActivity failed", "error", err, "thread_id", uuidToString(threadID))
	}
}
