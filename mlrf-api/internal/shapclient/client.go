// Package shapclient provides an HTTP client for the SHAP explanation service.
package shapclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/rs/zerolog/log"
)

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

// ExplainRequest represents a SHAP explanation request.
type ExplainRequest struct {
	StoreNbr int       `json:"store_nbr"`
	Family   string    `json:"family"`
	Date     string    `json:"date"`
	Features []float32 `json:"features"`
}

// HealthResponse represents a health check response.
type HealthResponse struct {
	Healthy        bool   `json:"healthy"`
	ModelPath      string `json:"model_path"`
	RequestsServed int64  `json:"requests_served"`
}

// Client provides methods to call the SHAP HTTP service.
type Client struct {
	baseURL    string
	httpClient *http.Client
	timeout    time.Duration
}

// NewClient creates a new SHAP client connected to the given address.
func NewClient(addr string, timeout time.Duration) (*Client, error) {
	baseURL := fmt.Sprintf("http://%s", addr)

	client := &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: timeout,
		},
		timeout: timeout,
	}

	// Verify connection with health check
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	healthy, err := client.Health(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to SHAP service at %s: %w", addr, err)
	}
	if !healthy {
		return nil, fmt.Errorf("SHAP service at %s is not healthy", addr)
	}

	log.Info().Str("addr", addr).Msg("Connected to SHAP service")
	return client, nil
}

// Explain computes SHAP values for a prediction.
// This calls the Python SHAP service for REAL computation - no mocks.
func (c *Client) Explain(ctx context.Context, storeNbr int, family, date string, features []float32) (*ExplainResponse, error) {
	req := ExplainRequest{
		StoreNbr: storeNbr,
		Family:   family,
		Date:     date,
		Features: features,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/explain", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("SHAP request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		var errResp struct {
			Error string `json:"error"`
		}
		json.Unmarshal(respBody, &errResp)
		return nil, fmt.Errorf("SHAP service error (status %d): %s", resp.StatusCode, errResp.Error)
	}

	var result ExplainResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &result, nil
}

// Health checks if the SHAP service is healthy.
func (c *Client) Health(ctx context.Context) (bool, error) {
	httpReq, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+"/health", nil)
	if err != nil {
		return false, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return false, fmt.Errorf("health check failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, nil
	}

	var health HealthResponse
	if err := json.NewDecoder(resp.Body).Decode(&health); err != nil {
		return false, fmt.Errorf("failed to parse health response: %w", err)
	}

	return health.Healthy, nil
}

// Close is a no-op for HTTP client (included for interface compatibility).
func (c *Client) Close() error {
	return nil
}
