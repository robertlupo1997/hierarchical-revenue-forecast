package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/rs/zerolog/log"
)

// WhatIfRequest represents a request to explore parameter sensitivity.
// It takes a base prediction context and adjustments to apply.
type WhatIfRequest struct {
	StoreNbr    int                `json:"store_nbr"`
	Family      string             `json:"family"`
	Date        string             `json:"date"`
	Horizon     int                `json:"horizon"`
	Adjustments map[string]float32 `json:"adjustments"` // Feature adjustments (e.g., "oil_price": 1.2)
}

// WhatIfResponse contains the baseline and adjusted predictions with delta.
type WhatIfResponse struct {
	Original  float32            `json:"original"`
	Adjusted  float32            `json:"adjusted"`
	Delta     float32            `json:"delta"`
	DeltaPct  float32            `json:"delta_pct"`
	LatencyMs float64            `json:"latency_ms"`
	Applied   map[string]float32 `json:"applied"` // Adjustments that were applied
}

// Feature indices for what-if adjustments.
// These correspond to positions in the 27-feature vector.
var whatIfFeatureIndex = map[string]int{
	"oil_price":       0,  // dcoilwtico
	"onpromotion":     1,  // Binary promotion flag
	"day_of_week":     2,  // Day of week (0-6)
	"day_of_month":    3,  // Day of month (1-31)
	"month":           4,  // Month (1-12)
	"year":            5,  // Year
	"is_payday":       6,  // Is payday (binary)
	"is_weekend":      7,  // Is weekend (binary)
	"transactions":    8,  // Number of transactions
	"sales_lag_7":     9,  // Sales lag 7 days
	"sales_lag_14":    10, // Sales lag 14 days
	"sales_lag_28":    11, // Sales lag 28 days
	"sales_lag_90":    12, // Sales lag 90 days
	"rolling_mean_7":       13, // 7-day rolling mean
	"rolling_mean_28":      14, // 28-day rolling mean
	"rolling_std_7":        15, // 7-day rolling std
	"rolling_std_28":       16, // 28-day rolling std
	"day_of_year":          17, // Day of year (1-366)
	"is_mid_month":         18, // Is mid-month (binary)
	"is_leap_year":         19, // Is leap year (binary)
	"sales_rolling_mean_14": 20, // 14-day rolling mean
	"sales_rolling_mean_90": 21, // 90-day rolling mean
	"sales_rolling_std_14":  22, // 14-day rolling std
	"sales_rolling_std_90":  23, // 90-day rolling std
	"cluster":              24, // Store cluster
	"family_encoded":       25, // Encoded product family
	"type_encoded":         26, // Encoded store type
}

// WhatIf handles what-if analysis requests.
// It computes baseline and adjusted predictions to show feature sensitivity.
func (h *Handlers) WhatIf(w http.ResponseWriter, r *http.Request) {
	start := time.Now()

	var req WhatIfRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteBadRequest(w, r, "invalid request body", CodeInvalidRequest)
		return
	}

	// Validate request
	if err := ValidateStoreNbr(req.StoreNbr); err != nil {
		WriteBadRequest(w, r, err.Message, err.Code)
		return
	}
	if err := ValidateFamily(req.Family); err != nil {
		WriteBadRequest(w, r, err.Message, err.Code)
		return
	}
	if err := ValidateDate(req.Date); err != nil {
		WriteBadRequest(w, r, err.Message, err.Code)
		return
	}
	if err := ValidateHorizon(req.Horizon); err != nil {
		WriteBadRequest(w, r, err.Message, err.Code)
		return
	}

	// Check ONNX availability
	if h.onnx == nil {
		WriteServiceUnavailable(w, r, "model not loaded", CodeModelUnavailable)
		return
	}

	// Get baseline features
	var baseFeatures []float32
	if h.featureStore != nil && h.featureStore.IsLoaded() {
		baseFeatures, _ = h.featureStore.GetFeatures(req.StoreNbr, req.Family, req.Date)
	} else {
		baseFeatures = make([]float32, 27)
		log.Debug().Msg("Feature store unavailable for what-if, using zero features")
	}

	// Compute baseline prediction
	basePrediction, err := h.onnx.Predict(baseFeatures)
	if err != nil {
		log.Error().Err(err).Msg("baseline inference failed")
		WriteInternalError(w, r, "inference failed", CodeInferenceFailed)
		return
	}

	// Apply adjustments to create modified features
	adjustedFeatures := make([]float32, len(baseFeatures))
	copy(adjustedFeatures, baseFeatures)
	appliedAdjustments := make(map[string]float32)

	for name, adjustment := range req.Adjustments {
		idx, exists := whatIfFeatureIndex[name]
		if !exists {
			// Skip unknown features, but don't error
			log.Debug().Str("feature", name).Msg("Skipping unknown what-if feature")
			continue
		}
		if idx < len(adjustedFeatures) {
			// For multipliers (like oil_price), multiply the value
			// For binary flags (like onpromotion), set directly
			switch name {
			case "onpromotion", "is_payday", "is_weekend":
				// Binary: set to 0 or 1
				if adjustment > 0.5 {
					adjustedFeatures[idx] = 1.0
				} else {
					adjustedFeatures[idx] = 0.0
				}
			case "day_of_week":
				// Bounded: 0-6
				if adjustment < 0 {
					adjustedFeatures[idx] = 0
				} else if adjustment > 6 {
					adjustedFeatures[idx] = 6
				} else {
					adjustedFeatures[idx] = adjustment
				}
			case "month":
				// Bounded: 1-12
				if adjustment < 1 {
					adjustedFeatures[idx] = 1
				} else if adjustment > 12 {
					adjustedFeatures[idx] = 12
				} else {
					adjustedFeatures[idx] = adjustment
				}
			default:
				// For continuous features like oil_price, apply as multiplier
				// adjustment of 1.0 = no change, 1.2 = 20% increase
				adjustedFeatures[idx] = baseFeatures[idx] * adjustment
			}
			appliedAdjustments[name] = adjustment
		}
	}

	// Compute adjusted prediction
	adjustedPrediction, err := h.onnx.Predict(adjustedFeatures)
	if err != nil {
		log.Error().Err(err).Msg("adjusted inference failed")
		WriteInternalError(w, r, "inference failed", CodeInferenceFailed)
		return
	}

	// Calculate delta
	delta := adjustedPrediction - basePrediction
	var deltaPct float32
	if basePrediction != 0 {
		deltaPct = (delta / basePrediction) * 100
	}

	resp := WhatIfResponse{
		Original:  basePrediction,
		Adjusted:  adjustedPrediction,
		Delta:     delta,
		DeltaPct:  deltaPct,
		LatencyMs: float64(time.Since(start).Microseconds()) / 1000,
		Applied:   appliedAdjustments,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
