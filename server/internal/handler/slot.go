// Package handler: slot.go — ParticipantSlot HTTP endpoints for the Plan 5
// Project API per PRD §10. Slots represent the human/agent participation
// hand-offs inside a Task (human input forms, agent execution stages,
// human review gates).
//
// Slot lifecycle (waiting → ready → in_progress → submitted → approved/...)
// is owned by SlotService — these handlers only expose list + create.
// State transitions happen via SchedulerService (activation) or
// ReviewService (decision cascade).
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

// ---------------------------------------------------------------------------
// GET /api/tasks/{id}/slots
// ---------------------------------------------------------------------------

// ListTaskSlots returns every slot bound to the given task, ordered by
// slot_order then created_at.
func (h *Handler) ListTaskSlots(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	rows, err := h.Queries.ListSlotsByTask(r.Context(), pgUUIDFrom(id))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list failed: "+err.Error())
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, s := range rows {
		out = append(out, slotToResponse(s))
	}
	writeJSON(w, http.StatusOK, map[string]any{"slots": out})
}

// ---------------------------------------------------------------------------
// POST /api/tasks/{id}/slots
// ---------------------------------------------------------------------------

// createSlotRequest mirrors the frontend client.ts CreateParticipantSlot
// shape from Batch E1. Pointer fields let the caller omit Blocking /
// Required without forcing them to false (the SQL defaults are TRUE).
type createSlotRequest struct {
	SlotType        string `json:"slot_type"`
	SlotOrder       int    `json:"slot_order,omitempty"`
	ParticipantID   string `json:"participant_id,omitempty"`
	ParticipantType string `json:"participant_type,omitempty"`
	Responsibility  string `json:"responsibility,omitempty"`
	Trigger         string `json:"trigger,omitempty"`
	Blocking        *bool  `json:"blocking,omitempty"`
	Required        *bool  `json:"required,omitempty"`
	ExpectedOutput  string `json:"expected_output,omitempty"`
	TimeoutSeconds  int    `json:"timeout_seconds,omitempty"`
}

// CreateTaskSlot inserts a new ParticipantSlot on the task. The slot starts
// in 'waiting' (SQL default) and is later promoted by SchedulerService.
func (h *Handler) CreateTaskSlot(w http.ResponseWriter, r *http.Request) {
	taskID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req createSlotRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.SlotType == "" {
		writeError(w, http.StatusBadRequest, "slot_type required")
		return
	}

	params := db.CreateParticipantSlotParams{
		TaskID:    pgUUIDFrom(taskID),
		SlotType:  req.SlotType,
		SlotOrder: pgtype.Int4{Int32: int32(req.SlotOrder), Valid: true},
	}
	if req.ParticipantID != "" {
		pID, err := uuid.Parse(req.ParticipantID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid participant_id")
			return
		}
		params.ParticipantID = pgUUIDFrom(pID)
	}
	if req.ParticipantType != "" {
		params.ParticipantType = pgtype.Text{String: req.ParticipantType, Valid: true}
	}
	if req.Responsibility != "" {
		params.Responsibility = pgtype.Text{String: req.Responsibility, Valid: true}
	}
	if req.Trigger != "" {
		params.Trigger = pgtype.Text{String: req.Trigger, Valid: true}
	}
	if req.Blocking != nil {
		params.Blocking = pgtype.Bool{Bool: *req.Blocking, Valid: true}
	}
	if req.Required != nil {
		params.Required = pgtype.Bool{Bool: *req.Required, Valid: true}
	}
	if req.ExpectedOutput != "" {
		params.ExpectedOutput = pgtype.Text{String: req.ExpectedOutput, Valid: true}
	}
	if req.TimeoutSeconds > 0 {
		params.TimeoutSeconds = pgtype.Int4{Int32: int32(req.TimeoutSeconds), Valid: true}
	}

	s, err := h.Queries.CreateParticipantSlot(r.Context(), params)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create slot failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, slotToResponse(s))
}

// slotToResponse maps a db.ParticipantSlot into a JSON-friendly map. Mirrors
// the apps/web/shared/types ParticipantSlot interface (Batch E1).
func slotToResponse(s db.ParticipantSlot) map[string]any {
	out := map[string]any{
		"id":         uuidToString(s.ID),
		"task_id":    uuidToString(s.TaskID),
		"slot_type":  s.SlotType,
		"slot_order": s.SlotOrder,
		"trigger":    s.Trigger,
		"blocking":   s.Blocking,
		"required":   s.Required,
		"status":     s.Status,
	}
	if s.ParticipantID.Valid {
		out["participant_id"] = uuidToString(s.ParticipantID)
	}
	if s.ParticipantType.Valid {
		out["participant_type"] = s.ParticipantType.String
	}
	if s.Responsibility.Valid {
		out["responsibility"] = s.Responsibility.String
	}
	if s.ExpectedOutput.Valid {
		out["expected_output"] = s.ExpectedOutput.String
	}
	if s.TimeoutSeconds.Valid {
		out["timeout_seconds"] = s.TimeoutSeconds.Int32
	}
	if s.StartedAt.Valid {
		out["started_at"] = s.StartedAt.Time
	}
	if s.CompletedAt.Valid {
		out["completed_at"] = s.CompletedAt.Time
	}
	if s.CreatedAt.Valid {
		out["created_at"] = s.CreatedAt.Time
	}
	if s.UpdatedAt.Valid {
		out["updated_at"] = s.UpdatedAt.Time
	}
	return out
}
