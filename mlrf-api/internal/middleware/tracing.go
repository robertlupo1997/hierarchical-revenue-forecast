// Package middleware provides HTTP middleware for the MLRF API.
package middleware

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"

	"github.com/mlrf/mlrf-api/internal/tracing"
)

// Tracing returns HTTP middleware that creates spans for incoming requests.
// It integrates with OpenTelemetry and propagates trace context.
func Tracing(tp *tracing.TracerProvider) func(http.Handler) http.Handler {
	// If tracing is disabled, return a no-op middleware
	if tp == nil || !tp.IsEnabled() {
		return func(next http.Handler) http.Handler {
			return next
		}
	}

	return func(next http.Handler) http.Handler {
		// Use otelhttp.NewHandler for automatic span creation and context propagation
		handler := otelhttp.NewHandler(
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				// Add request ID to span if available
				if requestID := chimiddleware.GetReqID(r.Context()); requestID != "" {
					span := trace.SpanFromContext(r.Context())
					span.SetAttributes(attribute.String("request.id", requestID))
				}

				// Get route pattern for better span naming
				if routeCtx := chi.RouteContext(r.Context()); routeCtx != nil {
					if pattern := routeCtx.RoutePattern(); pattern != "" {
						span := trace.SpanFromContext(r.Context())
						span.SetAttributes(attribute.String("http.route", pattern))
					}
				}

				next.ServeHTTP(w, r)
			}),
			"http.request",
			otelhttp.WithSpanNameFormatter(func(operation string, r *http.Request) string {
				// Use method + path as span name
				return r.Method + " " + r.URL.Path
			}),
		)

		return handler
	}
}

// TracingMiddlewareWithFilter returns middleware that can skip tracing for certain paths.
func TracingMiddlewareWithFilter(tp *tracing.TracerProvider, skipPaths []string) func(http.Handler) http.Handler {
	if tp == nil || !tp.IsEnabled() {
		return func(next http.Handler) http.Handler {
			return next
		}
	}

	skipMap := make(map[string]bool)
	for _, path := range skipPaths {
		skipMap[path] = true
	}

	baseMiddleware := Tracing(tp)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip tracing for certain paths (e.g., health checks)
			if skipMap[r.URL.Path] {
				next.ServeHTTP(w, r)
				return
			}

			baseMiddleware(next).ServeHTTP(w, r)
		})
	}
}

// InjectTraceContext extracts trace ID and span ID from context and returns them.
// Useful for logging or passing to downstream services.
func InjectTraceContext(r *http.Request) (traceID, spanID string) {
	span := trace.SpanFromContext(r.Context())
	if span.SpanContext().IsValid() {
		traceID = span.SpanContext().TraceID().String()
		spanID = span.SpanContext().SpanID().String()
	}
	return
}
