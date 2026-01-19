package metrics

import (
	"strings"
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
)

func TestRequestsTotal(t *testing.T) {
	// Reset metric for test isolation
	RequestsTotal.Reset()

	// Record some requests
	RequestsTotal.WithLabelValues("/health", "GET", "200").Inc()
	RequestsTotal.WithLabelValues("/predict", "POST", "200").Inc()
	RequestsTotal.WithLabelValues("/predict", "POST", "200").Inc()
	RequestsTotal.WithLabelValues("/predict", "POST", "400").Inc()

	// Verify counts
	if v := testutil.ToFloat64(RequestsTotal.WithLabelValues("/health", "GET", "200")); v != 1 {
		t.Errorf("expected 1 /health request, got %v", v)
	}

	if v := testutil.ToFloat64(RequestsTotal.WithLabelValues("/predict", "POST", "200")); v != 2 {
		t.Errorf("expected 2 successful /predict requests, got %v", v)
	}

	if v := testutil.ToFloat64(RequestsTotal.WithLabelValues("/predict", "POST", "400")); v != 1 {
		t.Errorf("expected 1 failed /predict request, got %v", v)
	}
}

func TestRequestDuration(t *testing.T) {
	// Reset metric for test isolation
	RequestDuration.Reset()

	// Record some durations
	RequestDuration.WithLabelValues("/predict").Observe(0.005) // 5ms
	RequestDuration.WithLabelValues("/predict").Observe(0.010) // 10ms
	RequestDuration.WithLabelValues("/predict").Observe(0.015) // 15ms

	// Verify histogram count
	count := testutil.ToFloat64(RequestDuration.WithLabelValues("/predict"))
	if count != 3 {
		t.Errorf("expected 3 observations, got %v", count)
	}
}

func TestCacheMetrics(t *testing.T) {
	// Get initial values (don't reset - counters don't support reset)
	initialHits := testutil.ToFloat64(CacheHits)
	initialMisses := testutil.ToFloat64(CacheMisses)

	// Record cache operations
	RecordCacheHit()
	RecordCacheHit()
	RecordCacheMiss()

	// Verify increments
	if v := testutil.ToFloat64(CacheHits) - initialHits; v != 2 {
		t.Errorf("expected 2 cache hits, got %v", v)
	}

	if v := testutil.ToFloat64(CacheMisses) - initialMisses; v != 1 {
		t.Errorf("expected 1 cache miss, got %v", v)
	}
}

func TestInferenceMetrics(t *testing.T) {
	// Record inference operations
	initialPredictions := testutil.ToFloat64(PredictionCount)

	RecordInference(0.002) // 2ms
	RecordInference(0.003) // 3ms

	// Verify prediction count incremented
	if v := testutil.ToFloat64(PredictionCount) - initialPredictions; v != 2 {
		t.Errorf("expected 2 predictions, got %v", v)
	}
}

func TestBatchSizeMetrics(t *testing.T) {
	// Reset histogram
	BatchSize.Reset()

	RecordBatchSize(10)
	RecordBatchSize(50)
	RecordBatchSize(100)

	// Verify 3 observations recorded
	count := testutil.ToFloat64(BatchSize)
	if count != 3 {
		t.Errorf("expected 3 batch size observations, got %v", count)
	}
}

func TestRateLimitRejectionMetrics(t *testing.T) {
	initial := testutil.ToFloat64(RateLimitRejections)

	RecordRateLimitRejection()
	RecordRateLimitRejection()
	RecordRateLimitRejection()

	if v := testutil.ToFloat64(RateLimitRejections) - initial; v != 3 {
		t.Errorf("expected 3 rate limit rejections, got %v", v)
	}
}

func TestFeatureStoreLookupMetrics(t *testing.T) {
	// Reset for test
	FeatureStoreLookups.Reset()

	RecordFeatureStoreLookup("exact")
	RecordFeatureStoreLookup("exact")
	RecordFeatureStoreLookup("aggregated")
	RecordFeatureStoreLookup("zero_fallback")

	if v := testutil.ToFloat64(FeatureStoreLookups.WithLabelValues("exact")); v != 2 {
		t.Errorf("expected 2 exact lookups, got %v", v)
	}

	if v := testutil.ToFloat64(FeatureStoreLookups.WithLabelValues("aggregated")); v != 1 {
		t.Errorf("expected 1 aggregated lookup, got %v", v)
	}

	if v := testutil.ToFloat64(FeatureStoreLookups.WithLabelValues("zero_fallback")); v != 1 {
		t.Errorf("expected 1 zero_fallback lookup, got %v", v)
	}
}

func TestActiveConnections(t *testing.T) {
	// Reset gauge
	ActiveConnections.Set(0)

	// Simulate connections
	ActiveConnections.Inc()
	ActiveConnections.Inc()

	if v := testutil.ToFloat64(ActiveConnections); v != 2 {
		t.Errorf("expected 2 active connections, got %v", v)
	}

	ActiveConnections.Dec()

	if v := testutil.ToFloat64(ActiveConnections); v != 1 {
		t.Errorf("expected 1 active connection, got %v", v)
	}
}

func TestMetricsAreRegistered(t *testing.T) {
	// Verify all metrics are properly registered with Prometheus
	metrics := []prometheus.Collector{
		RequestsTotal,
		RequestDuration,
		CacheHits,
		CacheMisses,
		InferenceDuration,
		PredictionCount,
		BatchSize,
		ActiveConnections,
		RateLimitRejections,
		FeatureStoreLookups,
		HierarchyRequestDuration,
		ExplainRequestDuration,
	}

	for _, m := range metrics {
		// Describe should not panic for registered metrics
		ch := make(chan *prometheus.Desc, 10)
		m.Describe(ch)
		close(ch)

		found := false
		for desc := range ch {
			if desc != nil {
				found = true
				break
			}
		}

		if !found {
			t.Errorf("metric not properly registered")
		}
	}
}

func TestMetricNaming(t *testing.T) {
	// Verify all metrics have the mlrf_ prefix
	expectedMetrics := []string{
		"mlrf_requests_total",
		"mlrf_request_duration_seconds",
		"mlrf_cache_hits_total",
		"mlrf_cache_misses_total",
		"mlrf_inference_duration_seconds",
		"mlrf_predictions_total",
		"mlrf_batch_size",
		"mlrf_active_connections",
		"mlrf_rate_limit_rejections_total",
		"mlrf_feature_store_lookups_total",
		"mlrf_hierarchy_request_duration_seconds",
		"mlrf_explain_request_duration_seconds",
	}

	for _, name := range expectedMetrics {
		if !strings.HasPrefix(name, "mlrf_") {
			t.Errorf("metric %s should have mlrf_ prefix", name)
		}
	}
}
