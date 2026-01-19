# MLRF API Load Tests

This directory contains k6 load tests for the MLRF API.

## Prerequisites

Install k6:

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
    --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
    | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Windows
choco install k6

# Docker
docker run --rm -i grafana/k6 run - <script.js
```

## Test Scripts

| Script | Purpose | Duration |
|--------|---------|----------|
| `predict.js` | Main load test with ramp-up | ~5 minutes |
| `stress.js` | Find breaking point | ~10 minutes |
| `soak.js` | Long-running stability | 30+ minutes |

## Running Tests

### Basic Usage

```bash
# Ensure API is running
docker compose up -d

# Run main load test
k6 run predict.js

# Run with custom options
k6 run --vus 50 --duration 2m predict.js
```

### With API Key

```bash
# If API requires authentication
API_KEY=your-api-key k6 run predict.js

# Or with environment variable
export API_KEY=your-api-key
k6 run predict.js
```

### Against Different Environment

```bash
# Local development
k6 run predict.js

# Staging
API_URL=https://api-staging.mlrf.example.com k6 run predict.js

# Production (be careful!)
API_URL=https://api.mlrf.example.com API_KEY=prod-key k6 run predict.js
```

### Running Specific Tests

```bash
# Stress test (find limits)
k6 run stress.js

# Soak test (stability)
k6 run soak.js

# Shorter soak test
DURATION=10m k6 run soak.js
```

## Performance Thresholds

The tests enforce these SLOs:

| Metric | Threshold | Description |
|--------|-----------|-------------|
| `http_req_duration p(95)` | < 100ms | 95% of requests under 100ms |
| `http_req_duration p(99)` | < 200ms | 99% of requests under 200ms |
| `http_req_failed` | < 1% | Error rate under 1% |
| `predict_latency p(95)` | < 100ms | Single prediction under 100ms |
| `batch_latency p(95)` | < 500ms | Batch prediction under 500ms |
| `hierarchy_latency p(95)` | < 200ms | Hierarchy request under 200ms |

## Interpreting Results

### Passing Example

```
     ✓ predict: status is 200
     ✓ predict: latency < 100ms

     checks.....................: 100.00% ✓ 5000 ✗ 0
     http_req_duration..........: avg=12.5ms p(95)=45ms p(99)=78ms
     http_req_failed............: 0.00%   ✓ 0    ✗ 5000
     http_reqs..................: 5000    166.6/s
```

### Failing Example

```
     ✗ predict: status is 200
       ↳ 85% — ✓ 4250 / ✗ 750

     http_req_duration..........: avg=250ms p(95)=1.2s p(99)=2.5s
     ✗ http_req_failed...........: 15.00%  ✓ 750 ✗ 4250
     http_reqs...................: 5000    83.3/s
```

## Output Formats

### JSON Output

```bash
k6 run --out json=results.json predict.js
```

### InfluxDB (for Grafana dashboards)

```bash
k6 run --out influxdb=http://localhost:8086/k6 predict.js
```

### HTML Report (with k6-reporter)

```bash
k6 run --out json=results.json predict.js
# Then use k6-reporter to convert to HTML
```

## CI Integration

Add to GitHub Actions:

```yaml
- name: Run Load Tests
  uses: grafana/k6-action@v0.3.1
  with:
    filename: mlrf-api/tests/load/predict.js
  env:
    API_URL: http://localhost:8081
```

## Troubleshooting

### "API not healthy" Error

Ensure the API is running:

```bash
curl http://localhost:8081/health
```

### High Error Rate

1. Check API logs for errors
2. Verify Redis is running
3. Check if rate limiting is too aggressive

### Timeout Errors

1. Increase k6 timeout: `--http-timeout 30s`
2. Check for connection pool exhaustion
3. Verify no network issues

### Rate Limiting (429 Errors)

The API has rate limiting (100 req/sec default). Adjust test or increase limit:

```bash
# In docker-compose.yml
MLRF_RATE_LIMIT_RPS=500
```
