// Package middleware provides HTTP middleware for the MLRF API.
package middleware

import (
	"encoding/json"
	"net"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// RateLimiter implements per-IP rate limiting using token bucket algorithm.
type RateLimiter struct {
	limiters map[string]*rateLimiterEntry
	mu       sync.RWMutex
	rate     rate.Limit
	burst    int
	cleanup  time.Duration
}

// rateLimiterEntry tracks a limiter and when it was last used.
type rateLimiterEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// RateLimiterConfig holds rate limiter configuration.
type RateLimiterConfig struct {
	RequestsPerSecond float64
	BurstSize         int
	CleanupInterval   time.Duration
}

// DefaultRateLimiterConfig returns default rate limiting configuration.
// Reads from RATE_LIMIT_RPS and RATE_LIMIT_BURST env vars if set.
func DefaultRateLimiterConfig() RateLimiterConfig {
	rps := 100.0
	burst := 200

	if val := os.Getenv("RATE_LIMIT_RPS"); val != "" {
		if parsed, err := strconv.ParseFloat(val, 64); err == nil && parsed > 0 {
			rps = parsed
		}
	}

	if val := os.Getenv("RATE_LIMIT_BURST"); val != "" {
		if parsed, err := strconv.Atoi(val); err == nil && parsed > 0 {
			burst = parsed
		}
	}

	return RateLimiterConfig{
		RequestsPerSecond: rps,
		BurstSize:         burst,
		CleanupInterval:   10 * time.Minute,
	}
}

// NewRateLimiter creates a new rate limiter with specified requests per second and burst size.
func NewRateLimiter(cfg RateLimiterConfig) *RateLimiter {
	rl := &RateLimiter{
		limiters: make(map[string]*rateLimiterEntry),
		rate:     rate.Limit(cfg.RequestsPerSecond),
		burst:    cfg.BurstSize,
		cleanup:  cfg.CleanupInterval,
	}

	// Start cleanup goroutine to remove stale entries
	go rl.cleanupLoop()

	return rl
}

// cleanupLoop periodically removes stale limiter entries.
func (rl *RateLimiter) cleanupLoop() {
	ticker := time.NewTicker(rl.cleanup)
	for range ticker.C {
		rl.cleanup_stale()
	}
}

// cleanup_stale removes entries that haven't been seen in cleanup interval.
func (rl *RateLimiter) cleanup_stale() {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	cutoff := time.Now().Add(-rl.cleanup)
	for ip, entry := range rl.limiters {
		if entry.lastSeen.Before(cutoff) {
			delete(rl.limiters, ip)
		}
	}
}

// getLimiter returns the rate limiter for the given IP address.
func (rl *RateLimiter) getLimiter(ip string) *rate.Limiter {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	entry, exists := rl.limiters[ip]
	if !exists {
		limiter := rate.NewLimiter(rl.rate, rl.burst)
		rl.limiters[ip] = &rateLimiterEntry{
			limiter:  limiter,
			lastSeen: time.Now(),
		}
		return limiter
	}

	entry.lastSeen = time.Now()
	return entry.limiter
}

// extractIP extracts the IP address from a request.
// Uses X-Real-IP or X-Forwarded-For if available (set by chi RealIP middleware).
func extractIP(r *http.Request) string {
	// chi.RealIP middleware sets r.RemoteAddr to the real IP
	// But we also check headers for safety
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}

	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		return ip
	}

	// Fall back to RemoteAddr (which chi.RealIP middleware updates)
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

// Middleware returns HTTP middleware that enforces rate limiting.
func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := extractIP(r)
		limiter := rl.getLimiter(ip)

		if !limiter.Allow() {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "1")
			w.WriteHeader(http.StatusTooManyRequests)
			json.NewEncoder(w).Encode(errorResponse{
				Error: "rate limit exceeded: too many requests",
				Code:  "RATE_LIMITED",
			})
			return
		}

		next.ServeHTTP(w, r)
	})
}

// Size returns the current number of tracked IPs.
func (rl *RateLimiter) Size() int {
	rl.mu.RLock()
	defer rl.mu.RUnlock()
	return len(rl.limiters)
}
