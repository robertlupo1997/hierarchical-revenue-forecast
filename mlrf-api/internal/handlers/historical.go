package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"sort"
	"time"

	"github.com/rs/zerolog/log"
)

// HistoricalRequest for fetching historical sales data.
type HistoricalRequest struct {
	StoreNbr int    `json:"store_nbr"`
	Family   string `json:"family"`
	EndDate  string `json:"end_date"`
	Days     int    `json:"days"` // Number of days of history
}

// HistoricalPoint represents a single historical data point.
type HistoricalPoint struct {
	Date   string  `json:"date"`
	Actual float64 `json:"actual"`
}

// HistoricalResponse contains historical sales data.
type HistoricalResponse struct {
	Data   []HistoricalPoint `json:"data"`
	IsMock bool              `json:"is_mock,omitempty"`
}

// historicalData stores pre-loaded historical sales data.
// Key format: "storeNbr_family_date" -> sales value
var historicalData map[string]float64

// Historical returns historical sales data for a store/family combination.
func (h *Handlers) Historical(w http.ResponseWriter, r *http.Request) {
	var req HistoricalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteBadRequest(w, r, "invalid request body", CodeInvalidRequest)
		return
	}

	// Validate request
	if req.StoreNbr <= 0 || req.StoreNbr > 54 {
		WriteBadRequest(w, r, "store_nbr must be between 1 and 54", CodeInvalidStore)
		return
	}
	if req.Family == "" {
		WriteBadRequest(w, r, "family is required", CodeInvalidFamily)
		return
	}
	if req.Days <= 0 {
		req.Days = 28 // Default to 4 weeks of history
	}
	if req.Days > 365 {
		req.Days = 365 // Cap at 1 year
	}

	endDate, err := time.Parse("2006-01-02", req.EndDate)
	if err != nil {
		WriteBadRequest(w, r, "end_date must be in YYYY-MM-DD format", CodeInvalidDate)
		return
	}

	// Try to get real historical data
	points, isMock := h.getHistoricalData(req.StoreNbr, req.Family, endDate, req.Days)

	if isMock {
		log.Warn().
			Int("store_nbr", req.StoreNbr).
			Str("family", req.Family).
			Msg("Returning mock historical data")
	}

	resp := HistoricalResponse{
		Data:   points,
		IsMock: isMock,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// getHistoricalData retrieves historical data from loaded data or generates mock.
func (h *Handlers) getHistoricalData(storeNbr int, family string, endDate time.Time, days int) ([]HistoricalPoint, bool) {
	points := make([]HistoricalPoint, 0, days)

	// Try to load from pre-computed historical data file
	historicalFile := os.Getenv("HISTORICAL_DATA_PATH")
	if historicalFile == "" {
		historicalFile = "models/historical_data.json"
	}

	// Load historical data if not already loaded
	if historicalData == nil {
		data, err := os.ReadFile(historicalFile)
		if err == nil {
			var loaded map[string]float64
			if json.Unmarshal(data, &loaded) == nil {
				historicalData = loaded
				log.Info().Int("entries", len(historicalData)).Msg("Loaded historical data")
			}
		}
	}

	// Try to get data from feature store (using lag features as proxy for historical sales)
	if h.featureStore != nil {
		for i := days; i > 0; i -= 7 { // Weekly intervals
			date := endDate.AddDate(0, 0, -i)
			dateStr := date.Format("2006-01-02")

			// Try pre-loaded historical data first
			if historicalData != nil {
				key := formatHistoricalKey(storeNbr, family, dateStr)
				if val, ok := historicalData[key]; ok {
					points = append(points, HistoricalPoint{
						Date:   dateStr,
						Actual: val,
					})
					continue
				}
			}

			// Fall back to feature store - use sales_lag_7 as proxy
			features, found := h.featureStore.GetFeatures(storeNbr, family, dateStr)
			if found && len(features) > 13 {
				// Index 13 is sales_lag_7 in the feature vector
				salesLag7 := float64(features[13])
				if salesLag7 > 0 {
					points = append(points, HistoricalPoint{
						Date:   dateStr,
						Actual: salesLag7,
					})
				}
			}
		}
	}

	// If we got some real data, return it
	if len(points) > 0 {
		// Sort by date
		sort.Slice(points, func(i, j int) bool {
			return points[i].Date < points[j].Date
		})
		return points, false
	}

	// Generate mock data as fallback
	return generateMockHistorical(endDate, days), true
}

// formatHistoricalKey creates a lookup key for historical data.
func formatHistoricalKey(storeNbr int, family, date string) string {
	return string(rune(storeNbr)) + "_" + family + "_" + date
}

// generateMockHistorical creates mock historical data for demo purposes.
func generateMockHistorical(endDate time.Time, days int) []HistoricalPoint {
	points := make([]HistoricalPoint, 0)
	baseValue := 45000.0

	for i := days; i > 0; i -= 7 {
		date := endDate.AddDate(0, 0, -i)
		// Add some variation to make it look realistic
		variation := 1.0 + (float64(i%14)-7.0)*0.02
		points = append(points, HistoricalPoint{
			Date:   date.Format("2006-01-02"),
			Actual: baseValue * variation,
		})
	}

	return points
}
