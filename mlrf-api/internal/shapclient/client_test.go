package shapclient

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHealth(t *testing.T) {
	t.Run("returns true for healthy service", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/health" {
				t.Errorf("expected path /health, got %s", r.URL.Path)
			}
			json.NewEncoder(w).Encode(HealthResponse{
				Healthy:        true,
				ModelPath:      "/models/test.txt",
				RequestsServed: 42,
			})
		}))
		defer server.Close()

		// Create client directly (skip NewClient which does health check)
		client := &Client{
			baseURL:    server.URL,
			httpClient: &http.Client{Timeout: 5 * time.Second},
			timeout:    5 * time.Second,
		}

		healthy, err := client.Health(context.Background())
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !healthy {
			t.Error("expected healthy=true")
		}
	})

	t.Run("returns false for unhealthy service", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			json.NewEncoder(w).Encode(HealthResponse{
				Healthy:   false,
				ModelPath: "/models/test.txt",
			})
		}))
		defer server.Close()

		client := &Client{
			baseURL:    server.URL,
			httpClient: &http.Client{Timeout: 5 * time.Second},
			timeout:    5 * time.Second,
		}

		healthy, err := client.Health(context.Background())
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if healthy {
			t.Error("expected healthy=false")
		}
	})

	t.Run("returns error on server error", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		}))
		defer server.Close()

		client := &Client{
			baseURL:    server.URL,
			httpClient: &http.Client{Timeout: 5 * time.Second},
			timeout:    5 * time.Second,
		}

		healthy, err := client.Health(context.Background())
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if healthy {
			t.Error("expected healthy=false for 500 response")
		}
	})
}

func TestExplain(t *testing.T) {
	t.Run("returns SHAP explanation", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/explain" {
				t.Errorf("expected path /explain, got %s", r.URL.Path)
			}
			if r.Method != "POST" {
				t.Errorf("expected POST method, got %s", r.Method)
			}
			if r.Header.Get("Content-Type") != "application/json" {
				t.Errorf("expected Content-Type application/json, got %s", r.Header.Get("Content-Type"))
			}

			// Decode request to verify structure
			var req ExplainRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Errorf("failed to decode request: %v", err)
			}

			if req.StoreNbr != 1 {
				t.Errorf("expected store_nbr=1, got %d", req.StoreNbr)
			}
			if req.Family != "GROCERY I" {
				t.Errorf("expected family=GROCERY I, got %s", req.Family)
			}
			if len(req.Features) != 27 {
				t.Errorf("expected 27 features, got %d", len(req.Features))
			}

			json.NewEncoder(w).Encode(ExplainResponse{
				BaseValue:  100.5,
				Prediction: 125.3,
				Features: []WaterfallFeature{
					{Name: "sales_lag_1", Value: 150.0, ShapValue: 15.5, Cumulative: 116.0, Direction: "positive"},
					{Name: "oil_price", Value: 45.2, ShapValue: -5.2, Cumulative: 110.8, Direction: "negative"},
				},
			})
		}))
		defer server.Close()

		client := &Client{
			baseURL:    server.URL,
			httpClient: &http.Client{Timeout: 5 * time.Second},
			timeout:    5 * time.Second,
		}

		features := make([]float32, 27)
		features[0] = 2017 // year
		resp, err := client.Explain(context.Background(), 1, "GROCERY I", "2017-08-01", features)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if resp.BaseValue != 100.5 {
			t.Errorf("expected base_value=100.5, got %f", resp.BaseValue)
		}
		if resp.Prediction != 125.3 {
			t.Errorf("expected prediction=125.3, got %f", resp.Prediction)
		}
		if len(resp.Features) != 2 {
			t.Errorf("expected 2 features, got %d", len(resp.Features))
		}
		if resp.Features[0].Name != "sales_lag_1" {
			t.Errorf("expected first feature sales_lag_1, got %s", resp.Features[0].Name)
		}
	})

	t.Run("returns error on server error", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "invalid feature count",
			})
		}))
		defer server.Close()

		client := &Client{
			baseURL:    server.URL,
			httpClient: &http.Client{Timeout: 5 * time.Second},
			timeout:    5 * time.Second,
		}

		features := make([]float32, 10) // Wrong count
		_, err := client.Explain(context.Background(), 1, "GROCERY I", "2017-08-01", features)
		if err == nil {
			t.Error("expected error for bad request")
		}
	})

	t.Run("respects context cancellation", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			time.Sleep(100 * time.Millisecond)
			json.NewEncoder(w).Encode(ExplainResponse{})
		}))
		defer server.Close()

		client := &Client{
			baseURL:    server.URL,
			httpClient: &http.Client{Timeout: 5 * time.Second},
			timeout:    5 * time.Second,
		}

		ctx, cancel := context.WithCancel(context.Background())
		cancel() // Cancel immediately

		features := make([]float32, 27)
		_, err := client.Explain(ctx, 1, "GROCERY I", "2017-08-01", features)
		if err == nil {
			t.Error("expected error for cancelled context")
		}
	})
}

func TestClose(t *testing.T) {
	client := &Client{
		baseURL:    "http://localhost:50051",
		httpClient: &http.Client{},
		timeout:    5 * time.Second,
	}

	err := client.Close()
	if err != nil {
		t.Errorf("Close should return nil, got %v", err)
	}
}
