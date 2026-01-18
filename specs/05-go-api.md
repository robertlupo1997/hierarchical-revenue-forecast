# Spec: Go Inference API

## Job To Be Done
As a dashboard developer, I need a fast REST API that returns predictions and explanations in under 10ms.

## Requirements

### Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check, returns {"status":"healthy"} |
| `/predict` | POST | Single prediction with caching |
| `/predict/batch` | POST | Batch predictions |
| `/explain` | POST | SHAP waterfall data |
| `/hierarchy` | GET | Full hierarchy tree with predictions |
| `/metrics` | GET | Prometheus metrics |

### Predict Request/Response
```json
// Request
{
  "store_nbr": 1,
  "family": "GROCERY I",
  "date": "2017-08-01",
  "features": [0.0, ...],  // 26 features
  "horizon": 90
}

// Response
{
  "store_nbr": 1,
  "family": "GROCERY I",
  "date": "2017-08-01",
  "prediction": 1234.56,
  "cached": true,
  "latency_ms": 0.5
}
```

### ONNX Inference
- Load model from `models/lightgbm_model.onnx`
- Pre-allocate input/output tensors
- Thread-safe with mutex
- Sub-millisecond inference

### Redis Caching
- Cache key: `pred:v1:{store}:{family}:{date}:{horizon}`
- TTL: 1 hour
- TinyLFU local cache layer (10,000 items)
- Return `cached: true` for cache hits

### Performance
- P95 latency < 10ms with warm cache
- P99 latency < 50ms cold
- Handle 100 RPS sustained

## Constraints
- Go 1.22+
- chi router
- onnxruntime_go for inference
- go-redis for caching
- zerolog for logging

## Verification
- Health endpoint returns 200
- Predict returns valid float prediction
- Cache hit on repeated requests
- Latency benchmarks pass
