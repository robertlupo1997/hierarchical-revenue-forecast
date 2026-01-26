package handlers

import (
	"encoding/json"
	"net/http"
	"os"

	"github.com/rs/zerolog/log"
)

// ReloadResponse represents the response from a reload operation.
type ReloadResponse struct {
	Status   string                 `json:"status"`
	Message  string                 `json:"message,omitempty"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

// ReloadFeatures triggers a hot reload of the feature store.
// Requires admin authentication via X-Admin-Key header (if ADMIN_API_KEY is set).
func (h *Handlers) ReloadFeatures(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		WriteError(w, r, http.StatusMethodNotAllowed, "method not allowed", "METHOD_NOT_ALLOWED")
		return
	}

	// Verify admin auth
	adminKey := os.Getenv("ADMIN_API_KEY")
	if adminKey != "" && r.Header.Get("X-Admin-Key") != adminKey {
		WriteUnauthorized(w, r, "admin authentication required")
		return
	}

	// Check if feature store exists
	if h.featureStore == nil {
		WriteServiceUnavailable(w, r, "feature store not configured", CodeFeatureStoreUnavailable)
		return
	}

	// Get the current file path
	filePath := h.featureStore.FilePath()
	if filePath == "" {
		// Try environment variable
		filePath = os.Getenv("FEATURE_PATH")
		if filePath == "" {
			filePath = "data/features/feature_matrix.parquet"
		}
	}

	log.Info().Str("path", filePath).Msg("Reloading feature store...")

	// Attempt reload
	if err := h.featureStore.Load(filePath); err != nil {
		log.Error().Err(err).Str("path", filePath).Msg("Feature reload failed")
		WriteInternalError(w, r, "reload failed: "+err.Error(), CodeReloadFailed)
		return
	}

	// Get updated metadata
	meta := h.featureStore.GetMetadata()

	log.Info().
		Int("rows", meta.RowCount).
		Str("version", meta.Version).
		Str("data_range", meta.DataDateMin+" to "+meta.DataDateMax).
		Msg("Feature store reloaded successfully")

	resp := ReloadResponse{
		Status:  "reloaded",
		Message: "Feature store reloaded successfully",
		Metadata: map[string]interface{}{
			"loaded_at":     meta.LoadedAt,
			"file_path":     meta.FilePath,
			"row_count":     meta.RowCount,
			"data_date_min": meta.DataDateMin,
			"data_date_max": meta.DataDateMax,
			"version":       meta.Version,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
