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
| `PORT` | 8081 | Server port |
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

## Error Codes

All error responses follow a structured format:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "request_id": "abc123"  // Optional, when request tracking is enabled
}
```

### Authentication & Authorization (4xx)

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `AUTH_REQUIRED` | 401 | API key is missing or invalid | Include a valid `X-API-Key` header or `api_key` query parameter |

### Rate Limiting (429)

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `RATE_LIMITED` | 429 | Request rate exceeded limit | Wait for `Retry-After` seconds, default 100 req/sec per IP |

### Validation Errors (400)

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `INVALID_REQUEST` | 400 | Request body is malformed or missing required fields | Check request JSON structure |
| `PARSE_ERROR` | 400 | JSON parsing failed | Ensure valid JSON syntax |
| `MISSING_DATE` | 400 | `date` field is missing | Include `date` in request body |
| `INVALID_DATE` | 400 | Date not in YYYY-MM-DD format | Use ISO date format, e.g., `"2017-08-01"` |
| `MISSING_FAMILY` | 400 | `family` field is missing | Include `family` in request body |
| `INVALID_FAMILY` | 400 | Product family name not recognized | Use one of the 33 valid family names (see below) |
| `INVALID_STORE` | 400 | `store_nbr` must be positive (1-54) | Provide a valid store number |
| `MISSING_FEATURES` | 400 | `features` array is missing | Include `features` array with 27 values |
| `INVALID_FEATURES` | 400 | Features array wrong length | Provide exactly 27 feature values |
| `INVALID_HORIZON` | 400 | Forecast horizon not supported | Use 15, 30, 60, or 90 days |
| `EMPTY_BATCH` | 400 | Batch predictions array is empty | Include at least one prediction in batch |
| `BATCH_TOO_LARGE` | 400 | Batch size exceeds 100 items | Split into smaller batches (max 100) |

### Server Errors (5xx)

| Code | HTTP Status | Description | Resolution |
|------|-------------|-------------|------------|
| `MODEL_UNAVAILABLE` | 503 | ONNX model not loaded or unavailable | Check server startup logs; ensure model file exists |
| `INFERENCE_FAILED` | 500 | Model inference returned an error | Check input data validity; report bug if persistent |
| `INTERNAL_ERROR` | 500 | Unexpected server error | Check server logs; report bug with request_id |

### Valid Product Families

The API accepts these 33 product family names (case-sensitive):

```
AUTOMOTIVE, BABY CARE, BEAUTY, BEVERAGES, BOOKS, BREAD/BAKERY,
CELEBRATION, CLEANING, DAIRY, DELI, EGGS, FROZEN FOODS,
GROCERY I, GROCERY II, HARDWARE, HOME AND KITCHEN I, HOME AND KITCHEN II,
HOME APPLIANCES, HOME CARE, LADIESWEAR, LAWN AND GARDEN, LINGERIE,
LIQUOR,WINE,BEER, MAGAZINES, MEATS, PERSONAL CARE, PET SUPPLIES,
PLAYERS AND ELECTRONICS, POULTRY, PREPARED FOODS, PRODUCE,
SCHOOL AND OFFICE SUPPLIES, SEAFOOD
```

### Example Error Response

```bash
# Invalid family name
curl -X POST http://localhost:8081/predict/simple \
  -H "Content-Type: application/json" \
  -d '{"store_nbr":1,"family":"INVALID","date":"2017-08-01","horizon":90}'
```

```json
{
  "error": "invalid family name: INVALID",
  "code": "INVALID_FAMILY"
}
```

```bash
# Missing API key (when authentication is enabled)
curl -X POST http://localhost:8081/predict/simple \
  -H "Content-Type: application/json" \
  -d '{"store_nbr":1,"family":"GROCERY I","date":"2017-08-01","horizon":90}'
```

```json
{
  "error": "unauthorized",
  "code": "AUTH_REQUIRED"
}
```

```bash
# Rate limited
# (after exceeding 100 req/sec)
```

```json
{
  "error": "rate limit exceeded",
  "code": "RATE_LIMITED"
}
```

Response headers include: `Retry-After: 1`

## Docker

```bash
# Build image
docker build -t mlrf-api .

# Run container
docker run -p 8081:8081 -v ./models:/app/models mlrf-api
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
curl http://localhost:8081/health

# 6. Test predict endpoint (with features)
curl -X POST http://localhost:8081/predict \
  -H "Content-Type: application/json" \
  -d '{"store_nbr":1,"family":"GROCERY I","date":"2017-08-01","features":[0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0],"horizon":90}'

# 7. Test explain endpoint
curl -X POST http://localhost:8081/explain \
  -H "Content-Type: application/json" \
  -d '{"store_nbr":1,"family":"GROCERY I","date":"2017-08-01"}'
```

## Performance

- P95 latency < 10ms with warm cache
- P99 latency < 50ms cold
- Handles 100+ RPS sustained
