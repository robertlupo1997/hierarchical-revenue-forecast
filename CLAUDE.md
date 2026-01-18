# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-LOB Revenue Forecasting System (MLRF) - a production-grade hierarchical time series forecasting system with SHAP explainability. Uses Kaggle Store Sales dataset (54 stores × 33 product families) as proxy for multi-LOB revenue prediction.

## Architecture

Four-service polyglot system:

```
mlrf-data (Python/Polars)     → Data ingestion, feature engineering, hierarchy construction
mlrf-ml (Python)              → Model training, hierarchical reconciliation, SHAP computation
mlrf-api (Go)                 → ONNX inference, Redis caching, REST endpoints
mlrf-dashboard (TypeScript)   → React + shadcn/ui + visx visualization
```

**Data Flow**: Kaggle CSV → Polars preprocessing → Feature matrix → LightGBM/statsforecast training → ONNX export → Go inference → React dashboard

**Hierarchy Structure**: Total → Store (54) → Product Family (33) → Bottom level (1,782 series)

## Build & Run Commands

### Full System
```bash
docker-compose up -d                    # Start all services
docker-compose logs -f api              # Watch API logs
```

### Python Components (mlrf-data, mlrf-ml)
```bash
cd mlrf-data && pip install -e ".[dev]"  # Install with dev deps
python -m mlrf_data.download             # Download Kaggle data
python -m mlrf_data.features             # Build feature matrix
pytest mlrf-data/tests/                  # Run tests
ruff check mlrf-data/                    # Lint
```

### Go API
```bash
cd mlrf-api
go build ./cmd/server                    # Build
go test ./...                            # Run tests
./server                                 # Run (requires ONNX model)
```

### Dashboard
```bash
cd mlrf-dashboard
bun install                              # Install dependencies
bun run dev                              # Development server
bun run build                            # Production build
bun run typecheck                        # Type check
bun run lint                             # Lint
```

## Key Technical Decisions

- **Polars over Pandas**: Rust-backed, 80x faster for large datasets
- **statsforecast + hierarchicalforecast (Nixtla)**: Pure Python hierarchical forecasting, no R dependency
- **Go + ONNX Runtime**: Sub-10ms inference latency with pre-allocated tensors
- **Redis + TinyLFU**: Local cache layer for hot predictions
- **visx for SHAP waterfall**: shapjs lacks waterfall support, custom implementation needed

## ML Pipeline Notes

- **Target metric**: RMSLE (Root Mean Squared Logarithmic Error)
- **Forecast horizons**: 15, 30, 60, 90 days
- **Reconciliation**: MinTrace shrinkage method via hierarchicalforecast
- **Feature lags must match forecast horizon**: lag_90 for 90-day predictions
- **Walk-forward validation**: Use 90-day gaps between train/test splits

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/predict` | POST | Single prediction (returns cached if available) |
| `/predict/batch` | POST | Batch predictions |
| `/explain` | POST | SHAP waterfall data for a prediction |
| `/hierarchy` | GET | Full hierarchy tree with predictions |

## Data Files (gitignored)

```
data/raw/          # Kaggle competition files (train.csv, oil.csv, etc.)
data/processed/    # Cleaned Parquet files
data/features/     # Feature matrices
models/            # Trained artifacts (*.onnx, *.pkl, *.parquet)
```
