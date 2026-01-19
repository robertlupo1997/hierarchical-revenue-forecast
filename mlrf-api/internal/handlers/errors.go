package handlers

import (
	"context"
	"encoding/json"
	"net/http"
)

// ErrorResponse represents a standardized API error response.
type ErrorResponse struct {
	Error     string `json:"error"`
	Code      string `json:"code"`
	RequestID string `json:"request_id,omitempty"`
}

// ContextKey is a custom type for context keys to avoid collisions.
type ContextKey string

// RequestIDKey is the context key for request ID.
const RequestIDKey ContextKey = "request_id"

// Error codes used throughout the API.
const (
	// Authentication & Authorization
	CodeAuthRequired = "AUTH_REQUIRED"

	// Rate Limiting
	CodeRateLimited = "RATE_LIMITED"

	// Validation Errors
	CodeInvalidRequest  = "INVALID_REQUEST"
	CodeInvalidDate     = "INVALID_DATE"
	CodeInvalidFamily   = "INVALID_FAMILY"
	CodeInvalidStore    = "INVALID_STORE"
	CodeInvalidFeatures = "INVALID_FEATURES"
	CodeInvalidHorizon  = "INVALID_HORIZON"
	CodeBatchTooLarge   = "BATCH_TOO_LARGE"

	// Server Errors
	CodeModelUnavailable = "MODEL_UNAVAILABLE"
	CodeInferenceFailed  = "INFERENCE_FAILED"
	CodeInternalError    = "INTERNAL_ERROR"
	CodeParseError       = "PARSE_ERROR"
)

// WriteError writes a standardized JSON error response.
// It sets the Content-Type header, writes the status code, and encodes the error.
// If a request ID is available in the context, it is included in the response.
func WriteError(w http.ResponseWriter, r *http.Request, statusCode int, message string, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	resp := ErrorResponse{
		Error: message,
		Code:  code,
	}

	// Extract request ID from context if available
	if r != nil {
		if rid := getRequestID(r.Context()); rid != "" {
			resp.RequestID = rid
		}
	}

	json.NewEncoder(w).Encode(resp)
}

// getRequestID extracts the request ID from context.
func getRequestID(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if rid, ok := ctx.Value(RequestIDKey).(string); ok {
		return rid
	}
	return ""
}

// WriteBadRequest writes a 400 Bad Request error response.
func WriteBadRequest(w http.ResponseWriter, r *http.Request, message string, code string) {
	WriteError(w, r, http.StatusBadRequest, message, code)
}

// WriteUnauthorized writes a 401 Unauthorized error response.
func WriteUnauthorized(w http.ResponseWriter, r *http.Request, message string) {
	WriteError(w, r, http.StatusUnauthorized, message, CodeAuthRequired)
}

// WriteTooManyRequests writes a 429 Too Many Requests error response.
func WriteTooManyRequests(w http.ResponseWriter, r *http.Request, message string) {
	w.Header().Set("Retry-After", "1")
	WriteError(w, r, http.StatusTooManyRequests, message, CodeRateLimited)
}

// WriteServiceUnavailable writes a 503 Service Unavailable error response.
func WriteServiceUnavailable(w http.ResponseWriter, r *http.Request, message string, code string) {
	WriteError(w, r, http.StatusServiceUnavailable, message, code)
}

// WriteInternalError writes a 500 Internal Server Error response.
func WriteInternalError(w http.ResponseWriter, r *http.Request, message string, code string) {
	WriteError(w, r, http.StatusInternalServerError, message, code)
}
