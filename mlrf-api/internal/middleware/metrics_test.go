package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/mlrf/mlrf-api/internal/metrics"
	"github.com/prometheus/client_golang/prometheus/testutil"
)

func TestResponseWriter(t *testing.T) {
	t.Run("captures status code on WriteHeader", func(t *testing.T) {
		w := httptest.NewRecorder()
		rw := newResponseWriter(w)

		rw.WriteHeader(http.StatusNotFound)

		if rw.Status() != http.StatusNotFound {
			t.Errorf("expected status 404, got %d", rw.Status())
		}
	})

	t.Run("defaults to 200 OK", func(t *testing.T) {
		w := httptest.NewRecorder()
		rw := newResponseWriter(w)

		// Don't call WriteHeader - just write body
		rw.Write([]byte("hello"))

		if rw.Status() != http.StatusOK {
			t.Errorf("expected default status 200, got %d", rw.Status())
		}
	})

	t.Run("only captures first status code", func(t *testing.T) {
		w := httptest.NewRecorder()
		rw := newResponseWriter(w)

		rw.WriteHeader(http.StatusCreated)
		rw.WriteHeader(http.StatusBadRequest) // Should be ignored

		if rw.Status() != http.StatusCreated {
			t.Errorf("expected first status 201, got %d", rw.Status())
		}
	})

	t.Run("passes write through to underlying writer", func(t *testing.T) {
		w := httptest.NewRecorder()
		rw := newResponseWriter(w)

		n, err := rw.Write([]byte("test body"))

		if err != nil {
			t.Errorf("unexpected error: %v", err)
		}
		if n != 9 {
			t.Errorf("expected 9 bytes written, got %d", n)
		}
		if w.Body.String() != "test body" {
			t.Errorf("expected 'test body', got %s", w.Body.String())
		}
	})
}

func TestPrometheusMetricsMiddleware(t *testing.T) {
	t.Run("records request metrics", func(t *testing.T) {
		// Reset counters for test
		metrics.RequestsTotal.Reset()
		metrics.RequestDuration.Reset()

		handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("ok"))
		})

		r := chi.NewRouter()
		r.Use(PrometheusMetrics)
		r.Get("/test", handler)

		req := httptest.NewRequest("GET", "/test", nil)
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		// Verify response
		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d", w.Code)
		}

		// Verify metrics were recorded
		count := testutil.ToFloat64(metrics.RequestsTotal.WithLabelValues("/test", "GET", "200"))
		if count != 1 {
			t.Errorf("expected 1 request recorded, got %v", count)
		}
	})

	t.Run("skips metrics endpoint", func(t *testing.T) {
		metrics.RequestsTotal.Reset()

		handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		})

		r := chi.NewRouter()
		r.Use(PrometheusMetrics)
		r.Get("/metrics/prometheus", handler)

		req := httptest.NewRequest("GET", "/metrics/prometheus", nil)
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		// Metrics endpoint should not be counted
		count := testutil.ToFloat64(metrics.RequestsTotal.WithLabelValues("/metrics/prometheus", "GET", "200"))
		if count != 0 {
			t.Errorf("expected 0 requests recorded for metrics endpoint, got %v", count)
		}
	})

	t.Run("records error status codes", func(t *testing.T) {
		metrics.RequestsTotal.Reset()

		handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusBadRequest)
		})

		r := chi.NewRouter()
		r.Use(PrometheusMetrics)
		r.Get("/error", handler)

		req := httptest.NewRequest("GET", "/error", nil)
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		count := testutil.ToFloat64(metrics.RequestsTotal.WithLabelValues("/error", "GET", "400"))
		if count != 1 {
			t.Errorf("expected 1 400 error recorded, got %v", count)
		}
	})

	t.Run("records duration histogram", func(t *testing.T) {
		metrics.RequestDuration.Reset()

		handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		})

		r := chi.NewRouter()
		r.Use(PrometheusMetrics)
		r.Get("/timed", handler)

		req := httptest.NewRequest("GET", "/timed", nil)
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		// Verify histogram was updated
		count := testutil.ToFloat64(metrics.RequestDuration.WithLabelValues("/timed"))
		if count == 0 {
			t.Error("expected duration to be recorded")
		}
	})

	t.Run("tracks active connections", func(t *testing.T) {
		// Set to known state
		metrics.ActiveConnections.Set(0)

		var duringRequest float64

		handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Check active connections during request
			duringRequest = testutil.ToFloat64(metrics.ActiveConnections)
			w.WriteHeader(http.StatusOK)
		})

		r := chi.NewRouter()
		r.Use(PrometheusMetrics)
		r.Get("/connection", handler)

		req := httptest.NewRequest("GET", "/connection", nil)
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		// During request, should have 1 active connection
		if duringRequest != 1 {
			t.Errorf("expected 1 active connection during request, got %v", duringRequest)
		}

		// After request, should be 0
		afterRequest := testutil.ToFloat64(metrics.ActiveConnections)
		if afterRequest != 0 {
			t.Errorf("expected 0 active connections after request, got %v", afterRequest)
		}
	})

	t.Run("records POST requests", func(t *testing.T) {
		metrics.RequestsTotal.Reset()

		handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusCreated)
		})

		r := chi.NewRouter()
		r.Use(PrometheusMetrics)
		r.Post("/create", handler)

		req := httptest.NewRequest("POST", "/create", nil)
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		count := testutil.ToFloat64(metrics.RequestsTotal.WithLabelValues("/create", "POST", "201"))
		if count != 1 {
			t.Errorf("expected 1 POST request recorded, got %v", count)
		}
	})
}

func TestPrometheusMetricsMiddleware_MultipleRequests(t *testing.T) {
	metrics.RequestsTotal.Reset()
	metrics.RequestDuration.Reset()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	r := chi.NewRouter()
	r.Use(PrometheusMetrics)
	r.Get("/multi", handler)

	// Make multiple requests
	for i := 0; i < 5; i++ {
		req := httptest.NewRequest("GET", "/multi", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
	}

	count := testutil.ToFloat64(metrics.RequestsTotal.WithLabelValues("/multi", "GET", "200"))
	if count != 5 {
		t.Errorf("expected 5 requests recorded, got %v", count)
	}

	durationCount := testutil.ToFloat64(metrics.RequestDuration.WithLabelValues("/multi"))
	if durationCount != 5 {
		t.Errorf("expected 5 duration observations, got %v", durationCount)
	}
}
