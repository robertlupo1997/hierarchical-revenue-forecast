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

1. **L1: Local in-memory cache**, configured with a 10,000-entry target
2. **L2: Redis** for shared, persistent caching (1-hour TTL)

**As implemented, L1 is a plain Go map with TTL expiry and best-effort age-based deletion.** It is
not LRU and not TinyLFU: it tracks no access recency, and when no entry is older than half the TTL
it can grow past the configured size, so 10,000 is not a strict bound. The map is also not guarded
by a mutex; see LIMITATIONS.md.

### Key factors

1. **Hot path optimization**: an in-process lookup avoids a Redis network round-trip. Neither tier's
   latency has been measured in this repository.

2. **Shared state**: Redis L2 enables multiple API replicas to share cache. When replica A caches a
   prediction, replica B can retrieve it, reducing redundant inference.

3. **Persistence**: Redis AOF or RDB persistence survives restarts within TTL. API restart doesn't
   invalidate warm predictions.

4. **Memory bounds**: the L1 cache is intended to stay near 10,000 entries. See the caveat above:
   the current eviction pass does not enforce that bound.

5. **Graceful degradation**: **not implemented as described.** Cache construction pings Redis and
   returns an error if the ping fails, and the server then sets the entire cache — including L1 — to
   nil. If Redis is unavailable the API runs with no caching at all. Inference still works.

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
pred:v1:{store_nbr}:{family}:{date}:{horizon}
```

The family string is preserved verbatim, spaces included.

Example: `pred:v1:1:GROCERY I:2017-08-15:30`

## Consequences

### Positive

- **Horizontal scaling**: replicas share Redis, maximizing cache utilization
- **Inference continues without Redis**: predictions still work when the cache is unavailable,
  though without any caching (see Key factors, point 5)

No cache latency or hit-rate figures are reported: no cache benchmark or traffic measurement is
checked in. Dashboard refresh concurrently refetches hierarchy, explanation, forecast, and accuracy
data, so its perceived speed is not determined by L1 latency alone.

### Negative

- **Stale data window**: Up to 1 hour stale data if model is retrained. Acceptable for forecasting use case.
- **Consistency complexity**: L1 and L2 can diverge briefly after writes
- **Memory overhead**: 10,000 entries × ~1KB = ~10MB per replica
- **Redis dependency**: Adds operational complexity (monitoring, failover)

### Mitigations

- Cache TTL of 1 hour balances freshness vs hit rate
- L1 populated on L2 hit ensures eventual consistency
- Prometheus exposes aggregate cache hit and miss counters. Both tiers increment the same unlabelled
  hit counter, so hit rates are not broken down by tier, and no cache-latency metric exists.
- Redis Sentinel or Cluster for HA (documented in deployment guide)
- The API health check reports whether Redis cache initialization succeeded at startup. It does not
  ping Redis, so it does not reflect current connectivity.

## Configuration

| Parameter | Value | Description |
|-----------|-------|-------------|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string (read from the environment) |
| L1 size | `10000`, hard-coded | Not configurable; server startup does not read `CACHE_MAX_LOCAL` |
| Cache TTL | `1h`, hard-coded | Not configurable; server startup does not read `CACHE_TTL` |

## References

- [Redis Caching Patterns](https://redis.io/docs/manual/patterns/caching/)
- [TinyLFU Paper](https://arxiv.org/abs/1512.00727)
- [Go Redis Client](https://github.com/redis/go-redis)
