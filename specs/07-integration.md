# Spec: Integration & Deployment

## Job To Be Done
As a developer, I need to run the entire system locally with one command and verify end-to-end functionality.

## Requirements

### Docker Compose
Services:
- `redis` - Redis 7 Alpine for caching
- `api` - Go API with ONNX model
- `dashboard` - React app served by nginx

Dependencies:
- API depends on Redis (healthcheck)
- Dashboard depends on API

Volumes:
- `redis-data` for cache persistence
- `./models:/app/models:ro` for model files

### Health Checks
- Redis: `redis-cli ping` returns PONG
- API: `GET /health` returns 200
- Dashboard: `GET /` returns 200

### Environment Variables
- `REDIS_URL=redis://redis:6379`
- `VITE_API_URL=http://localhost:8080`

### Ports
- Redis: 6379
- API: 8080
- Dashboard: 3000

### End-to-End Tests
1. Predict endpoint returns valid prediction
2. Explain endpoint returns SHAP waterfall data
3. Hierarchy endpoint returns tree structure
4. Dashboard renders and fetches data
5. P95 latency < 10ms with warm cache

## Constraints
- `docker-compose up -d` starts everything
- `docker-compose down` stops cleanly
- No manual steps required after initial model training
- Works on Linux, macOS, Windows (WSL2)

## Verification
- All services start and pass health checks
- End-to-end API tests pass
- Latency benchmarks pass
- Dashboard accessible at http://localhost:3000
