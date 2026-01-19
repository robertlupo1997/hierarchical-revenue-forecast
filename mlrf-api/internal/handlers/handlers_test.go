package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
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

// ============================================================================
// Failure Scenario Tests
// ============================================================================

// MockInferencer is a mock implementation of inference.Inferencer for testing.
// Thread-safe for concurrent tests.
type MockInferencer struct {
	prediction float32
	err        error
	callCount  int32 // atomic counter
	mu         sync.Mutex
}

func (m *MockInferencer) Predict(features []float32) (float32, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.callCount++
	if m.err != nil {
		return 0, m.err
	}
	return m.prediction, nil
}

func (m *MockInferencer) PredictBatch(featureBatch [][]float32) ([]float32, error) {
	results := make([]float32, len(featureBatch))
	for i := range featureBatch {
		pred, err := m.Predict(featureBatch[i])
		if err != nil {
			return nil, err
		}
		results[i] = pred
	}
	return results, nil
}

func (m *MockInferencer) CallCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return int(m.callCount)
}

// TestPredictWithoutONNX verifies the API returns a proper error when ONNX model is unavailable.
// This tests graceful degradation - the API should return 503 Service Unavailable, not crash.
func TestPredictWithoutONNX(t *testing.T) {
	h := NewHandlers(nil, nil, nil) // No ONNX model

	testCases := []struct {
		name     string
		endpoint string
		body     string
	}{
		{
			name:     "/predict without ONNX",
			endpoint: "/predict",
			body:     `{"store_nbr":1,"family":"GROCERY I","date":"2017-08-01","features":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}`,
		},
		{
			name:     "/predict/simple without ONNX",
			endpoint: "/predict/simple",
			body:     `{"store_nbr":1,"family":"GROCERY I","date":"2017-08-01","horizon":30}`,
		},
		{
			name:     "/predict/batch without ONNX",
			endpoint: "/predict/batch",
			body:     `{"predictions":[{"store_nbr":1,"family":"GROCERY I","date":"2017-08-01","features":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}]}`,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, tc.endpoint, bytes.NewReader([]byte(tc.body)))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			// Route to correct handler
			switch tc.endpoint {
			case "/predict":
				h.Predict(w, req)
			case "/predict/simple":
				h.PredictSimple(w, req)
			case "/predict/batch":
				h.PredictBatch(w, req)
			}

			// Should return 503 Service Unavailable, not crash
			if w.Code != http.StatusServiceUnavailable {
				t.Errorf("expected status 503, got %d", w.Code)
			}

			// Verify error response structure
			var errResp ErrorResponse
			if err := json.Unmarshal(w.Body.Bytes(), &errResp); err != nil {
				t.Fatalf("failed to parse error response: %v", err)
			}

			if errResp.Code != CodeModelUnavailable {
				t.Errorf("expected error code %s, got %s", CodeModelUnavailable, errResp.Code)
			}

			if errResp.Error == "" {
				t.Error("expected non-empty error message")
			}
		})
	}
}

// TestPredictWithoutRedis verifies the API works correctly when Redis cache is unavailable.
// Predictions should succeed without caching.
func TestPredictWithoutRedis(t *testing.T) {
	mockOnnx := &MockInferencer{prediction: 1234.56}
	h := NewHandlers(mockOnnx, nil, nil) // No Redis cache

	t.Run("/predict works without Redis", func(t *testing.T) {
		body := `{"store_nbr":1,"family":"GROCERY I","date":"2017-08-01","features":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}`
		req := httptest.NewRequest(http.MethodPost, "/predict", bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		h.Predict(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp PredictResponse
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to parse response: %v", err)
		}

		if resp.Prediction != 1234.56 {
			t.Errorf("expected prediction 1234.56, got %v", resp.Prediction)
		}

		if resp.Cached {
			t.Error("expected Cached=false when Redis unavailable")
		}
	})

	t.Run("/predict/simple works without Redis", func(t *testing.T) {
		body := `{"store_nbr":1,"family":"GROCERY I","date":"2017-08-01","horizon":30}`
		req := httptest.NewRequest(http.MethodPost, "/predict/simple", bytes.NewReader([]byte(body)))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		h.PredictSimple(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp PredictResponse
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to parse response: %v", err)
		}

		if resp.Prediction != 1234.56 {
			t.Errorf("expected prediction 1234.56, got %v", resp.Prediction)
		}

		if resp.Cached {
			t.Error("expected Cached=false when Redis unavailable")
		}
	})
}

// TestBatchPredictWithoutRedis verifies batch predictions work when Redis is unavailable.
func TestBatchPredictWithoutRedis(t *testing.T) {
	mockOnnx := &MockInferencer{prediction: 999.99}
	h := NewHandlers(mockOnnx, nil, nil) // No Redis cache

	body := `{"predictions":[
		{"store_nbr":1,"family":"GROCERY I","date":"2017-08-01","features":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
		{"store_nbr":2,"family":"BEVERAGES","date":"2017-08-01","features":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},
		{"store_nbr":3,"family":"PRODUCE","date":"2017-08-01","features":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}
	]}`
	req := httptest.NewRequest(http.MethodPost, "/predict/batch", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.PredictBatch(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp BatchPredictResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if len(resp.Predictions) != 3 {
		t.Errorf("expected 3 predictions, got %d", len(resp.Predictions))
	}

	for i, pred := range resp.Predictions {
		if pred.Prediction != 999.99 {
			t.Errorf("prediction[%d]: expected 999.99, got %v", i, pred.Prediction)
		}
		if pred.Cached {
			t.Errorf("prediction[%d]: expected Cached=false when Redis unavailable", i)
		}
	}
}

// TestPredictWithoutFeatureStore verifies the API uses zero features when feature store is unavailable.
// This tests the /predict/simple endpoint which relies on the feature store.
func TestPredictWithoutFeatureStore(t *testing.T) {
	mockOnnx := &MockInferencer{prediction: 555.55}
	h := NewHandlers(mockOnnx, nil, nil) // No feature store

	body := `{"store_nbr":1,"family":"GROCERY I","date":"2017-08-01","horizon":60}`
	req := httptest.NewRequest(http.MethodPost, "/predict/simple", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.PredictSimple(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp PredictResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	// Prediction should succeed using zero features
	if resp.Prediction != 555.55 {
		t.Errorf("expected prediction 555.55, got %v", resp.Prediction)
	}

	// Verify model was called (meaning zero features were used as fallback)
	if mockOnnx.CallCount() != 1 {
		t.Errorf("expected model to be called once, got %d calls", mockOnnx.CallCount())
	}
}

// TestPredictSimpleWithAllDependencies verifies the happy path with all dependencies available.
func TestPredictSimpleWithAllDependencies(t *testing.T) {
	mockOnnx := &MockInferencer{prediction: 2000.0}
	// Note: We don't have a mock cache or feature store, so we test without them
	h := NewHandlers(mockOnnx, nil, nil)

	body := `{"store_nbr":1,"family":"GROCERY I","date":"2017-08-01","horizon":90}`
	req := httptest.NewRequest(http.MethodPost, "/predict/simple", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.PredictSimple(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp PredictResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	// Verify response structure
	if resp.StoreNbr != 1 {
		t.Errorf("expected store_nbr 1, got %d", resp.StoreNbr)
	}
	if resp.Family != "GROCERY I" {
		t.Errorf("expected family 'GROCERY I', got '%s'", resp.Family)
	}
	if resp.Date != "2017-08-01" {
		t.Errorf("expected date '2017-08-01', got '%s'", resp.Date)
	}
	if resp.Prediction != 2000.0 {
		t.Errorf("expected prediction 2000.0, got %v", resp.Prediction)
	}
	if resp.LatencyMs <= 0 {
		t.Error("expected positive latency")
	}
}

// TestInferenceFailure verifies proper error handling when inference fails.
func TestInferenceFailure(t *testing.T) {
	mockOnnx := &MockInferencer{err: fmt.Errorf("simulated inference failure")}
	h := NewHandlers(mockOnnx, nil, nil)

	body := `{"store_nbr":1,"family":"GROCERY I","date":"2017-08-01","horizon":30}`
	req := httptest.NewRequest(http.MethodPost, "/predict/simple", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.PredictSimple(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected status 500, got %d", w.Code)
	}

	var errResp ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &errResp); err != nil {
		t.Fatalf("failed to parse error response: %v", err)
	}

	if errResp.Code != CodeInferenceFailed {
		t.Errorf("expected error code %s, got %s", CodeInferenceFailed, errResp.Code)
	}
}

// TestBatchInferenceFailure verifies proper error handling when batch inference fails.
func TestBatchInferenceFailure(t *testing.T) {
	mockOnnx := &MockInferencer{err: fmt.Errorf("batch inference failure")}
	h := NewHandlers(mockOnnx, nil, nil)

	body := `{"predictions":[
		{"store_nbr":1,"family":"GROCERY I","date":"2017-08-01","features":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}
	]}`
	req := httptest.NewRequest(http.MethodPost, "/predict/batch", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.PredictBatch(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected status 500, got %d", w.Code)
	}

	var errResp ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &errResp); err != nil {
		t.Fatalf("failed to parse error response: %v", err)
	}

	if errResp.Code != CodeInferenceFailed {
		t.Errorf("expected error code %s, got %s", CodeInferenceFailed, errResp.Code)
	}
}

// TestConcurrentPredictions verifies the API handles concurrent requests safely.
func TestConcurrentPredictions(t *testing.T) {
	mockOnnx := &MockInferencer{prediction: 42.0}
	h := NewHandlers(mockOnnx, nil, nil)

	numRequests := 50
	done := make(chan bool, numRequests)

	for i := 0; i < numRequests; i++ {
		go func(reqNum int) {
			body := fmt.Sprintf(`{"store_nbr":%d,"family":"GROCERY I","date":"2017-08-01","horizon":30}`, reqNum%54+1)
			req := httptest.NewRequest(http.MethodPost, "/predict/simple", bytes.NewReader([]byte(body)))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			h.PredictSimple(w, req)

			if w.Code != http.StatusOK {
				t.Errorf("request %d: expected status 200, got %d", reqNum, w.Code)
			}
			done <- true
		}(i)
	}

	// Wait for all requests to complete
	for i := 0; i < numRequests; i++ {
		<-done
	}

	// Verify all requests were processed (using thread-safe method)
	if mockOnnx.CallCount() != numRequests {
		t.Errorf("expected %d model calls, got %d", numRequests, mockOnnx.CallCount())
	}
}
