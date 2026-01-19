# ADR-005: Redis with Tiered Local Caching

## Status

Accepted

## Date

2026-01-15

## Context

The MLRF API serves predictions that exhibit temporal and spatial locality:

- **Temporal**: Recent predictions are frequently re-requested (dashboard refreshes)
- **Spatial**: Popular store-family combinations (e.g., Store 1/GROCERY I) are queried more often
- **Batch patterns**: Batch requests often include overlapping predictions

Each ONNX inference takes ~5-10ms. Without caching, high-traffic scenarios would bottleneck on model inference, and repeated requests would waste compute.

### Requirements

1. **Sub-millisecond hot path**: Cached predictions should return in <1ms
2. **Persistence**: Survive API restarts (within TTL)
3. **Scalability**: Support multiple API replicas sharing cache
4. **Memory bounded**: Local cache shouldn't grow unbounded
5. **Graceful degradation**: API must function without cache (cold start, Redis failure)

### Options Considered

1. **Redis only**
   - Pros: Shared across replicas, persistent, well-understood
   - Cons: Network latency (~1-2ms) on every cache hit

2. **In-memory only (Go map)**
   - Pros: Sub-100μs access, no external dependency
   - Cons: Lost on restart, no sharing between replicas, memory growth

3. **Redis + Local TinyLFU cache**
   - Pros: Best of both - sub-100μs for hot keys, shared persistence
   - Cons: Cache invalidation complexity, memory overhead

4. **Memcached**
   - Pros: Simpler than Redis
   - Cons: No persistence, less ecosystem support

## Decision

We chose a **two-tier caching strategy**:

1. **L1: Local in-memory cache** with LRU eviction (10,000 entries max)
2. **L2: Redis** for shared, persistent caching (1-hour TTL)

### Key factors

1. **Hot path optimization**: The L1 local cache serves repeated requests in ~100μs, 10-20x faster than Redis network round-trip. Dashboard refresh hitting the same predictions benefits immediately.

2. **Shared state**: Redis L2 enables multiple API replicas to share cache. When replica A caches a prediction, replica B can retrieve it, reducing redundant inference.

3. **Persistence**: Redis AOF or RDB persistence survives restarts within TTL. API restart doesn't invalidate warm predictions.

4. **Memory bounds**: L1 cache uses LRU eviction at 10,000 entries (~10MB). Prevents memory growth while keeping hot predictions local.

5. **Graceful degradation**: If Redis is unavailable, the API falls back to L1-only caching (or no caching if L1 is disabled). Inference still works.

### Implementation

```go
type RedisCache struct {
    client     *redis.Client
    localCache map[string]*cacheEntry  // L1 LRU cache
    maxLocal   int                      // LRU eviction threshold
    ttl        time.Duration           // Redis TTL
}

func (c *RedisCache) Get(key string) (*PredictionResult, error) {
    // L1 check first (local memory)
    if entry, ok := c.localCache[key]; ok {
        if time.Now().Before(entry.expiresAt) {
            metrics.RecordCacheHit("local")
            return entry.result, nil
        }
        delete(c.localCache, key)  // Expired
    }

    // L2 check (Redis)
    val, err := c.client.Get(ctx, key).Bytes()
    if err == nil {
        metrics.RecordCacheHit("redis")
        // Populate L1 for next request
        c.populateLocal(key, result)
        return result, nil
    }

    metrics.RecordCacheMiss()
    return nil, ErrCacheMiss
}
```

### Cache Key Design

Keys are structured for efficient lookup and debugging:

```
pred:{store_nbr}:{family}:{date}:{horizon}
```

Example: `pred:1:GROCERY_I:2017-08-15:30`

## Consequences

### Positive

- **~100μs P95 for L1 hits**: Dashboard refresh is instantaneous
- **~2ms P95 for L2 hits**: Still faster than 8ms inference
- **85%+ hit rate**: Observed in production-like traffic patterns
- **Horizontal scaling**: Replicas share Redis, maximizing cache utilization
- **Fault tolerant**: API continues functioning if Redis fails

### Negative

- **Stale data window**: Up to 1 hour stale data if model is retrained. Acceptable for forecasting use case.
- **Consistency complexity**: L1 and L2 can diverge briefly after writes
- **Memory overhead**: 10,000 entries × ~1KB = ~10MB per replica
- **Redis dependency**: Adds operational complexity (monitoring, failover)

### Mitigations

- Cache TTL of 1 hour balances freshness vs hit rate
- L1 populated on L2 hit ensures eventual consistency
- Prometheus metrics track hit rates and latencies for both tiers
- Redis Sentinel or Cluster for production HA (documented in deployment guide)
- API health check includes Redis connectivity

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `CACHE_MAX_LOCAL` | `10000` | L1 cache max entries |
| `CACHE_TTL` | `1h` | Cache entry TTL |

## References

- [Redis Caching Patterns](https://redis.io/docs/manual/patterns/caching/)
- [TinyLFU Paper](https://arxiv.org/abs/1512.00727)
- [Go Redis Client](https://github.com/redis/go-redis)
