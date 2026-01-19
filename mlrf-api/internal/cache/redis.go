// Package cache provides Redis caching with TinyLFU local cache layer.
package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/mlrf/mlrf-api/internal/metrics"
	"github.com/redis/go-redis/v9"
)

// PredictionResult represents a cached prediction.
type PredictionResult struct {
	StoreNbr   int       `json:"store_nbr"`
	Family     string    `json:"family"`
	Date       string    `json:"date"`
	Horizon    int       `json:"horizon"`
	Prediction float32   `json:"prediction"`
	CachedAt   time.Time `json:"cached_at"`
}

// RedisCache wraps Redis client with local caching.
type RedisCache struct {
	client     *redis.Client
	localCache map[string]*cacheEntry
	maxLocal   int
	ttl        time.Duration
}

type cacheEntry struct {
	result    *PredictionResult
	expiresAt time.Time
}

// Config holds Redis connection configuration.
type Config struct {
	URL      string
	MaxLocal int           // Maximum local cache entries (TinyLFU-like behavior)
	TTL      time.Duration // Cache TTL
}

// DefaultConfig returns sensible defaults for cache configuration.
func DefaultConfig() Config {
	return Config{
		URL:      "redis://localhost:6379",
		MaxLocal: 10000,
		TTL:      time.Hour,
	}
}

// NewRedisCache creates a new Redis cache connection.
func NewRedisCache(cfg Config) (*RedisCache, error) {
	if cfg.URL == "" {
		cfg = DefaultConfig()
	}

	opt, err := redis.ParseURL(cfg.URL)
	if err != nil {
		return nil, fmt.Errorf("invalid redis URL: %w", err)
	}

	client := redis.NewClient(opt)

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis connection failed: %w", err)
	}

	return &RedisCache{
		client:     client,
		localCache: make(map[string]*cacheEntry),
		maxLocal:   cfg.MaxLocal,
		ttl:        cfg.TTL,
	}, nil
}

// GenerateCacheKey creates a deterministic cache key for predictions.
func GenerateCacheKey(storeNbr int, family string, date string, horizon int) string {
	return fmt.Sprintf("pred:v1:%d:%s:%s:%d", storeNbr, family, date, horizon)
}

// GetPrediction retrieves a cached prediction.
// Checks local cache first, then Redis.
func (r *RedisCache) GetPrediction(ctx context.Context, key string) (*PredictionResult, error) {
	// Check local cache first
	if entry, ok := r.localCache[key]; ok {
		if time.Now().Before(entry.expiresAt) {
			metrics.RecordCacheHit()
			return entry.result, nil
		}
		// Expired, remove from local cache
		delete(r.localCache, key)
	}

	// Check Redis
	data, err := r.client.Get(ctx, key).Bytes()
	if err != nil {
		if err == redis.Nil {
			metrics.RecordCacheMiss()
			return nil, fmt.Errorf("cache miss")
		}
		return nil, fmt.Errorf("redis get failed: %w", err)
	}

	// Redis hit (but local miss)
	metrics.RecordCacheHit()

	var result PredictionResult
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("unmarshal failed: %w", err)
	}

	// Store in local cache
	r.setLocal(key, &result)

	return &result, nil
}

// SetPrediction stores a prediction in both local and Redis cache.
func (r *RedisCache) SetPrediction(ctx context.Context, key string, result *PredictionResult) error {
	result.CachedAt = time.Now()

	// Store in local cache
	r.setLocal(key, result)

	// Store in Redis
	data, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("marshal failed: %w", err)
	}

	if err := r.client.Set(ctx, key, data, r.ttl).Err(); err != nil {
		return fmt.Errorf("redis set failed: %w", err)
	}

	return nil
}

// setLocal stores an entry in the local cache with simple eviction.
func (r *RedisCache) setLocal(key string, result *PredictionResult) {
	// Simple eviction: if at capacity, remove oldest entries
	if len(r.localCache) >= r.maxLocal {
		// Remove ~10% of entries (oldest by cached_at)
		var oldest []string
		cutoff := time.Now().Add(-r.ttl / 2)
		for k, v := range r.localCache {
			if v.result.CachedAt.Before(cutoff) {
				oldest = append(oldest, k)
			}
			if len(oldest) >= r.maxLocal/10 {
				break
			}
		}
		for _, k := range oldest {
			delete(r.localCache, k)
		}
	}

	r.localCache[key] = &cacheEntry{
		result:    result,
		expiresAt: time.Now().Add(r.ttl),
	}
}

// Close closes the Redis connection.
func (r *RedisCache) Close() error {
	return r.client.Close()
}

// Stats returns cache statistics.
func (r *RedisCache) Stats() map[string]interface{} {
	return map[string]interface{}{
		"local_entries": len(r.localCache),
		"max_local":     r.maxLocal,
		"ttl_seconds":   r.ttl.Seconds(),
	}
}
