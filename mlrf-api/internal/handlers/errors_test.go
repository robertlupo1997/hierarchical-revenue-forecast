package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWriteError(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()

	WriteError(w, req, http.StatusBadRequest, "test error", "TEST_CODE")

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}

	if w.Header().Get("Content-Type") != "application/json" {
		t.Errorf("expected Content-Type application/json, got %s", w.Header().Get("Content-Type"))
	}

	var resp ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp.Error != "test error" {
		t.Errorf("expected error 'test error', got '%s'", resp.Error)
	}

	if resp.Code != "TEST_CODE" {
		t.Errorf("expected code 'TEST_CODE', got '%s'", resp.Code)
	}

	if resp.RequestID != "" {
		t.Errorf("expected empty request_id, got '%s'", resp.RequestID)
	}
}

func TestWriteErrorWithRequestID(t *testing.T) {
	ctx := context.WithValue(context.Background(), RequestIDKey, "req-12345")
	req := httptest.NewRequest(http.MethodGet, "/test", nil).WithContext(ctx)
	w := httptest.NewRecorder()

	WriteError(w, req, http.StatusInternalServerError, "internal error", "INTERNAL_ERROR")

	var resp ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp.RequestID != "req-12345" {
		t.Errorf("expected request_id 'req-12345', got '%s'", resp.RequestID)
	}
}

func TestWriteErrorNilRequest(t *testing.T) {
	w := httptest.NewRecorder()

	// Should not panic with nil request
	WriteError(w, nil, http.StatusBadRequest, "error", "CODE")

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}

	var resp ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	// Should have no request_id when request is nil
	if resp.RequestID != "" {
		t.Errorf("expected empty request_id, got '%s'", resp.RequestID)
	}
}

func TestWriteBadRequest(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	w := httptest.NewRecorder()

	WriteBadRequest(w, req, "bad input", "INVALID_INPUT")

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}

	var resp ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp.Error != "bad input" {
		t.Errorf("expected error 'bad input', got '%s'", resp.Error)
	}
}

func TestWriteUnauthorized(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()

	WriteUnauthorized(w, req, "unauthorized access")

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", w.Code)
	}

	var resp ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp.Code != CodeAuthRequired {
		t.Errorf("expected code '%s', got '%s'", CodeAuthRequired, resp.Code)
	}
}

func TestWriteTooManyRequests(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()

	WriteTooManyRequests(w, req, "rate limited")

	if w.Code != http.StatusTooManyRequests {
		t.Errorf("expected status 429, got %d", w.Code)
	}

	if w.Header().Get("Retry-After") != "1" {
		t.Errorf("expected Retry-After header '1', got '%s'", w.Header().Get("Retry-After"))
	}

	var resp ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp.Code != CodeRateLimited {
		t.Errorf("expected code '%s', got '%s'", CodeRateLimited, resp.Code)
	}
}

func TestWriteServiceUnavailable(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()

	WriteServiceUnavailable(w, req, "model not loaded", CodeModelUnavailable)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected status 503, got %d", w.Code)
	}

	var resp ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp.Code != CodeModelUnavailable {
		t.Errorf("expected code '%s', got '%s'", CodeModelUnavailable, resp.Code)
	}
}

func TestWriteInternalError(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()

	WriteInternalError(w, req, "inference failed", CodeInferenceFailed)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected status 500, got %d", w.Code)
	}

	var resp ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp.Code != CodeInferenceFailed {
		t.Errorf("expected code '%s', got '%s'", CodeInferenceFailed, resp.Code)
	}
}

func TestErrorResponseHasRequiredFields(t *testing.T) {
	// Verify that all error responses have 'error' and 'code' fields
	testCases := []struct {
		name   string
		writer func(w http.ResponseWriter, r *http.Request)
	}{
		{
			name: "WriteError",
			writer: func(w http.ResponseWriter, r *http.Request) {
				WriteError(w, r, 400, "msg", "CODE")
			},
		},
		{
			name: "WriteBadRequest",
			writer: func(w http.ResponseWriter, r *http.Request) {
				WriteBadRequest(w, r, "msg", "CODE")
			},
		},
		{
			name: "WriteUnauthorized",
			writer: func(w http.ResponseWriter, r *http.Request) {
				WriteUnauthorized(w, r, "msg")
			},
		},
		{
			name: "WriteTooManyRequests",
			writer: func(w http.ResponseWriter, r *http.Request) {
				WriteTooManyRequests(w, r, "msg")
			},
		},
		{
			name: "WriteServiceUnavailable",
			writer: func(w http.ResponseWriter, r *http.Request) {
				WriteServiceUnavailable(w, r, "msg", "CODE")
			},
		},
		{
			name: "WriteInternalError",
			writer: func(w http.ResponseWriter, r *http.Request) {
				WriteInternalError(w, r, "msg", "CODE")
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			w := httptest.NewRecorder()

			tc.writer(w, req)

			var resp map[string]interface{}
			if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
				t.Fatalf("failed to parse response: %v", err)
			}

			// Check for required 'error' field
			if _, ok := resp["error"]; !ok {
				t.Error("response missing required 'error' field")
			}

			// Check for required 'code' field
			if _, ok := resp["code"]; !ok {
				t.Error("response missing required 'code' field")
			}
		})
	}
}

func TestErrorCodesAreDefined(t *testing.T) {
	// Verify all error codes are non-empty strings
	codes := []string{
		CodeAuthRequired,
		CodeRateLimited,
		CodeInvalidRequest,
		CodeInvalidDate,
		CodeInvalidFamily,
		CodeInvalidStore,
		CodeInvalidFeatures,
		CodeInvalidHorizon,
		CodeBatchTooLarge,
		CodeModelUnavailable,
		CodeInferenceFailed,
		CodeInternalError,
		CodeParseError,
	}

	for _, code := range codes {
		if code == "" {
			t.Errorf("found empty error code")
		}
	}
}

func TestPredictErrorResponseStructure(t *testing.T) {
	// Test that Predict handler returns proper structured errors
	h := NewHandlers(nil, nil, nil)

	req := httptest.NewRequest(http.MethodPost, "/predict", nil)
	w := httptest.NewRecorder()

	h.Predict(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}

	var resp ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp.Error == "" {
		t.Error("error field should not be empty")
	}

	if resp.Code == "" {
		t.Error("code field should not be empty")
	}
}

func TestExplainErrorResponseStructure(t *testing.T) {
	// Test that Explain handler returns proper structured errors
	h := NewHandlers(nil, nil, nil)

	req := httptest.NewRequest(http.MethodPost, "/explain", nil)
	w := httptest.NewRecorder()

	h.Explain(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}

	var resp ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp.Error == "" {
		t.Error("error field should not be empty")
	}

	if resp.Code == "" {
		t.Error("code field should not be empty")
	}
}

func TestPredictSimpleModelUnavailableError(t *testing.T) {
	// Test that PredictSimple returns proper error when model is unavailable
	h := NewHandlers(nil, nil, nil)

	body := `{"store_nbr": 1, "family": "GROCERY I", "date": "2017-08-01", "horizon": 30}`
	req := httptest.NewRequest(http.MethodPost, "/predict/simple", bytes.NewReader([]byte(body)))
	w := httptest.NewRecorder()

	h.PredictSimple(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("expected status 503, got %d", w.Code)
	}

	var resp ErrorResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp.Code != CodeModelUnavailable {
		t.Errorf("expected code '%s', got '%s'", CodeModelUnavailable, resp.Code)
	}
}
