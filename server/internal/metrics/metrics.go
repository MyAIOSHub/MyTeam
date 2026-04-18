// Package metrics exports Prometheus collectors used across the server.
// All collectors are registered against the default registry so an unauthenticated
// /metrics endpoint can scrape them.
package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Core execution metrics (Plan 5 will populate execution_* further).
var (
	// ExecutionDurationSeconds is a histogram of per-Execution wall-clock duration.
	// Labels: runtime_mode (local|cloud), provider, status (completed|failed|timed_out|cancelled).
	ExecutionDurationSeconds = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "myteam_execution_duration_seconds",
			Help:    "Per-execution duration in seconds.",
			Buckets: []float64{0.5, 1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600, 5400, 7200},
		},
		[]string{"runtime_mode", "provider", "status"},
	)

	// ExecutionCountTotal is the total count of executions by terminal status.
	ExecutionCountTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "myteam_execution_count_total",
			Help: "Total executions by terminal status.",
		},
		[]string{"status"},
	)

	// SchedulerQueueDepth is the number of tasks waiting to be scheduled.
	SchedulerQueueDepth = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "myteam_scheduler_queue_depth",
			Help: "Tasks currently waiting for scheduling.",
		},
		[]string{"priority"},
	)

	// RuntimeLoadRatio is current_load / concurrency_limit for each runtime.
	RuntimeLoadRatio = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "myteam_runtime_load_ratio",
			Help: "Runtime load ratio (current_load / concurrency_limit).",
		},
		[]string{"runtime_id"},
	)

	// PlanGenDurationSeconds: Plan generation LLM call duration.
	PlanGenDurationSeconds = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "myteam_plan_gen_duration_seconds",
			Help:    "PlanGeneratorService call duration.",
			Buckets: []float64{0.5, 1, 2, 5, 10, 30, 60, 120},
		},
		[]string{"status"},
	)

	// PlanGenTokenUsage: token counts per plan generation.
	PlanGenTokenUsage = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "myteam_plan_gen_token_usage",
			Help:    "Token usage per PlanGeneratorService call.",
			Buckets: []float64{100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000},
		},
		[]string{"direction"}, // input | output
	)

	// WSConnectedClients: active WebSocket connections per workspace.
	WSConnectedClients = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "myteam_ws_connected_clients",
			Help: "Active WebSocket connections.",
		},
		[]string{"workspace_id"},
	)

	// WSEventPublishedTotal counts WebSocket events published.
	WSEventPublishedTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "myteam_ws_event_published_total",
			Help: "WebSocket events published by event_type.",
		},
		[]string{"event_type"},
	)
)
