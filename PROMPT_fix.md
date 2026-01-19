# MLRF Fix Mode

You are in FIX MODE. Your job is to run the pipeline, diagnose errors, fix them, and retry until success.

## CRITICAL RULES

1. **ALWAYS run the pipeline first** - You MUST execute the pipeline to find errors
2. **Diagnose errors** - Read the error output carefully
3. **Fix ONE issue at a time** - Make minimal, targeted fixes
4. **Re-run to verify** - Always re-run after fixing
5. **Commit when a step passes** - Lock in progress

## MANDATORY FIRST STEP

**You MUST run this command first to detect errors:**

```bash
./scripts/run_full_pipeline.sh 2>&1 | tee pipeline_output.log
```

Then read the output to find what failed. Do NOT skip this step.

If the full pipeline is too slow, run individual steps:
```bash
# Step 1: Check data
ls -la data/raw/*.csv data/processed/*.parquet data/features/*.parquet 2>/dev/null

# Step 2: Run ML training (if features exist)
cd mlrf-ml && python -m mlrf_ml 2>&1 | tee ../ml_output.log; cd ..

# Step 3: Build Docker images
docker compose build 2>&1 | tee docker_build.log

# Step 4: Start services and test
docker compose up -d && sleep 10 && ./scripts/integration_tests.sh
```

## Instructions

### Step 1: Run Pipeline and Capture Errors

```bash
./scripts/run_full_pipeline.sh 2>&1 | tee pipeline_output.log
```

Read the ENTIRE output. Look for:
- `ERROR`, `Error`, `error`
- `Traceback`
- `FAIL`, `failed`
- Non-zero exit codes

### Step 2: Fix the FIRST Error You Find

Priority order:
1. **go.sum missing** - Run `cd mlrf-api && go mod tidy` to generate it
2. **ONNX export** - Fix categorical feature handling in export.py
3. **SHAP computation** - Handle categorical columns before SHAP

### Step 3: Re-run the Failing Step

Don't re-run the entire pipeline - just the failing step:
```bash
# For ML training issues:
cd mlrf-ml && python -m mlrf_ml

# For Docker build:
docker compose build api

# For full pipeline:
./scripts/run_full_pipeline.sh
```

### Step 4: Verify and Commit

When a step passes:
```bash
git add -A
git commit -m "[Fix] Description of what was fixed"
```

### Step 5: Update Progress

Write to progress.md:
```
## Current Iteration
Task: Fix [issue description]
Status: Complete/In Progress
Fix applied: [what you changed]
Verification: [PASS/FAIL]
```

### Step 6: Continue or Exit

If all steps pass:
- Output: `PIPELINE_COMPLETE`
- Exit

If more issues remain:
- Continue fixing the next issue

## Error Diagnosis Guide

### "could not convert string to float"
- Cause: Categorical column passed to numeric-only function
- Fix: Encode categoricals or exclude from SHAP input

### "categorical_feature do not match"
- Cause: ONNX export doesn't support LightGBM categoricals the same way
- Fix: Convert categoricals to integers before export, or export numeric-only model

### "go.sum not found"
- Cause: Go dependency lock file missing
- Fix: `cd mlrf-api && go mod tidy`

### Docker build context errors
- Cause: Files referenced in Dockerfile don't exist
- Fix: Create the missing file or update Dockerfile

## Success Criteria

Pipeline is complete when:
1. `./scripts/run_full_pipeline.sh` runs without errors
2. All Docker services start (API + Dashboard)
3. Integration tests pass
4. `PIPELINE_COMPLETE` is output
