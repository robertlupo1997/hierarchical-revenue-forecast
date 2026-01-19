# MLRF Production Readiness Implementation

You are in PRODUCTION mode. Your job is to implement production-readiness enhancements, one task per iteration.

## CRITICAL RULES

1. **Check progress.md first** - See what's already done
2. **Pick the NEXT incomplete task** - Follow the implementation order
3. **Complete ONE task per iteration** - Don't try to do everything
4. **Test your changes** - Run appropriate tests before committing
5. **Commit after each task** - Lock in progress with descriptive commits
6. **Update progress.md** - Track what you did

## Implementation Plan Reference

Read the full plan: `thoughts/shared/plans/2026-01-19_production-readiness.md`

## Task Order (Follow This Sequence)

### Phase 1: Security & Production Hardening (Tasks 1.1-1.6)
- [ ] **1.1** API Key Authentication middleware
- [ ] **1.2** CORS Restriction (whitelist origins)
- [ ] **1.3** Rate Limiting (token bucket, 100 req/sec)
- [ ] **1.4** Input Validation Enhancement (date format, family whitelist, batch limits)
- [ ] **1.5** Structured Error Responses (error codes, request IDs)
- [ ] **1.6** Kubernetes Deployment Manifests

### Phase 2: Observability (Tasks 2.1-2.4)
- [ ] **2.1** Prometheus Metrics Exporter
- [ ] **2.2** Grafana Dashboard
- [ ] **2.3** Distributed Tracing (OpenTelemetry)
- [ ] **2.4** Alerting Rules

### Phase 3: Testing (Tasks 3.1-3.3)
- [ ] **3.1** React Component Unit Tests (Vitest)
- [ ] **3.2** API Load Tests (k6)
- [ ] **3.3** Failure Scenario Tests

### Phase 4: UX Features (Tasks 4.1-4.4)
- [ ] **4.1** What-If Analysis
- [ ] **4.2** Store Comparison Mode
- [ ] **4.3** Mobile Responsive Design
- [ ] **4.4** Batch Prediction CSV Upload

### Phase 5: Documentation (Tasks 5.1-5.4)
- [ ] **5.1** Model Card
- [ ] **5.2** API Error Documentation
- [ ] **5.3** Architecture Decision Records (5 ADRs)
- [ ] **5.4** Setup Guide

## MANDATORY FIRST STEP

**Read progress.md to see current status:**

```bash
cat progress.md | grep -A 50 "Production Readiness"
```

If no "Production Readiness" section exists, you're starting fresh.

## Per-Task Workflow

### 1. Identify Next Task

Check progress.md for the last completed task. Pick the next one in sequence.

### 2. Implement the Task

Follow the detailed specs in `thoughts/shared/plans/2026-01-19_production-readiness.md`.

### 3. Test Changes

**Task 1.1 (API Auth):**
```bash
cd mlrf-api && go build ./cmd/server && go test ./internal/middleware/... -v
# Test with key: curl -H "X-API-Key: testkey" localhost:8081/metrics
# Test without: curl localhost:8081/metrics (should 401 when API_KEY set)
```

**Task 1.2 (CORS):**
```bash
cd mlrf-api && go build ./cmd/server
# Test with Origin header
curl -H "Origin: http://localhost:3000" -I localhost:8081/health
```

**Task 1.3 (Rate Limiting):**
```bash
cd mlrf-api && go test ./internal/middleware/... -v
# Verify with rapid requests
for i in {1..250}; do curl -s localhost:8081/health > /dev/null; done
```

**Task 1.4 (Validation):**
```bash
cd mlrf-api && go test ./internal/handlers/... -v
# Test invalid date
curl -X POST localhost:8081/predict/simple -d '{"store_nbr":1,"family":"GROCERY I","date":"invalid","horizon":90}'
```

**Task 1.5 (Error Responses):**
```bash
cd mlrf-api && go test ./internal/handlers/... -v
# Verify error structure
curl -X POST localhost:8081/predict/simple -d '{}' | jq '.error, .code'
```

**Task 1.6 (K8s Manifests):**
```bash
# Validate YAML syntax
for f in deploy/kubernetes/*.yaml; do python -c "import yaml; yaml.safe_load(open('$f'))"; done
```

**Task 2.1 (Prometheus):**
```bash
cd mlrf-api && go build ./cmd/server
curl localhost:8081/metrics/prometheus | head -20
```

**Task 2.2 (Grafana):**
```bash
# Validate dashboard JSON
python -c "import json; json.load(open('deploy/grafana/mlrf-dashboard.json'))"
```

**Task 2.3 (Tracing):**
```bash
cd mlrf-api && go build ./cmd/server && go test ./internal/tracing/... -v
```

**Task 2.4 (Alerting):**
```bash
python -c "import yaml; yaml.safe_load(open('deploy/prometheus/alerts.yml'))"
```

**Task 3.1 (React Tests):**
```bash
cd mlrf-dashboard && bun run test
```

**Task 3.2 (Load Tests):**
```bash
# Validate k6 script syntax
k6 run --dry-run mlrf-api/tests/load/predict.js 2>&1 | grep -q "execution" && echo "PASS"
```

**Task 3.3 (Failure Tests):**
```bash
cd mlrf-api && go test ./internal/handlers/... -v -run "Without"
```

**Task 4.1 (What-If):**
```bash
cd mlrf-api && go build ./cmd/server
cd mlrf-dashboard && bun run typecheck
```

**Task 4.2 (Comparison):**
```bash
cd mlrf-dashboard && bun run typecheck && bun run build
```

**Task 4.3 (Mobile):**
```bash
cd mlrf-dashboard && bun run typecheck && bun run build
```

**Task 4.4 (Batch Upload):**
```bash
cd mlrf-dashboard && bun run typecheck && bun run build
```

**Task 5.1-5.4 (Documentation):**
```bash
# Just verify files exist and are valid markdown
ls -la docs/MODEL_CARD.md docs/SETUP.md docs/adr/*.md
```

### 4. Commit Your Work

```bash
git add -A
git commit -m "[Feature] Task X.Y: Brief description"
```

### 5. Update progress.md

Add/update the Production Readiness section:

```markdown
## Production Readiness Implementation

### Completed Tasks
- [x] **1.1** API Key Authentication (commit abc123)
- [x] **1.2** CORS Restriction (commit def456)

### Current Task
- [ ] **1.3** Rate Limiting - IN PROGRESS

### Next Up
- [ ] **1.4** Input Validation Enhancement
```

## Task Implementation Details

### Task 1.1: API Key Authentication

**Create:** `mlrf-api/internal/middleware/auth.go`
```go
package middleware

func APIKeyAuth(next http.Handler) http.Handler {
    apiKey := os.Getenv("API_KEY")
    if apiKey == "" { return next } // Dev mode: no auth

    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.URL.Path == "/health" { next.ServeHTTP(w, r); return }

        key := r.Header.Get("X-API-Key")
        if key == "" { key = r.URL.Query().Get("api_key") }

        if key != apiKey {
            http.Error(w, `{"error":"unauthorized","code":"AUTH_REQUIRED"}`, 401)
            return
        }
        next.ServeHTTP(w, r)
    })
}
```

**Modify:** `mlrf-api/cmd/server/main.go` - Add middleware after CORS
**Modify:** `docker-compose.yml` - Add `API_KEY=${MLRF_API_KEY:-}` env var
**Modify:** `mlrf-dashboard/src/lib/api.ts` - Add X-API-Key header

### Task 1.2: CORS Restriction

**Modify:** `mlrf-api/cmd/server/main.go:122-135`
- Replace `Access-Control-Allow-Origin: *` with configurable whitelist
- Read origins from `CORS_ORIGINS` env var
- Default to `http://localhost:3000,http://localhost:4173`

### Task 1.3: Rate Limiting

**Create:** `mlrf-api/internal/middleware/ratelimit.go`
- Token bucket algorithm using `golang.org/x/time/rate`
- Per-IP limiting with configurable rate (default 100/sec, burst 200)
- Return 429 with Retry-After header when exceeded

**Modify:** `mlrf-api/go.mod` - Add `golang.org/x/time`
**Modify:** `mlrf-api/cmd/server/main.go` - Add rate limiter middleware

### Task 1.4: Input Validation Enhancement

**Modify:** `mlrf-api/internal/handlers/predict.go`
- Date format validation: `time.Parse("2006-01-02", req.Date)`
- Feature array length: must be exactly 27
- Family whitelist: validate against known families
- Batch size limit: max 100 predictions per request

**Create:** `mlrf-api/internal/handlers/validation.go` - Centralized validation helpers

### Task 1.5: Structured Error Responses

**Create:** `mlrf-api/internal/handlers/errors.go`
```go
type ErrorResponse struct {
    Error     string `json:"error"`
    Code      string `json:"code"`
    RequestID string `json:"request_id,omitempty"`
}

func WriteError(w http.ResponseWriter, r *http.Request, status int, msg, code string)
```

**Modify:** All handlers - Replace `http.Error()` with `WriteError()`

### Task 1.6: Kubernetes Deployment Manifests

**Create:** `deploy/kubernetes/api-deployment.yaml`
**Create:** `deploy/kubernetes/api-service.yaml`
**Create:** `deploy/kubernetes/redis-statefulset.yaml`
**Create:** `deploy/kubernetes/dashboard-deployment.yaml`
**Create:** `deploy/kubernetes/ingress.yaml`
**Create:** `docs/DEPLOYMENT.md` - K8s deployment guide

### Task 2.1: Prometheus Metrics Exporter

**Modify:** `mlrf-api/go.mod` - Add `github.com/prometheus/client_golang`
**Create:** `mlrf-api/internal/metrics/prometheus.go`
- Counters: `mlrf_requests_total{endpoint,method,status}`
- Histograms: `mlrf_request_duration_seconds{endpoint}`
- Gauges: `mlrf_cache_hits_total`, `mlrf_cache_misses_total`

**Modify:** `mlrf-api/cmd/server/main.go` - Add `/metrics/prometheus` endpoint

### Task 2.2: Grafana Dashboard

**Create:** `deploy/grafana/mlrf-dashboard.json`
- Panels: Request rate, P95/P99 latency, error rate, cache hit ratio
**Create:** `deploy/grafana/provisioning/dashboards.yml`
**Create:** `docker-compose.monitoring.yml` - Prometheus + Grafana stack

### Task 2.3: Distributed Tracing

**Modify:** `mlrf-api/go.mod` - Add OpenTelemetry packages
**Create:** `mlrf-api/internal/tracing/otel.go` - Tracing initialization
**Modify:** `docker-compose.monitoring.yml` - Add Jaeger container

### Task 2.4: Alerting Rules

**Create:** `deploy/prometheus/alerts.yml`
- HighErrorRate: > 1% 5xx errors
- HighLatency: P99 > 100ms
- LowCacheHitRate: < 50%
**Create:** `deploy/prometheus/prometheus.yml` - Prometheus config

### Task 3.1: React Component Unit Tests

**Modify:** `mlrf-dashboard/package.json` - Add vitest, @testing-library/react
**Create:** `mlrf-dashboard/vitest.config.ts`
**Create:** `mlrf-dashboard/src/test/setup.ts`
**Create:** `mlrf-dashboard/src/components/__tests__/HorizonSelect.test.tsx`
**Create:** `mlrf-dashboard/src/components/__tests__/ForecastChart.test.tsx`
**Create:** `mlrf-dashboard/src/components/__tests__/ModelComparison.test.tsx`
**Create:** `mlrf-dashboard/src/components/__tests__/HierarchyDrilldown.test.tsx`

### Task 3.2: API Load Tests

**Create:** `mlrf-api/tests/load/predict.js` - k6 load test script
- Ramp to 100 concurrent users
- Thresholds: P95 < 100ms, error rate < 1%

### Task 3.3: Failure Scenario Tests

**Modify:** `mlrf-api/internal/handlers/handlers_test.go`
- `TestPredictWithoutONNX` - Returns mock, not crash
- `TestPredictWithoutRedis` - Works without caching
- `TestPredictWithoutFeatureStore` - Uses zero features

### Task 4.1: What-If Analysis

**Create:** `mlrf-api/internal/handlers/whatif.go` - POST /whatif endpoint
**Create:** `mlrf-dashboard/src/components/WhatIfAnalysis.tsx`
- Sliders for oil price, promo flag, day of week
- Real-time prediction delta display
**Modify:** `mlrf-dashboard/src/pages/Dashboard.tsx` - Add component

### Task 4.2: Store Comparison Mode

**Create:** `mlrf-dashboard/src/components/ComparisonChart.tsx`
**Create:** `mlrf-dashboard/src/pages/Compare.tsx`
**Modify:** `mlrf-dashboard/src/App.tsx` - Add /compare route

### Task 4.3: Mobile Responsive Design

**Modify:** `mlrf-dashboard/src/pages/Dashboard.tsx`
- Update grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
**Modify:** `mlrf-dashboard/src/components/ForecastChart.tsx` - Responsive legend
**Modify:** `mlrf-dashboard/src/components/HierarchyDrilldown.tsx` - Mobile grid

### Task 4.4: Batch Prediction CSV Upload

**Create:** `mlrf-dashboard/src/components/BatchUpload.tsx`
- File dropzone, CSV parsing, progress indicator, results download
**Create:** `mlrf-dashboard/src/pages/Batch.tsx`
**Modify:** `mlrf-dashboard/src/App.tsx` - Add /batch route

### Task 5.1: Model Card

**Create:** `docs/MODEL_CARD.md`
- Model details, intended use, training data, performance metrics, limitations

### Task 5.2: API Error Documentation

**Modify:** `mlrf-api/README.md` - Add Error Codes section with all codes

### Task 5.3: Architecture Decision Records

**Create:** `docs/adr/001-polars-over-pandas.md`
**Create:** `docs/adr/002-go-onnx-inference.md`
**Create:** `docs/adr/003-visx-shap-waterfall.md`
**Create:** `docs/adr/004-hierarchical-reconciliation.md`
**Create:** `docs/adr/005-redis-tiered-caching.md`

### Task 5.4: Setup Guide

**Create:** `docs/SETUP.md`
- Prerequisites, Kaggle API setup, virtual env, data download, model training

## Completion Signal

When ALL tasks are complete, add to progress.md:

```
PRODUCTION_COMPLETE
```

Then output: `PRODUCTION_COMPLETE`

## DO NOT

- Skip tasks or do them out of order
- Implement multiple tasks in one iteration
- Forget to update progress.md
- Commit broken code (always test first)
- Add features not in the plan
- Install Go if it's not available - just write the code and note "Go not installed, tests skipped"
