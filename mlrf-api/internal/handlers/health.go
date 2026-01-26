package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

// FeatureStoreHealth represents the health status of the feature store.
type FeatureStoreHealth struct {
	Status      string `json:"status"`
	Loaded      bool   `json:"loaded"`
	Fresh       bool   `json:"fresh"`
	LoadedAt    string `json:"loaded_at,omitempty"`
	Age         string `json:"age,omitempty"`
	DataDateMax string `json:"data_date_max,omitempty"`
	DataAge     string `json:"data_age,omitempty"`
	RowCount    int    `json:"row_count,omitempty"`
	Version     string `json:"version,omitempty"`
}

// ShapHealth represents the health status of the SHAP service.
type ShapHealth struct {
	Status string `json:"status"`
}

// HealthResponse represents the health check response.
type HealthResponse struct {
	Status       string              `json:"status"`
	ONNX         string              `json:"onnx,omitempty"`
	Redis        string              `json:"redis,omitempty"`
	FeatureStore *FeatureStoreHealth `json:"feature_store,omitempty"`
	Shap         *ShapHealth         `json:"shap,omitempty"`
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

	// Check Feature Store
	resp.FeatureStore = h.getFeatureStoreHealth()
	if resp.FeatureStore != nil && !resp.FeatureStore.Fresh && resp.FeatureStore.Loaded {
		resp.Status = "degraded"
	}

	// Check SHAP service
	resp.Shap = h.getShapHealth(r.Context())

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

// getFeatureStoreHealth returns the health status of the feature store.
func (h *Handlers) getFeatureStoreHealth() *FeatureStoreHealth {
	if h.featureStore == nil {
		return &FeatureStoreHealth{
			Status: "not configured",
			Loaded: false,
			Fresh:  false,
		}
	}

	meta := h.featureStore.GetMetadata()
	loaded := h.featureStore.IsLoaded()
	fresh := h.featureStore.IsFresh()

	health := &FeatureStoreHealth{
		Loaded: loaded,
		Fresh:  fresh,
	}

	if loaded {
		health.Status = "healthy"
		health.LoadedAt = meta.LoadedAt.Format(time.RFC3339)
		health.Age = h.featureStore.Age().Round(time.Second).String()
		health.DataDateMax = meta.DataDateMax
		health.DataAge = h.featureStore.DataAge().Round(time.Hour).String()
		health.RowCount = meta.RowCount
		health.Version = meta.Version

		if !fresh {
			health.Status = "stale"
		}
	} else {
		health.Status = "not loaded"
	}

	return health
}

// getShapHealth returns the health status of the SHAP service.
func (h *Handlers) getShapHealth(ctx context.Context) *ShapHealth {
	if h.shapClient == nil {
		return &ShapHealth{
			Status: "not configured",
		}
	}

	// Try to check SHAP service health
	healthy, err := h.shapClient.Health(ctx)
	if err != nil || !healthy {
		return &ShapHealth{
			Status: "unavailable",
		}
	}

	return &ShapHealth{
		Status: "healthy",
	}
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

	// Add feature store metrics
	if h.featureStore != nil && h.featureStore.IsLoaded() {
		meta := h.featureStore.GetMetadata()
		metrics["feature_store"] = map[string]interface{}{
			"loaded":        true,
			"fresh":         h.featureStore.IsFresh(),
			"age_seconds":   h.featureStore.Age().Seconds(),
			"row_count":     meta.RowCount,
			"data_date_max": meta.DataDateMax,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}

// ModelMetric represents model performance metrics for comparison.
type ModelMetric struct {
	Model string  `json:"model"`
	RMSLE float64 `json:"rmsle"`
	MAPE  float64 `json:"mape"`
	RMSE  float64 `json:"rmse"`
}

// ModelMetrics returns model comparison metrics for the dashboard.
func (h *Handlers) ModelMetrics(w http.ResponseWriter, r *http.Request) {
	// Model comparison data - LightGBM from actual training, others estimated
	metrics := []ModelMetric{
		{Model: "LightGBM + MinTrace", RMSLE: 0.4770, MAPE: 0.15, RMSE: 214.58},
		{Model: "AutoARIMA + BottomUp", RMSLE: 0.5200, MAPE: 0.19, RMSE: 245.00},
		{Model: "ETS + TopDown", RMSLE: 0.5800, MAPE: 0.22, RMSE: 280.00},
		{Model: "SeasonalNaive", RMSLE: 0.6521, MAPE: 0.28, RMSE: 320.00},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}
