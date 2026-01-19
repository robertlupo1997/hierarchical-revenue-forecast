# MLRF Next Steps Implementation

You are in NEXTSTEPS mode. Your job is to implement enhancements from the next steps plan, one task per iteration.

## CRITICAL RULES

1. **Check progress.md first** - See what's already done
2. **Pick the NEXT incomplete task** - Follow the implementation order
3. **Complete ONE task per iteration** - Don't try to do everything
4. **Test your changes** - Run appropriate tests before committing
5. **Commit after each task** - Lock in progress with descriptive commits
6. **Update progress.md** - Track what you did

## Implementation Plan Reference

Read the full plan: `thoughts/shared/plans/2026-01-18_mlrf-next-steps.md`

## Task Order (Follow This Sequence)

### Phase 1: Quick Wins (Day 1)
- [ ] **1.1** Remove docker-compose version attribute
- [ ] **1.2** Generate real hierarchy_data.json with 54 stores

### Phase 2: Real Data Integration (Days 2-3)
- [ ] **2.1** API Feature Store - Load real features from Parquet
- [ ] **2.2** Real Confidence Intervals from API

### Phase 3: Testing & Quality (Days 4-5)
- [ ] **3.1** E2E Tests for new dashboard features
- [ ] **3.2** API Integration Tests

### Phase 4: Infrastructure & Polish (Days 6-7)
- [ ] **4.1** GitHub Actions CI/CD Pipeline
- [ ] **4.2** More Export Formats (Excel, PDF)
- [ ] **4.3** Forecast Accuracy Visualization

## MANDATORY FIRST STEP

**Read progress.md to see current status:**

```bash
cat progress.md | grep -A 30 "Next Steps"
```

If no "Next Steps" section exists, you're starting fresh.

## Per-Task Workflow

### 1. Identify Next Task

Check progress.md for the last completed task. Pick the next one in sequence.

### 2. Implement the Task

Follow the detailed specs in `thoughts/shared/plans/2026-01-18_mlrf-next-steps.md`.

### 3. Test Changes

**Task 1.1 (docker-compose):**
```bash
docker compose config 2>&1 | grep -v "version.*obsolete" && echo "PASS"
```

**Task 1.2 (hierarchy JSON):**
```bash
python scripts/generate_hierarchy_json.py
curl -s http://localhost:8081/hierarchy | jq '.children | length'  # Should be 54
```

**Task 2.1 (Feature Store - Go):**
```bash
cd mlrf-api && go build ./cmd/server && go test ./internal/features/...
```

**Task 2.2 (Confidence Intervals):**
```bash
curl -s -X POST http://localhost:8081/predict/simple \
  -H "Content-Type: application/json" \
  -d '{"store_nbr":1,"family":"GROCERY I","date":"2017-08-01","horizon":30}' | jq '.lower_95, .upper_95'
```

**Task 3.1 (E2E Tests):**
```bash
cd mlrf-dashboard && bun run test:e2e
```

**Task 3.2 (API Tests):**
```bash
cd mlrf-api && go test ./internal/handlers/... -v
```

**Task 4.1 (CI/CD):**
```bash
# Verify workflow file is valid YAML
python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
```

**Task 4.2 (Export Formats):**
```bash
cd mlrf-dashboard && bun run typecheck && bun run build
```

### 4. Commit Your Work

```bash
git add -A
git commit -m "[Feature] Task X.Y: Brief description of what was added"
```

### 5. Update progress.md

Add/update the Next Steps section:

```markdown
## Next Steps Implementation

### Completed Tasks
- [x] **1.1** Remove docker-compose version (commit abc123)
- [x] **1.2** Generate hierarchy_data.json (commit def456)

### Current Task
- [ ] **2.1** API Feature Store - IN PROGRESS

### Next Up
- [ ] **2.2** Real Confidence Intervals
```

## Task Implementation Details

### Task 1.1: Remove docker-compose version

**File:** `docker-compose.yml`
**Change:** Delete line 1 (`version: "3.8"`)

### Task 1.2: Generate hierarchy_data.json

**Create:** `scripts/generate_hierarchy_json.py`
**Run:** `python scripts/generate_hierarchy_json.py`
**Output:** `models/hierarchy_data.json` with 54 stores

### Task 2.1: API Feature Store

**Create:** `mlrf-api/internal/features/store.go`
**Modify:** `mlrf-api/internal/handlers/predict.go` - use feature store
**Modify:** `mlrf-api/go.mod` - add parquet-go dependency

### Task 2.2: Real Confidence Intervals

**Modify:** `mlrf-ml/src/mlrf_ml/train.py` - compute intervals
**Modify:** `mlrf-api/internal/handlers/predict.go` - add CI fields
**Modify:** `mlrf-dashboard/src/hooks/useForecastData.ts` - use API CIs

### Task 3.1: E2E Tests

**Modify:** `mlrf-dashboard/e2e/dashboard.spec.ts`
- Add tests for: horizon selector, date picker, CSV export, store search

### Task 3.2: API Integration Tests

**Modify:** `mlrf-api/internal/handlers/handlers_test.go`
- Add tests for: /predict/simple validation, CI fields

### Task 4.1: GitHub Actions CI/CD

**Create:** `.github/workflows/ci.yml`
- Jobs: test-python, test-go, test-dashboard, e2e-tests, docker-build

### Task 4.2: More Export Formats

**Modify:** `mlrf-dashboard/package.json` - add xlsx, jspdf dependencies
**Modify:** `mlrf-dashboard/src/lib/export.ts` - add Excel, PDF functions
**Modify:** `mlrf-dashboard/src/components/ForecastChart.tsx` - export dropdown

### Task 4.3: Forecast Accuracy Visualization

**Create:** `mlrf-api/internal/handlers/accuracy.go`
**Create:** `mlrf-dashboard/src/components/AccuracyChart.tsx`
**Modify:** `mlrf-ml/src/mlrf_ml/train.py` - generate accuracy_data.json

## Completion Signal

When ALL tasks are complete, add to progress.md:

```
NEXTSTEPS_COMPLETE
```

Then output: `NEXTSTEPS_COMPLETE`

## DO NOT

- Skip tasks or do them out of order
- Implement multiple tasks in one iteration
- Forget to update progress.md
- Commit broken code (always test first)
- Add features not in the plan
