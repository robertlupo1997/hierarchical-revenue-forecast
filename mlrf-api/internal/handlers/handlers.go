// Package handlers provides HTTP handlers for the MLRF API.
package handlers

import (
	"github.com/mlrf/mlrf-api/internal/cache"
	"github.com/mlrf/mlrf-api/internal/inference"
)

// Handlers holds dependencies for HTTP handlers.
type Handlers struct {
	onnx  *inference.ONNXSession
	cache *cache.RedisCache
}

// NewHandlers creates a new Handlers instance.
// cache can be nil if Redis is unavailable.
func NewHandlers(onnx *inference.ONNXSession, c *cache.RedisCache) *Handlers {
	return &Handlers{
		onnx:  onnx,
		cache: c,
	}
}
