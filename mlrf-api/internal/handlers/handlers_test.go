package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealth(t *testing.T) {
	h := NewHandlers(nil, nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	h.Health(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp HealthResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp.Status != "healthy" {
		t.Errorf("expected status 'healthy', got '%s'", resp.Status)
	}
}

func TestPredictInvalidRequest(t *testing.T) {
	h := NewHandlers(nil, nil, nil)

	// Test with empty body
	req := httptest.NewRequest(http.MethodPost, "/predict", bytes.NewReader([]byte("{}")))
	w := httptest.NewRecorder()

	h.Predict(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}
}

func TestPredictMissingFields(t *testing.T) {
	h := NewHandlers(nil, nil, nil)

	testCases := []struct {
		name    string
		payload string
	}{
		{"missing store_nbr", `{"family":"GROCERY I","date":"2017-08-01","features":[0.0]}`},
		{"missing family", `{"store_nbr":1,"date":"2017-08-01","features":[0.0]}`},
		{"missing date", `{"store_nbr":1,"family":"GROCERY I","features":[0.0]}`},
		{"missing features", `{"store_nbr":1,"family":"GROCERY I","date":"2017-08-01"}`},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/predict", bytes.NewReader([]byte(tc.payload)))
			w := httptest.NewRecorder()

			h.Predict(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("expected status 400, got %d", w.Code)
			}
		})
	}
}

func TestExplainWithMockData(t *testing.T) {
	h := NewHandlers(nil, nil, nil)

	payload := `{"store_nbr":1,"family":"GROCERY I","date":"2017-08-01"}`
	req := httptest.NewRequest(http.MethodPost, "/explain", bytes.NewReader([]byte(payload)))
	w := httptest.NewRecorder()

	h.Explain(w, req)

	// Should return mock data when SHAP file not found
	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp ExplainResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp.BaseValue == 0 {
		t.Error("expected non-zero base value")
	}

	if len(resp.Features) == 0 {
		t.Error("expected features in response")
	}
}

func TestHierarchyMockData(t *testing.T) {
	h := NewHandlers(nil, nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/hierarchy?date=2017-08-01", nil)
	w := httptest.NewRecorder()

	h.Hierarchy(w, req)

	// Should return mock data when hierarchy file not found
	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var resp HierarchyNode
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp.Level != "total" {
		t.Errorf("expected level 'total', got '%s'", resp.Level)
	}

	if len(resp.Children) == 0 {
		t.Error("expected children in hierarchy")
	}
}

func TestMetrics(t *testing.T) {
	h := NewHandlers(nil, nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	w := httptest.NewRecorder()

	h.Metrics(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

// PredictSimple Integration Tests

func TestPredictSimple_ValidRequest(t *testing.T) {
	// Create a handler without ONNX model - should return service unavailable
	// This tests the validation logic before model inference
	h := NewHandlers(nil, nil, nil)

	body := `{"store_nbr": 1, "family": "GROCERY I", "date": "2017-08-01", "horizon": 30}`
	req := httptest.NewRequest(http.MethodPost, "/predict/simple", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.PredictSimple(w, req)

	// Without a model, we expect ServiceUnavailable (503)
	// This confirms the request passed validation and reached the inference step
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected status 503 (model not loaded), got %d", w.Code)
	}
}

func TestPredictSimple_InvalidHorizon(t *testing.T) {
	h := NewHandlers(nil, nil, nil)

	testCases := []struct {
		name    string
		horizon int
	}{
		{"horizon 0", 0},
		{"horizon 45", 45},
		{"horizon 7", 7},
		{"horizon 100", 100},
		{"horizon -15", -15},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Use proper JSON encoding for horizon
			bodyBytes, _ := json.Marshal(map[string]interface{}{
				"store_nbr": 1,
				"family":    "GROCERY I",
				"date":      "2017-08-01",
				"horizon":   tc.horizon,
			})
			req := httptest.NewRequest(http.MethodPost, "/predict/simple", bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			h.PredictSimple(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("expected status 400 for horizon %d, got %d", tc.horizon, w.Code)
			}

			if !bytes.Contains(w.Body.Bytes(), []byte("horizon must be 15, 30, 60, or 90")) {
				t.Errorf("expected error message about invalid horizon, got %s", w.Body.String())
			}
		})
	}
}

func TestPredictSimple_ValidHorizons(t *testing.T) {
	h := NewHandlers(nil, nil, nil)

	validHorizons := []int{15, 30, 60, 90}

	for _, horizon := range validHorizons {
		t.Run(fmt.Sprintf("horizon_%d", horizon), func(t *testing.T) {
			bodyBytes, _ := json.Marshal(map[string]interface{}{
				"store_nbr": 1,
				"family":    "GROCERY I",
				"date":      "2017-08-01",
				"horizon":   horizon,
			})
			req := httptest.NewRequest(http.MethodPost, "/predict/simple", bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			h.PredictSimple(w, req)

			// Should NOT return 400 - means validation passed
			// Will return 503 because no model is loaded, which is expected
			if w.Code == http.StatusBadRequest {
				t.Errorf("horizon %d should be valid, but got 400: %s", horizon, w.Body.String())
			}
		})
	}
}

func TestPredictSimple_MissingFields(t *testing.T) {
	h := NewHandlers(nil, nil, nil)

	testCases := []struct {
		name          string
		payload       string
		expectedError string
	}{
		{
			name:          "missing store_nbr",
			payload:       `{"family":"GROCERY I","date":"2017-08-01","horizon":30}`,
			expectedError: "store_nbr must be positive",
		},
		{
			name:          "zero store_nbr",
			payload:       `{"store_nbr":0,"family":"GROCERY I","date":"2017-08-01","horizon":30}`,
			expectedError: "store_nbr must be positive",
		},
		{
			name:          "negative store_nbr",
			payload:       `{"store_nbr":-1,"family":"GROCERY I","date":"2017-08-01","horizon":30}`,
			expectedError: "store_nbr must be positive",
		},
		{
			name:          "missing family",
			payload:       `{"store_nbr":1,"date":"2017-08-01","horizon":30}`,
			expectedError: "family is required",
		},
		{
			name:          "empty family",
			payload:       `{"store_nbr":1,"family":"","date":"2017-08-01","horizon":30}`,
			expectedError: "family is required",
		},
		{
			name:          "missing date",
			payload:       `{"store_nbr":1,"family":"GROCERY I","horizon":30}`,
			expectedError: "date is required",
		},
		{
			name:          "empty date",
			payload:       `{"store_nbr":1,"family":"GROCERY I","date":"","horizon":30}`,
			expectedError: "date is required",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/predict/simple", bytes.NewReader([]byte(tc.payload)))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			h.PredictSimple(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("expected status 400, got %d", w.Code)
			}

			if !bytes.Contains(w.Body.Bytes(), []byte(tc.expectedError)) {
				t.Errorf("expected error containing '%s', got %s", tc.expectedError, w.Body.String())
			}
		})
	}
}

func TestPredictSimple_InvalidJSON(t *testing.T) {
	h := NewHandlers(nil, nil, nil)

	testCases := []struct {
		name    string
		payload string
	}{
		{"empty body", ""},
		{"invalid json", "{invalid}"},
		{"missing closing brace", `{"store_nbr": 1`},
		{"array instead of object", `[1, 2, 3]`},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/predict/simple", bytes.NewReader([]byte(tc.payload)))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			h.PredictSimple(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("expected status 400, got %d", w.Code)
			}

			if !bytes.Contains(w.Body.Bytes(), []byte("invalid request body")) {
				t.Errorf("expected 'invalid request body' error, got %s", w.Body.String())
			}
		})
	}
}

func TestPredictSimple_ResponseStructure(t *testing.T) {
	// This test validates that when we have a valid response,
	// all expected fields are present in the JSON structure.
	// Since we don't have a real model, we can only test the request validation path.

	h := NewHandlers(nil, nil, nil)

	body := `{"store_nbr": 1, "family": "GROCERY I", "date": "2017-08-01", "horizon": 30}`
	req := httptest.NewRequest(http.MethodPost, "/predict/simple", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.PredictSimple(w, req)

	// Without model, returns 503, but the request structure is valid
	// A full integration test with a mock model would verify the response structure
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503 without model, got %d", w.Code)
	}
}
