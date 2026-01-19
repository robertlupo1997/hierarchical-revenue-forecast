// Package middleware provides HTTP middleware for the MLRF API.
package middleware

import (
	"net/http"
	"os"
	"strings"
)

// DefaultCORSOrigins are the allowed origins when CORS_ORIGINS is not set.
var DefaultCORSOrigins = []string{
	"http://localhost:3000",
	"http://localhost:4173",
	"http://localhost:5173",
}

// CORSConfig holds the CORS middleware configuration.
type CORSConfig struct {
	AllowedOrigins []string
	AllowedMethods []string
	AllowedHeaders []string
}

// NewCORSConfig creates a CORS configuration from environment variables.
func NewCORSConfig() CORSConfig {
	cfg := CORSConfig{
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type", "X-API-Key"},
	}

	// Parse CORS_ORIGINS from environment
	originsEnv := os.Getenv("CORS_ORIGINS")
	if originsEnv == "" {
		cfg.AllowedOrigins = DefaultCORSOrigins
	} else {
		// Split comma-separated origins and trim whitespace
		origins := strings.Split(originsEnv, ",")
		for _, origin := range origins {
			trimmed := strings.TrimSpace(origin)
			if trimmed != "" {
				cfg.AllowedOrigins = append(cfg.AllowedOrigins, trimmed)
			}
		}
	}

	return cfg
}

// CORS returns a middleware that handles Cross-Origin Resource Sharing.
// It validates the Origin header against the configured whitelist.
func CORS(cfg CORSConfig) func(http.Handler) http.Handler {
	// Build a map for O(1) origin lookup
	allowedMap := make(map[string]bool)
	for _, origin := range cfg.AllowedOrigins {
		allowedMap[origin] = true
	}

	methods := strings.Join(cfg.AllowedMethods, ", ")
	headers := strings.Join(cfg.AllowedHeaders, ", ")

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")

			// Only set CORS headers if origin is in whitelist
			if origin != "" && allowedMap[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Methods", methods)
				w.Header().Set("Access-Control-Allow-Headers", headers)
				w.Header().Set("Vary", "Origin")
			}

			// Handle preflight requests
			if r.Method == "OPTIONS" {
				if origin != "" && allowedMap[origin] {
					w.WriteHeader(http.StatusOK)
				} else {
					// Reject preflight from unknown origins
					w.WriteHeader(http.StatusForbidden)
				}
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
