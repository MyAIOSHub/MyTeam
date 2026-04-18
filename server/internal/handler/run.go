// Package handler: run.go — ProjectRun action endpoints for the Plan 5
// Project API per PRD §10.
//
// Currently exposes a single verb: POST /api/runs/{id}/start, which hands
// the run off to SchedulerService.ScheduleRun. Read-only endpoints for
// runs already live on /api/projects/{id}/runs (see project.go).
package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ---------------------------------------------------------------------------
// POST /api/runs/{runID}/start
// ---------------------------------------------------------------------------

// StartRunHandler kicks off a ProjectRun by handing it to SchedulerService.
// The scheduler resets all tasks to draft, schedules tasks with no unmet
// deps, and broadcasts task:status_changed events as it goes.
//
// Returns 202 Accepted because the actual execution is asynchronous —
// daemons claim work via the /api/daemon/runtimes/.../executions endpoints.
func (h *Handler) StartRunHandler(w http.ResponseWriter, r *http.Request) {
	runID, err := uuid.Parse(chi.URLParam(r, "runID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid run id")
		return
	}

	run, err := h.Queries.GetProjectRun(r.Context(), pgUUIDFrom(runID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "run not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "get run failed: "+err.Error())
		return
	}

	if h.Scheduler == nil {
		writeError(w, http.StatusInternalServerError, "scheduler unavailable")
		return
	}
	if !run.PlanID.Valid {
		writeError(w, http.StatusBadRequest, "run has no plan")
		return
	}
	planID := uuid.UUID(run.PlanID.Bytes)
	if err := h.Scheduler.ScheduleRun(r.Context(), planID, runID); err != nil {
		writeError(w, http.StatusInternalServerError, "schedule failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "scheduling"})
}
