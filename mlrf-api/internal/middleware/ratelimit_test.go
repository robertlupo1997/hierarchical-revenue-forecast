package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"
)

func TestRateLimiter_AllowsRequestsWithinLimit(t *testing.T) {
	cfg := RateLimiterConfig{
		RequestsPerSecond: 100,
		BurstSize:         200,
		CleanupInterval:   10 * time.Minute,
	}
	rl := NewRateLimiter(cfg)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("success"))
	})

	wrappedHandler := rl.Middleware(handler)

	// Should allow multiple requests within burst
	for i := 0; i < 10; i++ {
		req := httptest.NewRequest("GET", "/test", nil)
		req.RemoteAddr = "192.168.1.1:12345"
		rec := httptest.NewRecorder()

		wrappedHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("request %d: expected status 200, got %d", i, rec.Code)
		}
	}
}

func TestRateLimiter_BlocksExcessiveRequests(t *testing.T) {
	cfg := RateLimiterConfig{
		RequestsPerSecond: 1,
		BurstSize:         2, // Only allow 2 requests
		CleanupInterval:   10 * time.Minute,
	}
	rl := NewRateLimiter(cfg)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	wrappedHandler := rl.Middleware(handler)

	// First 2 requests should succeed (burst)
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest("GET", "/test", nil)
		req.RemoteAddr = "192.168.1.1:12345"
		rec := httptest.NewRecorder()

		wrappedHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("request %d: expected status 200, got %d", i, rec.Code)
		}
	}

	// Third request should be rate limited
	req := httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "192.168.1.1:12345"
	rec := httptest.NewRecorder()

	wrappedHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Errorf("expected status 429, got %d", rec.Code)
	}

	// Verify error response structure
	var errResp errorResponse
	json.NewDecoder(rec.Body).Decode(&errResp)

	if errResp.Code != "RATE_LIMITED" {
		t.Errorf("expected error code RATE_LIMITED, got %s", errResp.Code)
	}
}

func TestRateLimiter_SetsRetryAfterHeader(t *testing.T) {
	cfg := RateLimiterConfig{
		RequestsPerSecond: 1,
		BurstSize:         1,
		CleanupInterval:   10 * time.Minute,
	}
	rl := NewRateLimiter(cfg)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	wrappedHandler := rl.Middleware(handler)

	// First request succeeds
	req := httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "192.168.1.1:12345"
	rec := httptest.NewRecorder()
	wrappedHandler.ServeHTTP(rec, req)

	// Second request is rate limited
	req = httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "192.168.1.1:12345"
	rec = httptest.NewRecorder()
	wrappedHandler.ServeHTTP(rec, req)

	if rec.Header().Get("Retry-After") != "1" {
		t.Errorf("expected Retry-After header to be '1', got '%s'", rec.Header().Get("Retry-After"))
	}
}

func TestRateLimiter_DifferentIPsHaveSeparateLimits(t *testing.T) {
	cfg := RateLimiterConfig{
		RequestsPerSecond: 1,
		BurstSize:         1,
		CleanupInterval:   10 * time.Minute,
	}
	rl := NewRateLimiter(cfg)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	wrappedHandler := rl.Middleware(handler)

	// Request from IP 1 (uses burst)
	req1 := httptest.NewRequest("GET", "/test", nil)
	req1.RemoteAddr = "192.168.1.1:12345"
	rec1 := httptest.NewRecorder()
	wrappedHandler.ServeHTTP(rec1, req1)

	if rec1.Code != http.StatusOK {
		t.Errorf("IP1 first request: expected status 200, got %d", rec1.Code)
	}

	// Request from IP 2 should also succeed (separate bucket)
	req2 := httptest.NewRequest("GET", "/test", nil)
	req2.RemoteAddr = "192.168.1.2:12345"
	rec2 := httptest.NewRecorder()
	wrappedHandler.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusOK {
		t.Errorf("IP2 first request: expected status 200, got %d", rec2.Code)
	}

	// IP1 should be rate limited now
	req3 := httptest.NewRequest("GET", "/test", nil)
	req3.RemoteAddr = "192.168.1.1:12345"
	rec3 := httptest.NewRecorder()
	wrappedHandler.ServeHTTP(rec3, req3)

	if rec3.Code != http.StatusTooManyRequests {
		t.Errorf("IP1 second request: expected status 429, got %d", rec3.Code)
	}
}

func TestRateLimiter_UsesXRealIP(t *testing.T) {
	cfg := RateLimiterConfig{
		RequestsPerSecond: 1,
		BurstSize:         1,
		CleanupInterval:   10 * time.Minute,
	}
	rl := NewRateLimiter(cfg)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	wrappedHandler := rl.Middleware(handler)

	// First request with X-Real-IP
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-Real-IP", "10.0.0.1")
	req.RemoteAddr = "192.168.1.1:12345"
	rec := httptest.NewRecorder()
	wrappedHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}

	// Second request with same X-Real-IP should be rate limited
	req2 := httptest.NewRequest("GET", "/test", nil)
	req2.Header.Set("X-Real-IP", "10.0.0.1")
	req2.RemoteAddr = "192.168.1.2:12345" // Different RemoteAddr
	rec2 := httptest.NewRecorder()
	wrappedHandler.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusTooManyRequests {
		t.Errorf("expected status 429, got %d", rec2.Code)
	}
}

func TestRateLimiter_UsesXForwardedFor(t *testing.T) {
	cfg := RateLimiterConfig{
		RequestsPerSecond: 1,
		BurstSize:         1,
		CleanupInterval:   10 * time.Minute,
	}
	rl := NewRateLimiter(cfg)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	wrappedHandler := rl.Middleware(handler)

	// First request with X-Forwarded-For
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-Forwarded-For", "203.0.113.1")
	req.RemoteAddr = "192.168.1.1:12345"
	rec := httptest.NewRecorder()
	wrappedHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}

	// Second request with same X-Forwarded-For should be rate limited
	req2 := httptest.NewRequest("GET", "/test", nil)
	req2.Header.Set("X-Forwarded-For", "203.0.113.1")
	req2.RemoteAddr = "192.168.1.2:12345"
	rec2 := httptest.NewRecorder()
	wrappedHandler.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusTooManyRequests {
		t.Errorf("expected status 429, got %d", rec2.Code)
	}
}

func TestRateLimiter_ConcurrentRequests(t *testing.T) {
	cfg := RateLimiterConfig{
		RequestsPerSecond: 100,
		BurstSize:         50,
		CleanupInterval:   10 * time.Minute,
	}
	rl := NewRateLimiter(cfg)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	wrappedHandler := rl.Middleware(handler)

	var wg sync.WaitGroup
	successCount := 0
	rateLimitedCount := 0
	var mu sync.Mutex

	// Send 100 concurrent requests from same IP
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()

			req := httptest.NewRequest("GET", "/test", nil)
			req.RemoteAddr = "192.168.1.1:12345"
			rec := httptest.NewRecorder()

			wrappedHandler.ServeHTTP(rec, req)

			mu.Lock()
			if rec.Code == http.StatusOK {
				successCount++
			} else if rec.Code == http.StatusTooManyRequests {
				rateLimitedCount++
			}
			mu.Unlock()
		}()
	}

	wg.Wait()

	// Should have some successful requests (up to burst) and some rate limited
	if successCount == 0 {
		t.Error("expected some successful requests")
	}
	if rateLimitedCount == 0 {
		t.Error("expected some rate limited requests")
	}
	if successCount+rateLimitedCount != 100 {
		t.Errorf("expected 100 total requests, got %d successful + %d rate limited",
			successCount, rateLimitedCount)
	}
}

func TestRateLimiter_Size(t *testing.T) {
	cfg := RateLimiterConfig{
		RequestsPerSecond: 100,
		BurstSize:         200,
		CleanupInterval:   10 * time.Minute,
	}
	rl := NewRateLimiter(cfg)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	wrappedHandler := rl.Middleware(handler)

	// Send requests from 3 different IPs
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest("GET", "/test", nil)
		req.RemoteAddr = "192.168.1." + string(rune('1'+i)) + ":12345"
		rec := httptest.NewRecorder()
		wrappedHandler.ServeHTTP(rec, req)
	}

	if rl.Size() != 3 {
		t.Errorf("expected 3 tracked IPs, got %d", rl.Size())
	}
}

func TestDefaultRateLimiterConfig(t *testing.T) {
	// Test default values
	os.Unsetenv("RATE_LIMIT_RPS")
	os.Unsetenv("RATE_LIMIT_BURST")

	cfg := DefaultRateLimiterConfig()

	if cfg.RequestsPerSecond != 100 {
		t.Errorf("expected default RPS of 100, got %f", cfg.RequestsPerSecond)
	}
	if cfg.BurstSize != 200 {
		t.Errorf("expected default burst of 200, got %d", cfg.BurstSize)
	}
}

func TestDefaultRateLimiterConfig_FromEnv(t *testing.T) {
	os.Setenv("RATE_LIMIT_RPS", "50")
	os.Setenv("RATE_LIMIT_BURST", "100")
	defer os.Unsetenv("RATE_LIMIT_RPS")
	defer os.Unsetenv("RATE_LIMIT_BURST")

	cfg := DefaultRateLimiterConfig()

	if cfg.RequestsPerSecond != 50 {
		t.Errorf("expected RPS of 50, got %f", cfg.RequestsPerSecond)
	}
	if cfg.BurstSize != 100 {
		t.Errorf("expected burst of 100, got %d", cfg.BurstSize)
	}
}

func TestExtractIP(t *testing.T) {
	tests := []struct {
		name       string
		remoteAddr string
		xRealIP    string
		xForwarded string
		expected   string
	}{
		{
			name:       "RemoteAddr only",
			remoteAddr: "192.168.1.1:12345",
			expected:   "192.168.1.1",
		},
		{
			name:       "X-Real-IP takes precedence",
			remoteAddr: "192.168.1.1:12345",
			xRealIP:    "10.0.0.1",
			expected:   "10.0.0.1",
		},
		{
			name:       "X-Forwarded-For without X-Real-IP",
			remoteAddr: "192.168.1.1:12345",
			xForwarded: "203.0.113.1",
			expected:   "203.0.113.1",
		},
		{
			name:       "X-Real-IP over X-Forwarded-For",
			remoteAddr: "192.168.1.1:12345",
			xRealIP:    "10.0.0.1",
			xForwarded: "203.0.113.1",
			expected:   "10.0.0.1",
		},
		{
			name:       "RemoteAddr without port",
			remoteAddr: "192.168.1.1",
			expected:   "192.168.1.1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/test", nil)
			req.RemoteAddr = tt.remoteAddr
			if tt.xRealIP != "" {
				req.Header.Set("X-Real-IP", tt.xRealIP)
			}
			if tt.xForwarded != "" {
				req.Header.Set("X-Forwarded-For", tt.xForwarded)
			}

			ip := extractIP(req)
			if ip != tt.expected {
				t.Errorf("expected IP %s, got %s", tt.expected, ip)
			}
		})
	}
}
