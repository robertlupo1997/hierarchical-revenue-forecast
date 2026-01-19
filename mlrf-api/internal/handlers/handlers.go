// Package handlers provides HTTP handlers for the MLRF API.
package handlers

import (
	"encoding/json"
	"os"

	"github.com/mlrf/mlrf-api/internal/cache"
	"github.com/mlrf/mlrf-api/internal/features"
	"github.com/mlrf/mlrf-api/internal/inference"
	"github.com/rs/zerolog/log"
)

// Handlers holds dependencies for HTTP handlers.
type Handlers struct {
	onnx         inference.Inferencer
	cache        *cache.RedisCache
	featureStore *features.Store
	intervals    *PredictionIntervals
}

// NewHandlers creates a new Handlers instance.
// Any dependency can be nil - handlers gracefully degrade when dependencies are unavailable.
// - onnx: ONNX inference engine (nil returns 503 Service Unavailable)
// - cache: Redis cache (nil = no caching, predictions still work)
// - featureStore: Feature lookup (nil = uses zero features)
func NewHandlers(onnx inference.Inferencer, c *cache.RedisCache, fs *features.Store) *Handlers {
	return &Handlers{
		onnx:         onnx,
		cache:        c,
		featureStore: fs,
		intervals:    nil,
	}
}

// LoadPredictionIntervals loads prediction intervals from a JSON file.
// This is optional - if the file doesn't exist, CI fields will be omitted from responses.
func (h *Handlers) LoadPredictionIntervals(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		log.Warn().Err(err).Str("path", path).Msg("Could not load prediction intervals, CIs will be omitted")
		return err
	}

	var intervals PredictionIntervals
	if err := json.Unmarshal(data, &intervals); err != nil {
		log.Warn().Err(err).Msg("Could not parse prediction intervals JSON")
		return err
	}

	h.intervals = &intervals
	log.Info().
		Float32("lower_80", intervals.Lower80Offset).
		Float32("upper_80", intervals.Upper80Offset).
		Float32("lower_95", intervals.Lower95Offset).
		Float32("upper_95", intervals.Upper95Offset).
		Msg("Loaded prediction intervals")
	return nil
}

// applyIntervals computes confidence intervals for a prediction.
// Returns lower_80, upper_80, lower_95, upper_95 values.
func (h *Handlers) applyIntervals(prediction float32) (float32, float32, float32, float32) {
	if h.intervals == nil {
		// Return zeros if intervals not loaded
		return 0, 0, 0, 0
	}

	// Apply offsets to prediction
	// Ensure lower bounds don't go negative for sales data
	lower80 := prediction + h.intervals.Lower80Offset
	upper80 := prediction + h.intervals.Upper80Offset
	lower95 := prediction + h.intervals.Lower95Offset
	upper95 := prediction + h.intervals.Upper95Offset

	// Floor at zero (sales can't be negative)
	if lower80 < 0 {
		lower80 = 0
	}
	if lower95 < 0 {
		lower95 = 0
	}

	return lower80, upper80, lower95, upper95
}
