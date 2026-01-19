package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/mlrf/mlrf-api/internal/tracing"
)

func TestTracingMiddleware_Disabled(t *testing.T) {
	// Test with nil tracer provider
	middleware := Tracing(nil)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()

	middleware(handler).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
}

func TestTracingMiddleware_DisabledProvider(t *testing.T) {
	// Create a disabled tracer provider
	cfg := tracing.Config{
		Enabled:     false,
		ServiceName: "test",
	}
	tp, err := tracing.NewTracerProvider(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	middleware := Tracing(tp)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()

	middleware(handler).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
}

func TestTracingMiddlewareWithFilter_NilProvider(t *testing.T) {
	skipPaths := []string{"/health", "/metrics"}
	middleware := TracingMiddlewareWithFilter(nil, skipPaths)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// Test non-skipped path
	req := httptest.NewRequest(http.MethodGet, "/predict", nil)
	rec := httptest.NewRecorder()
	middleware(handler).ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}

	// Test skipped path
	req = httptest.NewRequest(http.MethodGet, "/health", nil)
	rec = httptest.NewRecorder()
	middleware(handler).ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200 for health, got %d", rec.Code)
	}
}

func TestTracingMiddlewareWithFilter_SkippedPaths(t *testing.T) {
	// Create a disabled tracer provider
	cfg := tracing.Config{
		Enabled:     false,
		ServiceName: "test",
	}
	tp, _ := tracing.NewTracerProvider(cfg)

	skipPaths := []string{"/health", "/metrics/prometheus"}
	middleware := TracingMiddlewareWithFilter(tp, skipPaths)

	handlerCallCount := 0
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCallCount++
		w.WriteHeader(http.StatusOK)
	})

	testCases := []struct {
		path string
	}{
		{"/health"},
		{"/metrics/prometheus"},
		{"/predict"},
		{"/explain"},
	}

	for _, tc := range testCases {
		req := httptest.NewRequest(http.MethodGet, tc.path, nil)
		rec := httptest.NewRecorder()
		middleware(handler).ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Errorf("expected status 200 for %s, got %d", tc.path, rec.Code)
		}
	}

	if handlerCallCount != len(testCases) {
		t.Errorf("expected handler to be called %d times, got %d", len(testCases), handlerCallCount)
	}
}

func TestTracingMiddlewareWithFilter_EmptySkipPaths(t *testing.T) {
	cfg := tracing.Config{
		Enabled:     false,
		ServiceName: "test",
	}
	tp, _ := tracing.NewTracerProvider(cfg)

	// Empty skip paths should trace everything
	middleware := TracingMiddlewareWithFilter(tp, []string{})

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	middleware(handler).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
}

func TestInjectTraceContext_NoSpan(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/test", nil)

	traceID, spanID := InjectTraceContext(req)

	// Without a span in context, should return empty strings
	if traceID != "" {
		t.Errorf("expected empty trace ID, got %s", traceID)
	}
	if spanID != "" {
		t.Errorf("expected empty span ID, got %s", spanID)
	}
}

func TestTracingMiddleware_WithChiRouter(t *testing.T) {
	cfg := tracing.Config{
		Enabled:     false,
		ServiceName: "test",
	}
	tp, _ := tracing.NewTracerProvider(cfg)

	r := chi.NewRouter()
	r.Use(Tracing(tp))

	r.Get("/test/{id}", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	req := httptest.NewRequest(http.MethodGet, "/test/123", nil)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
	if rec.Body.String() != "OK" {
		t.Errorf("expected body OK, got %s", rec.Body.String())
	}
}

func TestTracingMiddleware_POST(t *testing.T) {
	cfg := tracing.Config{
		Enabled:     false,
		ServiceName: "test",
	}
	tp, _ := tracing.NewTracerProvider(cfg)

	middleware := Tracing(tp)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	})

	req := httptest.NewRequest(http.MethodPost, "/predict", nil)
	rec := httptest.NewRecorder()

	middleware(handler).ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Errorf("expected status 201, got %d", rec.Code)
	}
}

func TestTracingMiddleware_ErrorResponse(t *testing.T) {
	cfg := tracing.Config{
		Enabled:     false,
		ServiceName: "test",
	}
	tp, _ := tracing.NewTracerProvider(cfg)

	middleware := Tracing(tp)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "internal error", http.StatusInternalServerError)
	})

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()

	middleware(handler).ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("expected status 500, got %d", rec.Code)
	}
}

func TestTracingMiddleware_Concurrency(t *testing.T) {
	cfg := tracing.Config{
		Enabled:     false,
		ServiceName: "test",
	}
	tp, _ := tracing.NewTracerProvider(cfg)

	middleware := Tracing(tp)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// Run multiple concurrent requests
	done := make(chan bool, 10)
	for i := 0; i < 10; i++ {
		go func() {
			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			rec := httptest.NewRecorder()
			middleware(handler).ServeHTTP(rec, req)
			done <- rec.Code == http.StatusOK
		}()
	}

	for i := 0; i < 10; i++ {
		if !<-done {
			t.Error("concurrent request failed")
		}
	}
}
