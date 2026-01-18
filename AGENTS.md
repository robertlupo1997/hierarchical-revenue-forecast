# AGENTS.md - MLRF Operational Guide

This file contains project-specific operational knowledge. It is loaded each iteration and should be kept brief. Status updates belong in IMPLEMENTATION_PLAN.md, not here.

## Project Overview

Multi-LOB Revenue Forecasting System using Kaggle Store Sales dataset (54 stores × 33 families = 1,782 time series) with hierarchical reconciliation and SHAP explainability.

## Architecture

```
mlrf-data (Python/Polars)     → Data ingestion, features, hierarchy
mlrf-ml (Python)              → Training, reconciliation, SHAP, ONNX export
mlrf-api (Go)                 → ONNX inference, Redis cache, REST API
mlrf-dashboard (TypeScript)   → React + visx + shadcn/ui
```

## Build Commands

### Python (mlrf-data, mlrf-ml)
```bash
cd mlrf-data && pip install -e ".[dev]"
cd mlrf-ml && pip install -e ".[dev]"
pytest mlrf-data/tests/ -v
pytest mlrf-ml/tests/ -v
ruff check mlrf-data/ mlrf-ml/
```

### Go (mlrf-api)
```bash
cd mlrf-api && go build ./cmd/server
go test ./... -v
golangci-lint run
```

### TypeScript (mlrf-dashboard)
```bash
cd mlrf-dashboard && bun install
bun run typecheck
bun run lint
bun run build
```

### Integration
```bash
docker-compose up -d
docker-compose down
```

## Critical Patterns

### Use Polars, NOT Pandas
Polars is 80-100x faster. All data processing must use Polars native operations.

### Feature Engineering
- Lags must match forecast horizon (lag_90 for 90-day predictions)
- Use `.over()` for group-wise operations
- Drop nulls from lag features to prevent leakage

### Hierarchy Structure
- Total (1) → Store (54) → Family (33) → Bottom (1,782)
- Summing matrix S has shape (1870, 1782)

### SHAP
- Use TreeExplainer with `feature_perturbation="tree_path_dependent"`
- visx for waterfall charts (shapjs lacks waterfall support)

### Go API
- Pre-allocate ONNX tensors for performance
- Redis + TinyLFU local cache
- Cache key: `pred:v1:{store}:{family}:{date}:{horizon}`
- 27 input features (25 numeric + 2 categorical encoded)
- Mock data returned for explain/hierarchy when data files not present

## Discovered Issues

### Forward Fill After Join (Phase 1.1)
When joining time series data (e.g., oil prices) with training data, forward fill must be done AFTER the join, not before. The oil data may have gaps that don't match training dates.

### Virtual Environment Required
System Python is externally managed. Create venv with `python3 -m venv .venv` and activate before pip install.

### Go and Docker Not Available
Go and Docker are not installed in the WSL environment. Verification requires manual installation of Go 1.22+ and Docker.

## File Locations

- Specs: `specs/*.md`
- Feature matrix: `data/features/feature_matrix.parquet`
- Trained models: `models/`
- ONNX model: `models/lightgbm_model.onnx`
