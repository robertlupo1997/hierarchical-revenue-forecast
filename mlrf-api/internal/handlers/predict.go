package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/mlrf/mlrf-api/internal/cache"
	"github.com/rs/zerolog/log"
)

// PredictRequest represents a single prediction request.
type PredictRequest struct {
	StoreNbr int       `json:"store_nbr"`
	Family   string    `json:"family"`
	Date     string    `json:"date"`
	Features []float32 `json:"features"`
	Horizon  int       `json:"horizon"`
}

// PredictResponse represents a single prediction response.
type PredictResponse struct {
	StoreNbr   int     `json:"store_nbr"`
	Family     string  `json:"family"`
	Date       string  `json:"date"`
	Prediction float32 `json:"prediction"`
	Cached     bool    `json:"cached"`
	LatencyMs  float64 `json:"latency_ms"`
}

// BatchPredictRequest represents a batch prediction request.
type BatchPredictRequest struct {
	Predictions []PredictRequest `json:"predictions"`
}

// BatchPredictResponse represents a batch prediction response.
type BatchPredictResponse struct {
	Predictions []PredictResponse `json:"predictions"`
	LatencyMs   float64           `json:"latency_ms"`
}

// SimplePredictRequest represents a simplified prediction request without features.
// Features are generated internally (currently as zeros, future: feature matrix lookup).
type SimplePredictRequest struct {
	StoreNbr int    `json:"store_nbr"`
	Family   string `json:"family"`
	Date     string `json:"date"`
	Horizon  int    `json:"horizon"`
}

// Predict handles single prediction requests.
func (h *Handlers) Predict(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	ctx := r.Context()

	var req PredictRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Validate request
	if req.StoreNbr <= 0 {
		http.Error(w, `{"error":"store_nbr must be positive"}`, http.StatusBadRequest)
		return
	}
	if req.Family == "" {
		http.Error(w, `{"error":"family is required"}`, http.StatusBadRequest)
		return
	}
	if req.Date == "" {
		http.Error(w, `{"error":"date is required"}`, http.StatusBadRequest)
		return
	}
	if len(req.Features) == 0 {
		http.Error(w, `{"error":"features are required"}`, http.StatusBadRequest)
		return
	}

	// Check cache first
	cacheKey := cache.GenerateCacheKey(req.StoreNbr, req.Family, req.Date, req.Horizon)
	if h.cache != nil {
		if cached, err := h.cache.GetPrediction(ctx, cacheKey); err == nil {
			resp := PredictResponse{
				StoreNbr:   cached.StoreNbr,
				Family:     cached.Family,
				Date:       cached.Date,
				Prediction: cached.Prediction,
				Cached:     true,
				LatencyMs:  float64(time.Since(start).Microseconds()) / 1000,
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(resp)
			return
		}
	}

	// Run inference
	if h.onnx == nil {
		http.Error(w, `{"error":"model not loaded"}`, http.StatusServiceUnavailable)
		return
	}

	prediction, err := h.onnx.Predict(req.Features)
	if err != nil {
		log.Error().Err(err).Msg("inference failed")
		http.Error(w, `{"error":"inference failed"}`, http.StatusInternalServerError)
		return
	}

	// Cache result
	if h.cache != nil {
		result := &cache.PredictionResult{
			StoreNbr:   req.StoreNbr,
			Family:     req.Family,
			Date:       req.Date,
			Horizon:    req.Horizon,
			Prediction: prediction,
		}
		if err := h.cache.SetPrediction(ctx, cacheKey, result); err != nil {
			log.Warn().Err(err).Msg("failed to cache prediction")
		}
	}

	resp := PredictResponse{
		StoreNbr:   req.StoreNbr,
		Family:     req.Family,
		Date:       req.Date,
		Prediction: prediction,
		Cached:     false,
		LatencyMs:  float64(time.Since(start).Microseconds()) / 1000,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// PredictBatch handles batch prediction requests.
func (h *Handlers) PredictBatch(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	ctx := r.Context()

	var req BatchPredictRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if len(req.Predictions) == 0 {
		http.Error(w, `{"error":"predictions array is empty"}`, http.StatusBadRequest)
		return
	}

	responses := make([]PredictResponse, 0, len(req.Predictions))

	for _, pred := range req.Predictions {
		predStart := time.Now()

		// Check cache first
		cacheKey := cache.GenerateCacheKey(pred.StoreNbr, pred.Family, pred.Date, pred.Horizon)
		if h.cache != nil {
			if cached, err := h.cache.GetPrediction(ctx, cacheKey); err == nil {
				responses = append(responses, PredictResponse{
					StoreNbr:   cached.StoreNbr,
					Family:     cached.Family,
					Date:       cached.Date,
					Prediction: cached.Prediction,
					Cached:     true,
					LatencyMs:  float64(time.Since(predStart).Microseconds()) / 1000,
				})
				continue
			}
		}

		// Run inference
		if h.onnx == nil {
			http.Error(w, `{"error":"model not loaded"}`, http.StatusServiceUnavailable)
			return
		}

		prediction, err := h.onnx.Predict(pred.Features)
		if err != nil {
			log.Error().Err(err).Msg("batch inference failed")
			http.Error(w, `{"error":"inference failed"}`, http.StatusInternalServerError)
			return
		}

		// Cache result
		if h.cache != nil {
			result := &cache.PredictionResult{
				StoreNbr:   pred.StoreNbr,
				Family:     pred.Family,
				Date:       pred.Date,
				Horizon:    pred.Horizon,
				Prediction: prediction,
			}
			if err := h.cache.SetPrediction(ctx, cacheKey, result); err != nil {
				log.Warn().Err(err).Msg("failed to cache batch prediction")
			}
		}

		responses = append(responses, PredictResponse{
			StoreNbr:   pred.StoreNbr,
			Family:     pred.Family,
			Date:       pred.Date,
			Prediction: prediction,
			Cached:     false,
			LatencyMs:  float64(time.Since(predStart).Microseconds()) / 1000,
		})
	}

	resp := BatchPredictResponse{
		Predictions: responses,
		LatencyMs:   float64(time.Since(start).Microseconds()) / 1000,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// PredictSimple handles simplified prediction requests without feature arrays.
// It generates mock features (27 zeros) and delegates to the inference engine.
// This endpoint is designed for dashboard use where features aren't available client-side.
func (h *Handlers) PredictSimple(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	ctx := r.Context()

	var req SimplePredictRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Validate request
	if req.StoreNbr <= 0 {
		http.Error(w, `{"error":"store_nbr must be positive"}`, http.StatusBadRequest)
		return
	}
	if req.Family == "" {
		http.Error(w, `{"error":"family is required"}`, http.StatusBadRequest)
		return
	}
	if req.Date == "" {
		http.Error(w, `{"error":"date is required"}`, http.StatusBadRequest)
		return
	}
	// Validate horizon is one of the allowed values
	validHorizons := map[int]bool{15: true, 30: true, 60: true, 90: true}
	if !validHorizons[req.Horizon] {
		http.Error(w, `{"error":"horizon must be 15, 30, 60, or 90"}`, http.StatusBadRequest)
		return
	}

	// Check cache first
	cacheKey := cache.GenerateCacheKey(req.StoreNbr, req.Family, req.Date, req.Horizon)
	if h.cache != nil {
		if cached, err := h.cache.GetPrediction(ctx, cacheKey); err == nil {
			resp := PredictResponse{
				StoreNbr:   cached.StoreNbr,
				Family:     cached.Family,
				Date:       cached.Date,
				Prediction: cached.Prediction,
				Cached:     true,
				LatencyMs:  float64(time.Since(start).Microseconds()) / 1000,
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(resp)
			return
		}
	}

	// Run inference
	if h.onnx == nil {
		http.Error(w, `{"error":"model not loaded"}`, http.StatusServiceUnavailable)
		return
	}

	// Look up real features from feature store, or use zeros as fallback
	var features []float32
	if h.featureStore != nil && h.featureStore.IsLoaded() {
		features, _ = h.featureStore.GetFeatures(req.StoreNbr, req.Family, req.Date)
	} else {
		// Fallback to zeros if feature store is unavailable
		features = make([]float32, 27)
		log.Debug().Msg("Feature store unavailable, using zero features")
	}

	prediction, err := h.onnx.Predict(features)
	if err != nil {
		log.Error().Err(err).Msg("inference failed")
		http.Error(w, `{"error":"inference failed"}`, http.StatusInternalServerError)
		return
	}

	// Cache result
	if h.cache != nil {
		result := &cache.PredictionResult{
			StoreNbr:   req.StoreNbr,
			Family:     req.Family,
			Date:       req.Date,
			Horizon:    req.Horizon,
			Prediction: prediction,
		}
		if err := h.cache.SetPrediction(ctx, cacheKey, result); err != nil {
			log.Warn().Err(err).Msg("failed to cache prediction")
		}
	}

	resp := PredictResponse{
		StoreNbr:   req.StoreNbr,
		Family:     req.Family,
		Date:       req.Date,
		Prediction: prediction,
		Cached:     false,
		LatencyMs:  float64(time.Since(start).Microseconds()) / 1000,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
