package middleware

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestCORSDefaultOrigins(t *testing.T) {
	// Unset CORS_ORIGINS to test defaults
	os.Unsetenv("CORS_ORIGINS")

	cfg := NewCORSConfig()

	if len(cfg.AllowedOrigins) != len(DefaultCORSOrigins) {
		t.Errorf("Expected %d default origins, got %d", len(DefaultCORSOrigins), len(cfg.AllowedOrigins))
	}

	for i, origin := range DefaultCORSOrigins {
		if cfg.AllowedOrigins[i] != origin {
			t.Errorf("Expected origin %s, got %s", origin, cfg.AllowedOrigins[i])
		}
	}
}

func TestCORSCustomOrigins(t *testing.T) {
	os.Setenv("CORS_ORIGINS", "https://app.example.com, https://staging.example.com")
	defer os.Unsetenv("CORS_ORIGINS")

	cfg := NewCORSConfig()

	expected := []string{"https://app.example.com", "https://staging.example.com"}
	if len(cfg.AllowedOrigins) != len(expected) {
		t.Errorf("Expected %d origins, got %d", len(expected), len(cfg.AllowedOrigins))
	}

	for i, origin := range expected {
		if cfg.AllowedOrigins[i] != origin {
			t.Errorf("Expected origin %s, got %s", origin, cfg.AllowedOrigins[i])
		}
	}
}

func TestCORSAllowedOrigin(t *testing.T) {
	cfg := CORSConfig{
		AllowedOrigins: []string{"http://localhost:3000", "https://app.example.com"},
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type", "X-API-Key"},
	}

	handler := CORS(cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Test allowed origin
	req := httptest.NewRequest("GET", "/health", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
		t.Errorf("Expected Access-Control-Allow-Origin to be http://localhost:3000, got %s",
			rec.Header().Get("Access-Control-Allow-Origin"))
	}

	if rec.Header().Get("Vary") != "Origin" {
		t.Errorf("Expected Vary header to be Origin, got %s", rec.Header().Get("Vary"))
	}
}

func TestCORSDisallowedOrigin(t *testing.T) {
	cfg := CORSConfig{
		AllowedOrigins: []string{"http://localhost:3000"},
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type", "X-API-Key"},
	}

	handler := CORS(cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Test disallowed origin
	req := httptest.NewRequest("GET", "/health", nil)
	req.Header.Set("Origin", "https://malicious-site.com")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Errorf("Expected no Access-Control-Allow-Origin header for disallowed origin, got %s",
			rec.Header().Get("Access-Control-Allow-Origin"))
	}
}

func TestCORSPreflightAllowed(t *testing.T) {
	cfg := CORSConfig{
		AllowedOrigins: []string{"http://localhost:3000"},
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type", "X-API-Key"},
	}

	handler := CORS(cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Test preflight request from allowed origin
	req := httptest.NewRequest("OPTIONS", "/predict", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Expected preflight to return 200, got %d", rec.Code)
	}

	if rec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
		t.Errorf("Expected Access-Control-Allow-Origin in preflight response")
	}

	if rec.Header().Get("Access-Control-Allow-Methods") != "GET, POST, OPTIONS" {
		t.Errorf("Expected Access-Control-Allow-Methods header, got %s",
			rec.Header().Get("Access-Control-Allow-Methods"))
	}
}

func TestCORSPreflightDisallowed(t *testing.T) {
	cfg := CORSConfig{
		AllowedOrigins: []string{"http://localhost:3000"},
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type", "X-API-Key"},
	}

	handler := CORS(cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Test preflight request from disallowed origin
	req := httptest.NewRequest("OPTIONS", "/predict", nil)
	req.Header.Set("Origin", "https://malicious-site.com")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("Expected preflight from disallowed origin to return 403, got %d", rec.Code)
	}
}

func TestCORSNoOriginHeader(t *testing.T) {
	cfg := CORSConfig{
		AllowedOrigins: []string{"http://localhost:3000"},
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type", "X-API-Key"},
	}

	handler := CORS(cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Test request without Origin header (e.g., from same origin or non-browser)
	req := httptest.NewRequest("GET", "/health", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Expected request without Origin to succeed, got %d", rec.Code)
	}

	// No CORS headers should be set
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Errorf("Expected no CORS headers for request without Origin")
	}
}

func TestCORSEmptyOriginsEnv(t *testing.T) {
	os.Setenv("CORS_ORIGINS", "")
	defer os.Unsetenv("CORS_ORIGINS")

	cfg := NewCORSConfig()

	// Empty env should use defaults
	if len(cfg.AllowedOrigins) != len(DefaultCORSOrigins) {
		t.Errorf("Expected default origins for empty CORS_ORIGINS env, got %d origins",
			len(cfg.AllowedOrigins))
	}
}
