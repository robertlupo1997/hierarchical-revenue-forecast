// Package handlers provides HTTP handlers for the MLRF API.
package handlers

import (
	"github.com/mlrf/mlrf-api/internal/cache"
	"github.com/mlrf/mlrf-api/internal/features"
	"github.com/mlrf/mlrf-api/internal/inference"
)

// Handlers holds dependencies for HTTP handlers.
type Handlers struct {
	onnx         *inference.ONNXSession
	cache        *cache.RedisCache
	featureStore *features.Store
}

// NewHandlers creates a new Handlers instance.
// cache and featureStore can be nil if unavailable.
func NewHandlers(onnx *inference.ONNXSession, c *cache.RedisCache, fs *features.Store) *Handlers {
	return &Handlers{
		onnx:         onnx,
		cache:        c,
		featureStore: fs,
	}
}
