package handlers

import (
	"encoding/json"
	"net/http"
)

// HealthResponse represents the health check response.
type HealthResponse struct {
	Status string `json:"status"`
	ONNX   string `json:"onnx,omitempty"`
	Redis  string `json:"redis,omitempty"`
}

// Health returns the health status of the API.
func (h *Handlers) Health(w http.ResponseWriter, r *http.Request) {
	resp := HealthResponse{
		Status: "healthy",
	}

	// Check ONNX session
	if h.onnx != nil {
		resp.ONNX = "connected"
	} else {
		resp.ONNX = "not configured"
	}

	// Check Redis
	if h.cache != nil {
		resp.Redis = "connected"
	} else {
		resp.Redis = "not configured"
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

// Metrics returns Prometheus-compatible metrics.
func (h *Handlers) Metrics(w http.ResponseWriter, r *http.Request) {
	// Simple metrics for now
	metrics := map[string]interface{}{
		"onnx_loaded": h.onnx != nil,
	}

	if h.cache != nil {
		metrics["cache_stats"] = h.cache.Stats()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}
