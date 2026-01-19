package tracing

import (
	"context"
	"os"
	"testing"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

func TestDefaultConfig(t *testing.T) {
	// Clear environment for clean test
	os.Unsetenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	os.Unsetenv("OTEL_ENABLED")
	os.Unsetenv("OTEL_SERVICE_NAME")

	cfg := DefaultConfig()

	if cfg.Endpoint != "localhost:4318" {
		t.Errorf("expected default endpoint localhost:4318, got %s", cfg.Endpoint)
	}

	if cfg.ServiceName != ServiceName {
		t.Errorf("expected service name %s, got %s", ServiceName, cfg.ServiceName)
	}

	if cfg.SampleRate != 1.0 {
		t.Errorf("expected sample rate 1.0, got %f", cfg.SampleRate)
	}
}

func TestDefaultConfigWithEnv(t *testing.T) {
	// Set environment variables
	os.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "jaeger:4318")
	os.Setenv("OTEL_SERVICE_NAME", "test-service")
	defer os.Unsetenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	defer os.Unsetenv("OTEL_SERVICE_NAME")

	cfg := DefaultConfig()

	if cfg.Endpoint != "jaeger:4318" {
		t.Errorf("expected endpoint jaeger:4318, got %s", cfg.Endpoint)
	}

	if cfg.ServiceName != "test-service" {
		t.Errorf("expected service name test-service, got %s", cfg.ServiceName)
	}
}

func TestDefaultConfigDisabled(t *testing.T) {
	os.Setenv("OTEL_ENABLED", "false")
	defer os.Unsetenv("OTEL_ENABLED")

	cfg := DefaultConfig()

	if cfg.Enabled {
		t.Error("expected tracing to be disabled")
	}
}

func TestNewTracerProviderDisabled(t *testing.T) {
	cfg := Config{
		Enabled:     false,
		ServiceName: "test",
	}

	tp, err := NewTracerProvider(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if tp.IsEnabled() {
		t.Error("expected tracer provider to be disabled")
	}

	// Should still have a valid tracer (no-op)
	tracer := tp.Tracer()
	if tracer == nil {
		t.Error("expected non-nil tracer even when disabled")
	}
}

func TestTracerProviderShutdown(t *testing.T) {
	cfg := Config{
		Enabled:     false,
		ServiceName: "test",
	}

	tp, err := NewTracerProvider(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Shutdown should not error when provider is nil
	err = tp.Shutdown(context.Background())
	if err != nil {
		t.Errorf("unexpected error on shutdown: %v", err)
	}
}

func TestTracerProviderStartSpan(t *testing.T) {
	cfg := Config{
		Enabled:     false, // Use disabled config to avoid network calls
		ServiceName: "test",
	}

	tp, err := NewTracerProvider(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	ctx, span := tp.StartSpan(context.Background(), "test-span")
	if ctx == nil {
		t.Error("expected non-nil context")
	}
	if span == nil {
		t.Error("expected non-nil span")
	}

	span.End()
}

func TestSpanFromContext(t *testing.T) {
	// Get span from context without any span (should return no-op)
	span := SpanFromContext(context.Background())
	if span == nil {
		t.Error("expected non-nil span (no-op)")
	}
}

func TestSetSpanAttributes(t *testing.T) {
	// Should not panic even with no span in context
	ctx := context.Background()
	SetSpanAttributes(ctx, attribute.String("key", "value"))
}

func TestRecordError(t *testing.T) {
	// Should not panic even with no span in context
	ctx := context.Background()
	RecordError(ctx, nil)
}

func TestSetSpanStatus(t *testing.T) {
	// Should not panic even with no span in context
	ctx := context.Background()
	SetSpanStatus(ctx, codes.Ok, "success")
	SetSpanStatus(ctx, codes.Error, "failed")
}

func TestAddEvent(t *testing.T) {
	// Should not panic even with no span in context
	ctx := context.Background()
	AddEvent(ctx, "test-event", attribute.String("key", "value"))
}

func TestAttributeKeys(t *testing.T) {
	// Verify attribute keys are properly defined
	attrs := []attribute.Key{
		AttrStoreNbr,
		AttrFamily,
		AttrDate,
		AttrHorizon,
		AttrCacheHit,
		AttrBatchSize,
		AttrPrediction,
		AttrInferenceMs,
	}

	for _, attr := range attrs {
		if string(attr) == "" {
			t.Error("expected non-empty attribute key")
		}
	}
}

func TestGetEnvironment(t *testing.T) {
	// Clear environment
	os.Unsetenv("ENVIRONMENT")
	env := getEnvironment()
	if env != "development" {
		t.Errorf("expected development, got %s", env)
	}

	// Set environment
	os.Setenv("ENVIRONMENT", "production")
	defer os.Unsetenv("ENVIRONMENT")
	env = getEnvironment()
	if env != "production" {
		t.Errorf("expected production, got %s", env)
	}
}

func TestConstants(t *testing.T) {
	if ServiceName != "mlrf-api" {
		t.Errorf("expected service name mlrf-api, got %s", ServiceName)
	}

	if ServiceVersion != "1.0.0" {
		t.Errorf("expected service version 1.0.0, got %s", ServiceVersion)
	}
}

func TestConfigDefaults(t *testing.T) {
	cfg := Config{}

	if cfg.Enabled {
		t.Error("expected default Enabled to be false")
	}

	if cfg.Endpoint != "" {
		t.Errorf("expected default Endpoint to be empty, got %s", cfg.Endpoint)
	}

	if cfg.SampleRate != 0 {
		t.Errorf("expected default SampleRate to be 0, got %f", cfg.SampleRate)
	}
}

func TestSpanContextOperations(t *testing.T) {
	cfg := Config{
		Enabled:     false,
		ServiceName: "test",
	}

	tp, _ := NewTracerProvider(cfg)
	ctx, span := tp.StartSpan(context.Background(), "test")
	defer span.End()

	// Test SpanFromContext returns the span we created
	retrieved := SpanFromContext(ctx)
	if retrieved == nil {
		t.Error("expected non-nil span from context")
	}
}

func TestSetSpanStatusCodes(t *testing.T) {
	cfg := Config{
		Enabled:     false,
		ServiceName: "test",
	}

	tp, _ := NewTracerProvider(cfg)
	ctx, span := tp.StartSpan(context.Background(), "test")
	defer span.End()

	// Test various status codes don't panic
	SetSpanStatus(ctx, codes.Ok, "ok")
	SetSpanStatus(ctx, codes.Error, "error")
	SetSpanStatus(ctx, codes.Unset, "unset")
}

func TestTracerFromDisabledProvider(t *testing.T) {
	cfg := Config{
		Enabled:     false,
		ServiceName: "test-disabled",
	}

	tp, err := NewTracerProvider(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	tracer := tp.Tracer()

	// Start a span with the disabled tracer
	ctx, span := tracer.Start(context.Background(), "test-span",
		trace.WithAttributes(attribute.String("test", "value")),
	)

	if ctx == nil {
		t.Error("expected non-nil context from disabled tracer")
	}

	if span == nil {
		t.Error("expected non-nil span from disabled tracer")
	}

	// End the span (should not panic)
	span.End()
}
