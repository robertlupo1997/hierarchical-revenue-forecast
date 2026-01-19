package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestAPIKeyAuth_NoKeyConfigured(t *testing.T) {
	// Unset API_KEY to test dev mode
	os.Unsetenv("API_KEY")

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("success"))
	})

	wrappedHandler := APIKeyAuth(handler)

	req := httptest.NewRequest("GET", "/test", nil)
	rec := httptest.NewRecorder()

	wrappedHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
}

func TestAPIKeyAuth_HealthEndpointAlwaysAllowed(t *testing.T) {
	os.Setenv("API_KEY", "test-secret-key")
	defer os.Unsetenv("API_KEY")

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("healthy"))
	})

	// Need to recreate handler after setting env var
	wrappedHandler := APIKeyAuth(handler)

	req := httptest.NewRequest("GET", "/health", nil)
	rec := httptest.NewRecorder()

	wrappedHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200 for /health, got %d", rec.Code)
	}
}

func TestAPIKeyAuth_ValidKeyInHeader(t *testing.T) {
	os.Setenv("API_KEY", "test-secret-key")
	defer os.Unsetenv("API_KEY")

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("success"))
	})

	wrappedHandler := APIKeyAuth(handler)

	req := httptest.NewRequest("GET", "/predict", nil)
	req.Header.Set("X-API-Key", "test-secret-key")
	rec := httptest.NewRecorder()

	wrappedHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
}

func TestAPIKeyAuth_ValidKeyInQueryParam(t *testing.T) {
	os.Setenv("API_KEY", "test-secret-key")
	defer os.Unsetenv("API_KEY")

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("success"))
	})

	wrappedHandler := APIKeyAuth(handler)

	req := httptest.NewRequest("GET", "/predict?api_key=test-secret-key", nil)
	rec := httptest.NewRecorder()

	wrappedHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
}

func TestAPIKeyAuth_InvalidKey(t *testing.T) {
	os.Setenv("API_KEY", "test-secret-key")
	defer os.Unsetenv("API_KEY")

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	wrappedHandler := APIKeyAuth(handler)

	req := httptest.NewRequest("GET", "/predict", nil)
	req.Header.Set("X-API-Key", "wrong-key")
	rec := httptest.NewRecorder()

	wrappedHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", rec.Code)
	}

	var errResp errorResponse
	json.NewDecoder(rec.Body).Decode(&errResp)

	if errResp.Code != "AUTH_REQUIRED" {
		t.Errorf("expected error code AUTH_REQUIRED, got %s", errResp.Code)
	}
}

func TestAPIKeyAuth_MissingKey(t *testing.T) {
	os.Setenv("API_KEY", "test-secret-key")
	defer os.Unsetenv("API_KEY")

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	wrappedHandler := APIKeyAuth(handler)

	req := httptest.NewRequest("GET", "/predict", nil)
	rec := httptest.NewRecorder()

	wrappedHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", rec.Code)
	}

	var errResp errorResponse
	json.NewDecoder(rec.Body).Decode(&errResp)

	if errResp.Code != "AUTH_REQUIRED" {
		t.Errorf("expected error code AUTH_REQUIRED, got %s", errResp.Code)
	}
}

func TestAPIKeyAuth_HeaderTakesPrecedenceOverQuery(t *testing.T) {
	os.Setenv("API_KEY", "test-secret-key")
	defer os.Unsetenv("API_KEY")

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	wrappedHandler := APIKeyAuth(handler)

	// Valid key in header, invalid in query - should succeed
	req := httptest.NewRequest("GET", "/predict?api_key=wrong-key", nil)
	req.Header.Set("X-API-Key", "test-secret-key")
	rec := httptest.NewRecorder()

	wrappedHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
}
