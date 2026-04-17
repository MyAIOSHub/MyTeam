package metrics

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func TestCollectorsRegistered(t *testing.T) {
	// Prometheus collectors only appear in /metrics output once they've been
	// observed with a specific label value. Touch every collector so the
	// name-based assertion below sees each of them.
	ExecutionDurationSeconds.WithLabelValues("local", "claude", "completed").Observe(0)
	ExecutionCountTotal.WithLabelValues("completed").Inc()
	SchedulerQueueDepth.WithLabelValues("high").Set(5)
	RuntimeLoadRatio.WithLabelValues("rt-1").Set(0)
	PlanGenDurationSeconds.WithLabelValues("ok").Observe(0)
	PlanGenTokenUsage.WithLabelValues("input").Observe(0)
	WSConnectedClients.WithLabelValues("ws-1").Set(0)
	WSEventPublishedTotal.WithLabelValues("test:noop").Inc()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	promhttp.Handler().ServeHTTP(rr, req)

	body := rr.Body.String()
	want := []string{
		"myteam_execution_count_total",
		"myteam_scheduler_queue_depth",
		"myteam_execution_duration_seconds",
		"myteam_runtime_load_ratio",
		"myteam_plan_gen_duration_seconds",
		"myteam_plan_gen_token_usage",
		"myteam_ws_connected_clients",
		"myteam_ws_event_published_total",
	}
	for _, name := range want {
		if !strings.Contains(body, name) {
			t.Errorf("metric %s not exposed", name)
		}
	}
}
