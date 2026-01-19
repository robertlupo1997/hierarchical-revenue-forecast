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
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/mlrf/mlrf-api/internal/cache"
	"github.com/mlrf/mlrf-api/internal/features"
	"github.com/mlrf/mlrf-api/internal/handlers"
	"github.com/mlrf/mlrf-api/internal/inference"
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

	// Create handlers
	h := handlers.NewHandlers(onnxSession, redisCache, featureStore)

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

	// CORS middleware for dashboard
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	})

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
