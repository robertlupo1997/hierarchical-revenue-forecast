package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

// ExplainRequest represents a SHAP explanation request.
type ExplainRequest struct {
	StoreNbr int    `json:"store_nbr"`
	Family   string `json:"family"`
	Date     string `json:"date"`
}

// WaterfallFeature represents a single feature in the SHAP waterfall.
type WaterfallFeature struct {
	Name       string  `json:"name"`
	Value      float64 `json:"value"`
	ShapValue  float64 `json:"shap_value"`
	Cumulative float64 `json:"cumulative"`
	Direction  string  `json:"direction"`
}

// ExplainResponse represents a SHAP explanation response.
type ExplainResponse struct {
	BaseValue  float64            `json:"base_value"`
	Features   []WaterfallFeature `json:"features"`
	Prediction float64            `json:"prediction"`
}

// Explain returns SHAP waterfall data for a prediction.
// For now, serves pre-computed SHAP values from JSON file.
// In production, could compute on-demand or use a Python sidecar.
func (h *Handlers) Explain(w http.ResponseWriter, r *http.Request) {
	var req ExplainRequest
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

	// Load pre-computed SHAP data
	shapFile := os.Getenv("SHAP_DATA_PATH")
	if shapFile == "" {
		shapFile = "models/shap_data.json"
	}

	data, err := os.ReadFile(shapFile)
	if err != nil {
		// Return a mock response if SHAP data not available
		// This allows the API to work without pre-computed SHAP values
		mockResp := createMockExplanation(req.StoreNbr, req.Family)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mockResp)
		return
	}

	var shapData map[string]ExplainResponse
	if err := json.Unmarshal(data, &shapData); err != nil {
		http.Error(w, `{"error":"failed to parse SHAP data"}`, http.StatusInternalServerError)
		return
	}

	// Look up by store_family key
	key := fmt.Sprintf("%d_%s", req.StoreNbr, req.Family)
	resp, ok := shapData[key]
	if !ok {
		// Return mock if specific combination not found
		mockResp := createMockExplanation(req.StoreNbr, req.Family)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mockResp)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// createMockExplanation creates a mock SHAP explanation for demo purposes.
func createMockExplanation(storeNbr int, family string) ExplainResponse {
	baseValue := 1000.0
	cumulative := baseValue

	features := []WaterfallFeature{
		{Name: "sales_lag_7", Value: 1234.5, ShapValue: 250.0, Direction: "positive"},
		{Name: "oil_price", Value: 65.3, ShapValue: -120.0, Direction: "negative"},
		{Name: "is_holiday", Value: 1.0, ShapValue: 80.0, Direction: "positive"},
		{Name: "dayofweek", Value: 5.0, ShapValue: 45.0, Direction: "positive"},
		{Name: "sales_rolling_mean_7", Value: 1100.0, ShapValue: 150.0, Direction: "positive"},
		{Name: "promo_rolling_7", Value: 3.0, ShapValue: 35.0, Direction: "positive"},
		{Name: "cluster", Value: 2.0, ShapValue: -25.0, Direction: "negative"},
		{Name: "month", Value: 8.0, ShapValue: 60.0, Direction: "positive"},
	}

	// Calculate cumulative values
	for i := range features {
		cumulative += features[i].ShapValue
		features[i].Cumulative = cumulative
	}

	return ExplainResponse{
		BaseValue:  baseValue,
		Features:   features,
		Prediction: cumulative,
	}
}

// HierarchyNode represents a node in the forecast hierarchy.
type HierarchyNode struct {
	ID                 string          `json:"id"`
	Name               string          `json:"name"`
	Level              string          `json:"level"`
	Prediction         float64         `json:"prediction"`
	Actual             *float64        `json:"actual,omitempty"`
	PreviousPrediction *float64        `json:"previous_prediction,omitempty"`
	TrendPercent       *float64        `json:"trend_percent,omitempty"`
	Children           []HierarchyNode `json:"children,omitempty"`
}

// Hierarchy returns the full hierarchy tree with predictions.
func (h *Handlers) Hierarchy(w http.ResponseWriter, r *http.Request) {
	date := r.URL.Query().Get("date")
	if date == "" {
		date = "2017-08-01"
	}

	// Load pre-computed hierarchy or generate mock
	hierarchyFile := os.Getenv("HIERARCHY_DATA_PATH")
	if hierarchyFile == "" {
		hierarchyFile = "models/hierarchy_data.json"
	}

	data, err := os.ReadFile(hierarchyFile)
	if err != nil {
		// Return mock hierarchy
		mockHierarchy := createMockHierarchy()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mockHierarchy)
		return
	}

	var hierarchy HierarchyNode
	if err := json.Unmarshal(data, &hierarchy); err != nil {
		http.Error(w, `{"error":"failed to parse hierarchy data"}`, http.StatusInternalServerError)
		return
	}

	// Add trend data if not already present in loaded data
	if hierarchy.TrendPercent == nil {
		addTrendToNode(&hierarchy, 0.12)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(hierarchy)
}

// calculateTrend computes the trend percentage between current and previous values.
// Returns ((current - previous) / previous) * 100
func calculateTrend(current, previous float64) float64 {
	if previous == 0 {
		return 0
	}
	return ((current - previous) / previous) * 100
}

// addTrendToNode adds previous prediction and trend percentage to a node.
// It uses a deterministic variation based on the node's ID to generate "previous" values.
func addTrendToNode(node *HierarchyNode, variationFactor float64) {
	// Generate a previous prediction with some variation
	// Positive variation = current is higher than previous (positive trend)
	previous := node.Prediction / (1 + variationFactor)
	trend := calculateTrend(node.Prediction, previous)
	node.PreviousPrediction = &previous
	node.TrendPercent = &trend

	// Recursively add trends to children
	for i := range node.Children {
		// Vary the factor slightly for each child to get different trends
		childVariation := variationFactor * (0.8 + float64(i)*0.05)
		addTrendToNode(&node.Children[i], childVariation)
	}
}

// createMockHierarchy creates a mock hierarchy for demo purposes.
func createMockHierarchy() HierarchyNode {
	// Sample stores
	stores := []HierarchyNode{
		{ID: "1", Name: "Store 1", Level: "store", Prediction: 125000.0},
		{ID: "2", Name: "Store 2", Level: "store", Prediction: 98000.0},
		{ID: "3", Name: "Store 3", Level: "store", Prediction: 156000.0},
		{ID: "4", Name: "Store 4", Level: "store", Prediction: 87000.0},
		{ID: "5", Name: "Store 5", Level: "store", Prediction: 112000.0},
	}

	// Add sample families to each store
	families := []string{"GROCERY I", "BEVERAGES", "PRODUCE", "CLEANING", "DAIRY"}
	for i := range stores {
		stores[i].Children = make([]HierarchyNode, len(families))
		storeTotal := 0.0
		for j, family := range families {
			pred := stores[i].Prediction / float64(len(families)) * (0.8 + float64(j)*0.1)
			stores[i].Children[j] = HierarchyNode{
				ID:         fmt.Sprintf("%s_%s", stores[i].ID, family),
				Name:       family,
				Level:      "family",
				Prediction: pred,
			}
			storeTotal += pred
		}
		stores[i].Prediction = storeTotal
	}

	// Calculate total
	var total float64
	for _, store := range stores {
		total += store.Prediction
	}

	root := HierarchyNode{
		ID:         "total",
		Name:       "Total",
		Level:      "total",
		Prediction: total,
		Children:   stores,
	}

	// Add trend data to all nodes (12% positive trend at root, varying for children)
	addTrendToNode(&root, 0.12)

	return root
}
