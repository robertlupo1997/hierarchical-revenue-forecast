// Package metrics provides Prometheus metrics for the MLRF API.
package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// RequestsTotal counts total HTTP requests by endpoint, method, and status code.
	RequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "mlrf_requests_total",
		Help: "Total number of HTTP requests by endpoint, method, and status code",
	}, []string{"endpoint", "method", "status"})

	// RequestDuration tracks request duration in seconds by endpoint.
	RequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "mlrf_request_duration_seconds",
		Help:    "HTTP request duration in seconds by endpoint",
		Buckets: []float64{.001, .005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5},
	}, []string{"endpoint"})

	// CacheHits counts total cache hits.
	CacheHits = promauto.NewCounter(prometheus.CounterOpts{
		Name: "mlrf_cache_hits_total",
		Help: "Total number of cache hits",
	})

	// CacheMisses counts total cache misses.
	CacheMisses = promauto.NewCounter(prometheus.CounterOpts{
		Name: "mlrf_cache_misses_total",
		Help: "Total number of cache misses",
	})

	// InferenceDuration tracks ONNX inference duration in seconds.
	InferenceDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "mlrf_inference_duration_seconds",
		Help:    "ONNX model inference duration in seconds",
		Buckets: []float64{.001, .002, .005, .01, .02, .05, .1},
	})

	// PredictionCount tracks total predictions made.
	PredictionCount = promauto.NewCounter(prometheus.CounterOpts{
		Name: "mlrf_predictions_total",
		Help: "Total number of predictions made",
	})

	// BatchSize tracks the size of batch prediction requests.
	BatchSize = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "mlrf_batch_size",
		Help:    "Size of batch prediction requests",
		Buckets: []float64{1, 5, 10, 25, 50, 100},
	})

	// ActiveConnections tracks current active connections (gauge).
	ActiveConnections = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "mlrf_active_connections",
		Help: "Current number of active HTTP connections",
	})

	// RateLimitRejections counts requests rejected due to rate limiting.
	RateLimitRejections = promauto.NewCounter(prometheus.CounterOpts{
		Name: "mlrf_rate_limit_rejections_total",
		Help: "Total number of requests rejected due to rate limiting",
	})

	// FeatureStoreLookups counts feature store lookup attempts.
	FeatureStoreLookups = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "mlrf_feature_store_lookups_total",
		Help: "Total feature store lookup attempts by result type",
	}, []string{"result"})

	// HierarchyRequestDuration tracks hierarchy endpoint duration specifically.
	HierarchyRequestDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "mlrf_hierarchy_request_duration_seconds",
		Help:    "Hierarchy endpoint request duration in seconds",
		Buckets: []float64{.01, .05, .1, .25, .5, 1, 2.5},
	})

	// ExplainRequestDuration tracks SHAP explain endpoint duration.
	ExplainRequestDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "mlrf_explain_request_duration_seconds",
		Help:    "SHAP explain endpoint request duration in seconds",
		Buckets: []float64{.01, .05, .1, .25, .5, 1},
	})
)

// RecordCacheHit increments the cache hit counter.
func RecordCacheHit() {
	CacheHits.Inc()
}

// RecordCacheMiss increments the cache miss counter.
func RecordCacheMiss() {
	CacheMisses.Inc()
}

// RecordInference records an inference operation with its duration.
func RecordInference(durationSeconds float64) {
	InferenceDuration.Observe(durationSeconds)
	PredictionCount.Inc()
}

// RecordBatchSize records the size of a batch request.
func RecordBatchSize(size int) {
	BatchSize.Observe(float64(size))
}

// RecordRateLimitRejection increments the rate limit rejection counter.
func RecordRateLimitRejection() {
	RateLimitRejections.Inc()
}

// RecordFeatureStoreLookup records a feature store lookup result.
// result should be one of: "exact", "aggregated", "zero_fallback"
func RecordFeatureStoreLookup(result string) {
	FeatureStoreLookups.WithLabelValues(result).Inc()
}
