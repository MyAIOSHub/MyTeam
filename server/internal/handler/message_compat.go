package handler

import (
	"context"
	"log/slog"

	"github.com/jackc/pgx/v5/pgtype"
)

// incrementThreadCounters bumps thread.reply_count + last_reply_at only
// for messages whose sender_type is "member" or "agent" — the PRD §4
// semantics fix: system messages no longer inflate reply_count. For
// system senders we still touch last_activity_at so the thread sort
// order stays accurate.
//
// threadID may be an invalid/zero UUID — in that case the call is a no-op.
//
// Previously this file also housed resolveSessionRouting, which translated
// a legacy message.session_id into (channel_id, thread_id) via the
// session_migration_map. Migration 053 (Plan 3 Phase 6) dropped the
// session table and message.session_id column, so no resolution is needed
// — all messages write channel_id + thread_id directly.
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
