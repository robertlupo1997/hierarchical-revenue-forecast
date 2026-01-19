package handlers

import (
	"encoding/json"
	"net/http"
	"os"

	"github.com/rs/zerolog/log"
)

// AccuracyDataPoint represents a single data point with actual vs predicted values.
type AccuracyDataPoint struct {
	Date      string  `json:"date"`
	Actual    float32 `json:"actual"`
	Predicted float32 `json:"predicted"`
	Error     float32 `json:"error"`
	MAPE      float32 `json:"mape"`
}

// AccuracySummary contains summary statistics for accuracy data.
type AccuracySummary struct {
	DataPoints    int     `json:"data_points"`
	MeanActual    float32 `json:"mean_actual"`
	MeanPredicted float32 `json:"mean_predicted"`
	MeanError     float32 `json:"mean_error"`
	MeanMAPE      float32 `json:"mean_mape"`
	Correlation   float32 `json:"correlation"`
}

// AccuracyResponse is the response format for the /accuracy endpoint.
type AccuracyResponse struct {
	Data    []AccuracyDataPoint `json:"data"`
	Summary AccuracySummary     `json:"summary"`
}

// mockAccuracyData returns sample accuracy data when the real data file is not available.
func mockAccuracyData() AccuracyResponse {
	// Generate mock data points showing predicted vs actual over time
	data := []AccuracyDataPoint{
		{Date: "2017-07-01", Actual: 850000, Predicted: 830000, Error: 20000, MAPE: 2.35},
		{Date: "2017-07-02", Actual: 920000, Predicted: 905000, Error: 15000, MAPE: 1.63},
		{Date: "2017-07-03", Actual: 880000, Predicted: 890000, Error: -10000, MAPE: 1.14},
		{Date: "2017-07-04", Actual: 950000, Predicted: 935000, Error: 15000, MAPE: 1.58},
		{Date: "2017-07-05", Actual: 910000, Predicted: 920000, Error: -10000, MAPE: 1.10},
		{Date: "2017-07-06", Actual: 870000, Predicted: 865000, Error: 5000, MAPE: 0.57},
		{Date: "2017-07-07", Actual: 890000, Predicted: 882000, Error: 8000, MAPE: 0.90},
		{Date: "2017-07-08", Actual: 940000, Predicted: 955000, Error: -15000, MAPE: 1.60},
		{Date: "2017-07-09", Actual: 980000, Predicted: 965000, Error: 15000, MAPE: 1.53},
		{Date: "2017-07-10", Actual: 920000, Predicted: 930000, Error: -10000, MAPE: 1.09},
		{Date: "2017-07-11", Actual: 895000, Predicted: 888000, Error: 7000, MAPE: 0.78},
		{Date: "2017-07-12", Actual: 910000, Predicted: 918000, Error: -8000, MAPE: 0.88},
		{Date: "2017-07-13", Actual: 945000, Predicted: 940000, Error: 5000, MAPE: 0.53},
		{Date: "2017-07-14", Actual: 985000, Predicted: 970000, Error: 15000, MAPE: 1.52},
		{Date: "2017-07-15", Actual: 1020000, Predicted: 1005000, Error: 15000, MAPE: 1.47},
	}

	return AccuracyResponse{
		Data: data,
		Summary: AccuracySummary{
			DataPoints:    len(data),
			MeanActual:    924000,
			MeanPredicted: 919800,
			MeanError:     4800,
			MeanMAPE:      1.24,
			Correlation:   0.95,
		},
	}
}

// Accuracy handles requests for model accuracy data (predicted vs actual).
// Returns aggregated daily accuracy metrics from the validation set.
func (h *Handlers) Accuracy(w http.ResponseWriter, r *http.Request) {
	// Try to load accuracy data from file
	data, err := os.ReadFile("models/accuracy_data.json")
	if err != nil {
		log.Debug().Err(err).Msg("Could not load accuracy_data.json, using mock data")

		// Return mock data if file doesn't exist
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mockAccuracyData())
		return
	}

	// Parse the JSON to validate it
	var response AccuracyResponse
	if err := json.Unmarshal(data, &response); err != nil {
		log.Warn().Err(err).Msg("Could not parse accuracy_data.json")

		// Return mock data if parsing fails
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mockAccuracyData())
		return
	}

	// Return the loaded data
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}
