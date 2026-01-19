# Multi-LOB Revenue Forecasting System (MLRF)

Production-grade revenue forecasting system with hierarchical reconciliation and SHAP explainability.

Uses the Kaggle Store Sales dataset (54 stores x 33 product families = 1,782 time series) as a proxy for multi-LOB revenue prediction.

## Quick Start

```bash
# 1. Download data (requires ~/.kaggle/kaggle.json)
cd mlrf-data && pip install -e ".[dev]"
python -m mlrf_data.download

# 2. Build feature matrix
python -m mlrf_data.features

# 3. Train models
cd ../mlrf-ml && pip install -e ".[dev]"
python -m mlrf_ml.train

# 4. Start system
cd .. && docker-compose up -d

# 5. Open dashboard
open http://localhost:3000
```

## Architecture

```
mlrf-data (Python/Polars)     -> Data ingestion, feature engineering, hierarchy
mlrf-ml (Python)              -> Model training, reconciliation, SHAP, ONNX export
mlrf-api (Go)                 -> ONNX inference, Redis cache, REST API
mlrf-dashboard (TypeScript)   -> React + visx + shadcn/ui
```

**Data Flow**: Kaggle CSV -> Polars preprocessing -> Feature matrix -> LightGBM/statsforecast training -> ONNX export -> Go inference -> React dashboard

**Hierarchy**: Total (1) -> Store (54) -> Product Family (33) -> Bottom level (1,782 series)

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/predict` | POST | Single prediction with caching |
| `/predict/batch` | POST | Batch predictions |
| `/explain` | POST | SHAP waterfall data |
| `/hierarchy` | GET | Full hierarchy tree with predictions |

### Example: Single Prediction

```bash
curl -X POST http://localhost:8081/predict \
  -H "Content-Type: application/json" \
  -d '{
    "store_nbr": 1,
    "family": "GROCERY I",
    "date": "2017-08-01",
    "features": [0.0, 0.0, ...],
    "horizon": 90
  }'
```

### Example: SHAP Explanation

```bash
curl -X POST http://localhost:8081/explain \
  -H "Content-Type: application/json" \
  -d '{
    "store_nbr": 1,
    "family": "GROCERY I",
    "date": "2017-08-01"
  }'
```

## Development

### Python (mlrf-data, mlrf-ml)

```bash
# Setup
python3 -m venv .venv
source .venv/bin/activate
cd mlrf-data && pip install -e ".[dev]"
cd ../mlrf-ml && pip install -e ".[dev]"

# Run tests
pytest mlrf-data/tests/ -v
pytest mlrf-ml/tests/ -v

# Lint
ruff check mlrf-data/ mlrf-ml/
```

### Go API

```bash
cd mlrf-api
go build ./cmd/server
go test ./... -v
./server  # Requires ONNX model in ../models/
```

### Dashboard

```bash
cd mlrf-dashboard
bun install
bun run dev        # Development server on :5173
bun run build      # Production build
bun run typecheck  # Type check
bun run lint       # Lint
```

### Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop all services
docker-compose down
```

## Performance Targets

- API P95 latency: <10ms (with Redis cache)
- Dashboard load: <2s
- Model RMSLE: <0.5 (competitive with Kaggle top 20%)

## Data Files (gitignored)

```
data/raw/          # Kaggle competition files (train.csv, oil.csv, etc.)
data/processed/    # Cleaned Parquet files
data/features/     # Feature matrices
models/            # Trained artifacts (*.onnx, *.pkl, *.parquet)
```

## Key Technical Decisions

- **Polars over Pandas**: Rust-backed, 80x faster for large datasets
- **statsforecast + hierarchicalforecast (Nixtla)**: Pure Python hierarchical forecasting
- **Go + ONNX Runtime**: Sub-10ms inference latency with pre-allocated tensors
- **Redis + TinyLFU**: Local cache layer for hot predictions
- **visx for SHAP waterfall**: Custom implementation (shapjs lacks waterfall support)

## Project Structure

```
mlrf/
|-- docker-compose.yml
|-- CLAUDE.md             # AI coding assistant instructions
|-- AGENTS.md             # Operational guide
|-- IMPLEMENTATION_PLAN.md
|
|-- mlrf-data/            # Data processing (Python/Polars)
|   |-- src/mlrf_data/
|   |   |-- download.py
|   |   |-- preprocess.py
|   |   |-- features.py
|   |   |-- hierarchy.py
|   +-- tests/
|
|-- mlrf-ml/              # ML training (Python)
|   |-- src/mlrf_ml/
|   |   |-- models/
|   |   |-- reconciliation.py
|   |   |-- explainability.py
|   |   |-- export.py
|   +-- tests/
|
|-- mlrf-api/             # Go inference API
|   |-- cmd/server/
|   |-- internal/
|   |   |-- handlers/
|   |   |-- inference/
|   |   +-- cache/
|   +-- Dockerfile
|
|-- mlrf-dashboard/       # React frontend
|   |-- src/
|   |   |-- components/
|   |   |-- pages/
|   |   +-- lib/
|   +-- Dockerfile
|
|-- models/               # Trained artifacts (gitignored)
+-- data/                 # Data files (gitignored)
```

## License

MIT
