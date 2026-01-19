// Package middleware provides HTTP middleware for the MLRF API.
package middleware

import (
	"encoding/json"
	"net/http"
	"os"
)

// errorResponse is the standard error response structure.
type errorResponse struct {
	Error string `json:"error"`
	Code  string `json:"code"`
}

// APIKeyAuth returns middleware that validates API key authentication.
// If API_KEY environment variable is not set, authentication is disabled (dev mode).
// The /health endpoint is always accessible without authentication.
func APIKeyAuth(next http.Handler) http.Handler {
	apiKey := os.Getenv("API_KEY")

	// If no API key configured, skip authentication (dev mode)
	if apiKey == "" {
		return next
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Always allow health checks without auth
		if r.URL.Path == "/health" {
			next.ServeHTTP(w, r)
			return
		}

		// Check for API key in header first, then query parameter
		key := r.Header.Get("X-API-Key")
		if key == "" {
			key = r.URL.Query().Get("api_key")
		}

		// Validate API key
		if key != apiKey {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(errorResponse{
				Error: "unauthorized: invalid or missing API key",
				Code:  "AUTH_REQUIRED",
			})
			return
		}

		next.ServeHTTP(w, r)
	})
}
