// Package main provides the entry point for the MLRF API server.
package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/mlrf/mlrf-api/internal/cache"
	"github.com/mlrf/mlrf-api/internal/features"
	"github.com/mlrf/mlrf-api/internal/handlers"
	"github.com/mlrf/mlrf-api/internal/inference"
	mlrfmiddleware "github.com/mlrf/mlrf-api/internal/middleware"
	"github.com/mlrf/mlrf-api/internal/shapclient"
	"github.com/mlrf/mlrf-api/internal/tracing"
)

func main() {
	// Setup logging
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	// Get configuration from environment
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	modelPath := os.Getenv("MODEL_PATH")
	if modelPath == "" {
		modelPath = "models/lightgbm_model.onnx"
	}

	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379"
	}

	featurePath := os.Getenv("FEATURE_PATH")
	if featurePath == "" {
		featurePath = "data/features/feature_matrix.parquet"
	}

	shapServiceAddr := os.Getenv("SHAP_SERVICE_ADDR")
	if shapServiceAddr == "" {
		shapServiceAddr = "localhost:50051"
	}

	// Initialize ONNX Runtime
	var onnxSession *inference.ONNXSession
	var err error

	// Check if model file exists before trying to load
	if _, statErr := os.Stat(modelPath); statErr == nil {
		onnxSession, err = inference.NewONNXSession(modelPath)
		if err != nil {
			log.Warn().Err(err).Msg("Failed to load ONNX model, running without inference")
		} else {
			log.Info().Str("model", modelPath).Msg("ONNX model loaded")
			defer onnxSession.Close()
		}
	} else {
		log.Warn().Str("model", modelPath).Msg("Model file not found, running without inference")
	}

	// Initialize Redis cache
	var redisCache *cache.RedisCache
	cacheCfg := cache.Config{
		URL:      redisURL,
		MaxLocal: 10000,
		TTL:      time.Hour,
	}
	redisCache, err = cache.NewRedisCache(cacheCfg)
	if err != nil {
		log.Warn().Err(err).Msg("Redis unavailable, running without cache")
		redisCache = nil
	} else {
		log.Info().Str("redis", redisURL).Msg("Redis connected")
		defer redisCache.Close()
	}

	// Initialize feature store
	var featureStore *features.Store
	if _, statErr := os.Stat(featurePath); statErr == nil {
		featureStore, err = features.NewStore(featurePath)
		if err != nil {
			log.Warn().Err(err).Msg("Failed to load feature store, using zero features")
		} else {
			log.Info().
				Str("path", featurePath).
				Int("size", featureStore.Size()).
				Int("aggregated", featureStore.AggregatedSize()).
				Msg("Feature store loaded")
		}
	} else {
		log.Warn().Str("path", featurePath).Msg("Feature file not found, using zero features")
	}

	// Initialize SHAP client (connects to Python sidecar for real SHAP computation)
	var shapClient *shapclient.Client
	shapClient, err = shapclient.NewClient(shapServiceAddr, 500*time.Millisecond)
	if err != nil {
		log.Warn().Err(err).Str("addr", shapServiceAddr).Msg("SHAP service unavailable, /explain endpoint will return 503")
		shapClient = nil
	} else {
		log.Info().Str("addr", shapServiceAddr).Msg("SHAP service connected")
		defer shapClient.Close()
	}

	// Initialize OpenTelemetry tracing
	tracingCfg := tracing.DefaultConfig()
	tracerProvider, err := tracing.NewTracerProvider(tracingCfg)
	if err != nil {
		log.Warn().Err(err).Msg("Failed to initialize tracing, running without distributed tracing")
	} else if tracerProvider.IsEnabled() {
		defer func() {
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := tracerProvider.Shutdown(shutdownCtx); err != nil {
				log.Error().Err(err).Msg("Failed to shutdown tracer provider")
			}
		}()
	}

	// Create handlers
	h := handlers.NewHandlers(onnxSession, redisCache, featureStore, shapClient)

	// Load prediction intervals for confidence bands
	intervalsPath := os.Getenv("INTERVALS_PATH")
	if intervalsPath == "" {
		intervalsPath = "models/prediction_intervals.json"
	}
	if err := h.LoadPredictionIntervals(intervalsPath); err != nil {
		log.Warn().Str("path", intervalsPath).Msg("Running without prediction intervals")
	}

	// Setup router
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	// OpenTelemetry tracing middleware (skip health and metrics endpoints for efficiency)
	r.Use(mlrfmiddleware.TracingMiddlewareWithFilter(tracerProvider, []string{"/health", "/metrics/prometheus"}))

	// CORS middleware for dashboard (configurable via CORS_ORIGINS env var)
	corsConfig := mlrfmiddleware.NewCORSConfig()
	log.Info().Strs("origins", corsConfig.AllowedOrigins).Msg("CORS configuration loaded")
	r.Use(mlrfmiddleware.CORS(corsConfig))

	// Rate limiting middleware (100 req/sec default, configurable via RATE_LIMIT_RPS/BURST)
	rateLimitCfg := mlrfmiddleware.DefaultRateLimiterConfig()
	rateLimiter := mlrfmiddleware.NewRateLimiter(rateLimitCfg)
	log.Info().
		Float64("rps", rateLimitCfg.RequestsPerSecond).
		Int("burst", rateLimitCfg.BurstSize).
		Msg("Rate limiter initialized")
	r.Use(rateLimiter.Middleware)

	// API Key authentication middleware (optional - controlled by API_KEY env var)
	r.Use(mlrfmiddleware.APIKeyAuth)

	// Prometheus metrics middleware (must be after auth to capture authenticated requests)
	r.Use(mlrfmiddleware.PrometheusMetrics)

	// Routes
	r.Get("/health", h.Health)
	r.Post("/predict", h.Predict)
	r.Post("/predict/simple", h.PredictSimple)
	r.Post("/predict/batch", h.PredictBatch)
	r.Post("/explain", h.Explain)
	r.Get("/hierarchy", h.Hierarchy)
	r.Get("/metrics", h.Metrics)
	r.Get("/model-metrics", h.ModelMetrics)
	r.Get("/accuracy", h.Accuracy)
	r.Post("/whatif", h.WhatIf)
	r.Post("/historical", h.Historical)
	r.Handle("/metrics/prometheus", promhttp.Handler())

	// Admin routes (protected by ADMIN_API_KEY)
	r.Post("/admin/reload-features", h.ReloadFeatures)

	// Start server
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		log.Info().Str("addr", srv.Addr).Msg("Starting server")
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("Server failed")
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Error().Err(err).Msg("Server forced to shutdown")
	}

	log.Info().Msg("Server stopped")
}
