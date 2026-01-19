// Package tracing provides OpenTelemetry distributed tracing for the MLRF API.
package tracing

import (
	"context"
	"os"
	"time"

	"github.com/rs/zerolog/log"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
	"go.opentelemetry.io/otel/trace"
)

const (
	// ServiceName is the name of this service in traces.
	ServiceName = "mlrf-api"

	// ServiceVersion is the current version.
	ServiceVersion = "1.0.0"
)

// Config holds configuration for the tracing system.
type Config struct {
	// Enabled controls whether tracing is active.
	Enabled bool

	// Endpoint is the OTLP collector endpoint (e.g., "localhost:4318" for Jaeger).
	Endpoint string

	// SampleRate is the fraction of traces to sample (0.0-1.0).
	SampleRate float64

	// ServiceName overrides the default service name.
	ServiceName string
}

// DefaultConfig returns a Config with sensible defaults from environment variables.
func DefaultConfig() Config {
	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if endpoint == "" {
		endpoint = "localhost:4318"
	}

	enabled := os.Getenv("OTEL_ENABLED") != "false" && endpoint != ""

	serviceName := os.Getenv("OTEL_SERVICE_NAME")
	if serviceName == "" {
		serviceName = ServiceName
	}

	return Config{
		Enabled:     enabled,
		Endpoint:    endpoint,
		SampleRate:  1.0, // Sample all traces in dev, reduce in production
		ServiceName: serviceName,
	}
}

// TracerProvider wraps the OpenTelemetry trace provider.
type TracerProvider struct {
	provider *sdktrace.TracerProvider
	tracer   trace.Tracer
	config   Config
}

// NewTracerProvider initializes OpenTelemetry tracing with the given config.
func NewTracerProvider(cfg Config) (*TracerProvider, error) {
	if !cfg.Enabled {
		log.Info().Msg("Tracing disabled")
		return &TracerProvider{
			config: cfg,
			tracer: otel.Tracer(cfg.ServiceName),
		}, nil
	}

	ctx := context.Background()

	// Create OTLP HTTP exporter
	client := otlptracehttp.NewClient(
		otlptracehttp.WithEndpoint(cfg.Endpoint),
		otlptracehttp.WithInsecure(),
	)

	exporter, err := otlptrace.New(ctx, client)
	if err != nil {
		return nil, err
	}

	// Create resource with service information
	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(cfg.ServiceName),
			semconv.ServiceVersion(ServiceVersion),
			attribute.String("environment", getEnvironment()),
		),
	)
	if err != nil {
		return nil, err
	}

	// Create trace provider with batch span processor
	provider := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter,
			sdktrace.WithBatchTimeout(5*time.Second),
			sdktrace.WithMaxExportBatchSize(512),
		),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sdktrace.TraceIDRatioBased(cfg.SampleRate)),
	)

	// Set global trace provider and propagator
	otel.SetTracerProvider(provider)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	log.Info().
		Str("endpoint", cfg.Endpoint).
		Float64("sample_rate", cfg.SampleRate).
		Msg("OpenTelemetry tracing initialized")

	return &TracerProvider{
		provider: provider,
		tracer:   provider.Tracer(cfg.ServiceName),
		config:   cfg,
	}, nil
}

// Shutdown gracefully shuts down the trace provider.
func (tp *TracerProvider) Shutdown(ctx context.Context) error {
	if tp.provider == nil {
		return nil
	}
	return tp.provider.Shutdown(ctx)
}

// Tracer returns the configured tracer for creating spans.
func (tp *TracerProvider) Tracer() trace.Tracer {
	return tp.tracer
}

// IsEnabled returns whether tracing is enabled.
func (tp *TracerProvider) IsEnabled() bool {
	return tp.config.Enabled && tp.provider != nil
}

// StartSpan creates a new span from the given context.
func (tp *TracerProvider) StartSpan(ctx context.Context, name string, opts ...trace.SpanStartOption) (context.Context, trace.Span) {
	return tp.tracer.Start(ctx, name, opts...)
}

// SpanFromContext returns the span from context, or a no-op span if none exists.
func SpanFromContext(ctx context.Context) trace.Span {
	return trace.SpanFromContext(ctx)
}

// SetSpanAttributes adds attributes to the span in the context.
func SetSpanAttributes(ctx context.Context, attrs ...attribute.KeyValue) {
	span := trace.SpanFromContext(ctx)
	span.SetAttributes(attrs...)
}

// RecordError records an error on the span in the context.
func RecordError(ctx context.Context, err error) {
	span := trace.SpanFromContext(ctx)
	span.RecordError(err)
}

// SetSpanStatus sets the status of the span in the context.
func SetSpanStatus(ctx context.Context, code trace.StatusCode, description string) {
	span := trace.SpanFromContext(ctx)
	span.SetStatus(code, description)
}

// AddEvent adds an event to the span in the context.
func AddEvent(ctx context.Context, name string, attrs ...attribute.KeyValue) {
	span := trace.SpanFromContext(ctx)
	span.AddEvent(name, trace.WithAttributes(attrs...))
}

// Common attribute keys for MLRF API.
var (
	AttrStoreNbr    = attribute.Key("mlrf.store_nbr")
	AttrFamily      = attribute.Key("mlrf.family")
	AttrDate        = attribute.Key("mlrf.date")
	AttrHorizon     = attribute.Key("mlrf.horizon")
	AttrCacheHit    = attribute.Key("mlrf.cache_hit")
	AttrBatchSize   = attribute.Key("mlrf.batch_size")
	AttrPrediction  = attribute.Key("mlrf.prediction")
	AttrInferenceMs = attribute.Key("mlrf.inference_ms")
)

// getEnvironment returns the current environment name.
func getEnvironment() string {
	env := os.Getenv("ENVIRONMENT")
	if env == "" {
		env = "development"
	}
	return env
}
