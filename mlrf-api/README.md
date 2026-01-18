# MLRF Go API

High-performance inference API for the Multi-LOB Revenue Forecasting System.

## Features

- ONNX Runtime inference for LightGBM models
- Redis caching with TinyLFU local cache layer
- RESTful API endpoints for predictions and SHAP explanations
- Sub-10ms latency for cached predictions
- Docker support

## Requirements

- Go 1.22+
- ONNX Runtime 1.17.1
- Redis 7+ (optional, for caching)

## Quick Start

```bash
# Download dependencies
go mod download

# Run tests
go test ./... -v

# Build
go build -o server ./cmd/server

# Run server
./server
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8080 | Server port |
| `MODEL_PATH` | models/lightgbm_model.onnx | Path to ONNX model |
| `REDIS_URL` | redis://localhost:6379 | Redis connection URL |
| `ONNX_LIB_PATH` | libonnxruntime.so | Path to ONNX Runtime library |
| `SHAP_DATA_PATH` | models/shap_data.json | Path to pre-computed SHAP values |
| `HIERARCHY_DATA_PATH` | models/hierarchy_data.json | Path to hierarchy data |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/predict` | POST | Single prediction |
| `/predict/batch` | POST | Batch predictions |
| `/explain` | POST | SHAP waterfall data |
| `/hierarchy` | GET | Hierarchy tree |
| `/metrics` | GET | Server metrics |

### Predict Request

```json
{
  "store_nbr": 1,
  "family": "GROCERY I",
  "date": "2017-08-01",
  "features": [0.0, 0.0, ...],  // 27 features
  "horizon": 90
}
```

### Predict Response

```json
{
  "store_nbr": 1,
  "family": "GROCERY I",
  "date": "2017-08-01",
  "prediction": 1234.56,
  "cached": true,
  "latency_ms": 0.5
}
```

## Docker

```bash
# Build image
docker build -t mlrf-api .

# Run container
docker run -p 8080:8080 -v ./models:/app/models mlrf-api
```

## Project Structure

```
mlrf-api/
├── cmd/server/main.go          # Entry point
├── internal/
│   ├── handlers/               # HTTP handlers
│   │   ├── handlers.go         # Handler struct
│   │   ├── health.go           # Health endpoint
│   │   ├── predict.go          # Prediction endpoints
│   │   └── explain.go          # SHAP explanation
│   ├── inference/
│   │   └── onnx.go             # ONNX Runtime wrapper
│   └── cache/
│       └── redis.go            # Redis cache layer
├── Dockerfile
├── go.mod
└── go.sum
```

## Verification

```bash
# 1. Build
go build ./cmd/server

# 2. Run tests
go test ./... -v

# 3. Lint (if golangci-lint installed)
golangci-lint run

# 4. Start server
./server &

# 5. Test health endpoint
curl http://localhost:8080/health

# 6. Test predict endpoint (with features)
curl -X POST http://localhost:8080/predict \
  -H "Content-Type: application/json" \
  -d '{"store_nbr":1,"family":"GROCERY I","date":"2017-08-01","features":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"horizon":90}'

# 7. Test explain endpoint
curl -X POST http://localhost:8080/explain \
  -H "Content-Type: application/json" \
  -d '{"store_nbr":1,"family":"GROCERY I","date":"2017-08-01"}'
```

## Performance

- P95 latency < 10ms with warm cache
- P99 latency < 50ms cold
- Handles 100+ RPS sustained
