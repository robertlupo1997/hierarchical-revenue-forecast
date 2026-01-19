// Package middleware provides HTTP middleware for the MLRF API.
package middleware

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/mlrf/mlrf-api/internal/metrics"
)

// responseWriter wraps http.ResponseWriter to capture the status code.
type responseWriter struct {
	http.ResponseWriter
	statusCode int
	written    bool
}

// newResponseWriter creates a new responseWriter.
func newResponseWriter(w http.ResponseWriter) *responseWriter {
	return &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
}

// WriteHeader captures the status code before writing.
func (rw *responseWriter) WriteHeader(code int) {
	if !rw.written {
		rw.statusCode = code
		rw.written = true
	}
	rw.ResponseWriter.WriteHeader(code)
}

// Write ensures WriteHeader is called before writing body.
func (rw *responseWriter) Write(b []byte) (int, error) {
	if !rw.written {
		rw.WriteHeader(http.StatusOK)
	}
	return rw.ResponseWriter.Write(b)
}

// Status returns the captured status code.
func (rw *responseWriter) Status() int {
	return rw.statusCode
}

// PrometheusMetrics is middleware that records request metrics.
func PrometheusMetrics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip metrics endpoint itself to avoid self-counting
		if r.URL.Path == "/metrics/prometheus" {
			next.ServeHTTP(w, r)
			return
		}

		// Track active connections
		metrics.ActiveConnections.Inc()
		defer metrics.ActiveConnections.Dec()

		// Capture start time
		start := time.Now()

		// Wrap response writer to capture status code
		rw := newResponseWriter(w)

		// Process request
		next.ServeHTTP(rw, r)

		// Calculate duration
		duration := time.Since(start).Seconds()

		// Get route pattern for consistent endpoint labeling
		endpoint := r.URL.Path
		if routeCtx := chi.RouteContext(r.Context()); routeCtx != nil {
			if pattern := routeCtx.RoutePattern(); pattern != "" {
				endpoint = pattern
			}
		}

		// Record metrics
		statusStr := strconv.Itoa(rw.Status())
		metrics.RequestsTotal.WithLabelValues(endpoint, r.Method, statusStr).Inc()
		metrics.RequestDuration.WithLabelValues(endpoint).Observe(duration)
	})
}
