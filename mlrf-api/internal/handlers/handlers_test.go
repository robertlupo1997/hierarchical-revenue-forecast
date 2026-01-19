package handlers

import (
	"bytes"
	"encoding/json"
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
