# MLRF Setup Guide

Complete guide for setting up the Multi-LOB Revenue Forecasting System (MLRF) from scratch.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Step-by-Step Setup](#step-by-step-setup)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Configure Kaggle API](#2-configure-kaggle-api)
  - [3. Set Up Python Environment](#3-set-up-python-environment)
  - [4. Download Data](#4-download-data)
  - [5. Build Feature Matrix](#5-build-feature-matrix)
  - [6. Train Models](#6-train-models)
  - [7. Run the System](#7-run-the-system)
- [Development Setup](#development-setup)
  - [Go API Development](#go-api-development)
  - [Dashboard Development](#dashboard-development)
  - [Python Development](#python-development)
- [Configuration](#configuration)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

| Software | Version | Purpose | Installation |
|----------|---------|---------|--------------|
| Python | 3.11+ | Data processing, ML training | [python.org](https://www.python.org/downloads/) |
| Docker | 20.10+ | Container runtime | [docs.docker.com](https://docs.docker.com/get-docker/) |
| Docker Compose | v2+ | Multi-container orchestration | Included with Docker Desktop |

### Optional (for Development)

| Software | Version | Purpose | Installation |
|----------|---------|---------|--------------|
| Go | 1.22+ | API development | [go.dev](https://go.dev/dl/) |
| Node.js | 18+ | Dashboard development | [nodejs.org](https://nodejs.org/) |
| Bun | 1.0+ | Faster package management | [bun.sh](https://bun.sh/) |

### System Requirements

- **Disk Space**: ~5 GB (data + models + Docker images)
- **RAM**: 8 GB minimum, 16 GB recommended for training
- **CPU**: Multi-core recommended for faster training

### Verify Prerequisites

```bash
# Check Python version (need 3.11+)
python3 --version

# Check Docker
docker --version
docker compose version

# Check optional tools
go version    # Optional: for API development
node --version  # Optional: for dashboard development
bun --version   # Optional: alternative to npm
```

---

## Quick Start

For experienced users, run the automated pipeline:

```bash
# Clone and enter directory
git clone <repository-url>
cd mlrf

# Configure Kaggle (see below for first-time setup)
# ~/.kaggle/kaggle.json must exist

# Run full pipeline
./scripts/run_full_pipeline.sh
```

This will:
1. Create Python virtual environment
2. Install dependencies
3. Download Kaggle data
4. Build feature matrix
5. Train models
6. Start Docker services
7. Run integration tests

**Result**: Dashboard at http://localhost:3000, API at http://localhost:8081

---

## Step-by-Step Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd mlrf
```

### 2. Configure Kaggle API

The data pipeline requires Kaggle API credentials to download the Store Sales dataset.

#### First-Time Kaggle Setup

1. **Create Kaggle Account**: Visit [kaggle.com](https://www.kaggle.com) and sign up

2. **Generate API Token**:
   - Go to [kaggle.com/settings](https://www.kaggle.com/settings)
   - Scroll to "API" section
   - Click "Create New Token"
   - This downloads `kaggle.json`

3. **Install Credentials**:
   ```bash
   # Create Kaggle directory
   mkdir -p ~/.kaggle

   # Move downloaded file (adjust path as needed)
   mv ~/Downloads/kaggle.json ~/.kaggle/

   # Set secure permissions (required on Linux/macOS)
   chmod 600 ~/.kaggle/kaggle.json
   ```

4. **Accept Competition Rules**:
   - Visit the [Store Sales Competition](https://www.kaggle.com/competitions/store-sales-time-series-forecasting)
   - Click "Join Competition" and accept the rules
   - This is required for the download to work

#### Verify Kaggle Setup

```bash
# Should print your Kaggle username
cat ~/.kaggle/kaggle.json | python3 -c "import sys,json; print(json.load(sys.stdin)['username'])"
```

### 3. Set Up Python Environment

Create an isolated Python environment for the project:

```bash
# Create virtual environment
python3 -m venv .venv

# Activate environment
source .venv/bin/activate    # Linux/macOS
# .venv\Scripts\activate     # Windows (cmd)
# .venv\Scripts\Activate.ps1 # Windows (PowerShell)

# Install data processing package
cd mlrf-data
pip install -e ".[dev]"

# Install ML training package
cd ../mlrf-ml
pip install -e ".[dev]"

# Return to project root
cd ..
```

**Verify Installation**:
```bash
python -c "import mlrf_data; import mlrf_ml; print('Packages installed successfully')"
```

### 4. Download Data

Download the Kaggle Store Sales dataset:

```bash
# Ensure virtual environment is active
source .venv/bin/activate

# Download data (~100 MB)
python -m mlrf_data.download
```

This creates:
```
data/
  raw/
    train.csv           # 3M rows of historical sales
    stores.csv          # Store metadata
    oil.csv             # Oil price time series
    holidays_events.csv # Holiday calendar
    transactions.csv    # Transaction counts
```

**Verify Download**:
```bash
ls -lh data/raw/
# Should show train.csv (~150 MB), stores.csv, oil.csv, etc.
```

### 5. Build Feature Matrix

Generate the feature matrix for model training:

```bash
# Preprocess raw data
python -m mlrf_data.preprocess

# Build feature matrix (~2.8M rows x 27 features)
python -m mlrf_data.features
```

This creates:
```
data/
  processed/
    train_preprocessed.parquet
  features/
    feature_matrix.parquet    # Main training data
    hierarchy.parquet         # Hierarchy structure
```

**Verify Feature Matrix**:
```bash
python -c "
import polars as pl
df = pl.read_parquet('data/features/feature_matrix.parquet')
print(f'Shape: {df.shape}')
print(f'Columns: {df.columns[:10]}...')
"
# Expected: Shape: (2800000+, 30+)
```

### 6. Train Models

Train the LightGBM model and export to ONNX:

```bash
# Train model (uses walk-forward validation)
python -m mlrf_ml

# Alternative: Skip SHAP computation for faster training
python -m mlrf_ml --skip-shap
```

This creates:
```
models/
  lightgbm_model.onnx       # ONNX model for Go inference
  lightgbm_model.pkl        # Python pickle for reference
  metrics.json              # Training metrics (RMSLE, etc.)
  shap_values.parquet       # SHAP explanations (if computed)
  prediction_intervals.json # Confidence interval parameters
```

**Training Output**:
```
Training LightGBM model...
Cross-validation RMSLE: 0.477 (+/- 0.012)
Final model RMSLE: 0.477
Exporting to ONNX...
Model saved to models/lightgbm_model.onnx
```

**Verify Model Quality**:
```bash
python -c "
import json
with open('models/metrics.json') as f:
    m = json.load(f)
print(f'RMSLE: {m.get(\"final_rmsle\", m.get(\"rmsle\", \"N/A\")):.4f}')
"
# Expected: RMSLE < 0.5
```

### 7. Run the System

Start all services with Docker Compose:

```bash
# Start services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f api       # API logs
docker compose logs -f dashboard # Dashboard logs
```

**Access the System**:
- **Dashboard**: http://localhost:3000
- **API Health**: http://localhost:8081/health
- **API Docs**: http://localhost:8081/metrics/prometheus

**Verify Services**:
```bash
# Test API health
curl http://localhost:8081/health
# Expected: {"status":"ok"}

# Test prediction endpoint
curl -X POST http://localhost:8081/predict/simple \
  -H "Content-Type: application/json" \
  -d '{"store_nbr":1,"family":"GROCERY I","date":"2017-01-01","horizon":30}'
```

**Stop Services**:
```bash
docker compose down
```

---

## Development Setup

### Go API Development

```bash
cd mlrf-api

# Install dependencies
go mod download

# Build
go build ./cmd/server

# Run tests
go test ./... -v

# Run with hot reload (requires air)
go install github.com/air-verse/air@latest
air

# Run server directly
./server  # Requires ONNX model in ../models/
```

**Environment Variables**:
```bash
export REDIS_URL="redis://localhost:6379"
export MODEL_PATH="../models/lightgbm_model.onnx"
export FEATURE_PATH="../data/features/feature_matrix.parquet"
export API_KEY=""  # Empty = no auth (dev mode)
```

### Dashboard Development

```bash
cd mlrf-dashboard

# Install dependencies (use bun for faster install)
bun install
# or: npm install

# Development server with hot reload
bun run dev
# or: npm run dev
# Opens at http://localhost:5173

# Type checking
bun run typecheck

# Linting
bun run lint

# Production build
bun run build

# Run unit tests
bun run test

# Run E2E tests (requires Playwright)
bunx playwright install chromium
bun run test:e2e
```

### Python Development

```bash
# Activate virtual environment
source .venv/bin/activate

# Run mlrf-data tests
cd mlrf-data
pytest tests/ -v
ruff check src/

# Run mlrf-ml tests
cd ../mlrf-ml
pytest tests/ -v
ruff check src/

# Format code
ruff format src/
```

---

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# API Authentication (leave empty for dev mode)
MLRF_API_KEY=

# CORS (comma-separated origins)
MLRF_CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# Rate Limiting
MLRF_RATE_LIMIT_RPS=100
MLRF_RATE_LIMIT_BURST=200

# Redis
REDIS_URL=redis://localhost:6379

# Tracing (optional)
OTEL_ENABLED=false
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### Docker Compose Profiles

```bash
# Production (default)
docker compose up -d

# With monitoring (Prometheus, Grafana, Jaeger)
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d

# Access monitoring:
# - Prometheus: http://localhost:9090
# - Grafana: http://localhost:3001 (admin/admin)
# - Jaeger: http://localhost:16686
```

### Changing Grafana Credentials

The default Grafana credentials are `admin/admin`. For security, change these before exposing Grafana externally.

#### Method 1: Via Grafana UI

1. Log in to Grafana at http://localhost:3001 with `admin/admin`
2. On first login, you'll be prompted to change the password
3. Enter a new secure password

#### Method 2: Via Environment Variables

Set credentials before starting the container:

```bash
# In docker-compose.monitoring.yml or docker-compose.yml
services:
  grafana:
    environment:
      - GF_SECURITY_ADMIN_USER=your_username
      - GF_SECURITY_ADMIN_PASSWORD=your_secure_password
```

Or use a `.env` file:

```bash
# .env
GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_PASSWORD=your_secure_password
```

Then reference in docker-compose:

```yaml
services:
  grafana:
    env_file:
      - .env
```

#### Method 3: Disable Default Admin Login

For production, disable the default admin:

```bash
environment:
  - GF_SECURITY_DISABLE_INITIAL_ADMIN_CREATION=true
  - GF_AUTH_ANONYMOUS_ENABLED=false
```

Then configure an external auth provider (LDAP, OAuth, etc.).

### Quality Gates

Edit `quality_gates.yaml` to adjust thresholds:

```yaml
model:
  rmsle_threshold: 0.5
  reconciliation_tolerance: 0.01

api:
  p95_latency_ms: 10
  p99_latency_ms: 50

data:
  null_ratio_threshold: 0.01
  min_rows: 1000000
```

---

## Verification

Run the complete verification suite:

```bash
# Full pipeline test
./scripts/run_full_pipeline.sh

# Integration tests only
./scripts/integration_tests.sh

# Generate verification report
python scripts/generate_verification_report.py
```

### Expected Results

| Check | Expected |
|-------|----------|
| Model RMSLE | < 0.5 |
| API P95 Latency | < 15ms |
| Feature Matrix Rows | > 2.8M |
| API Health | `{"status":"ok"}` |
| Dashboard Load | < 2s |

---

## Troubleshooting

### Kaggle Download Fails

**Error**: `403 - Forbidden`
```bash
# Solution: Accept competition rules
# Visit: https://www.kaggle.com/competitions/store-sales-time-series-forecasting
# Click "Join Competition"
```

**Error**: `kaggle.json not found`
```bash
# Check file exists and has correct permissions
ls -la ~/.kaggle/kaggle.json
# Should show: -rw------- (600 permissions)

# Fix permissions
chmod 600 ~/.kaggle/kaggle.json
```

### Docker Issues

**Error**: `Cannot connect to Docker daemon`
```bash
# Start Docker Desktop (macOS/Windows)
# Or start Docker service (Linux):
sudo systemctl start docker
```

**Error**: `Port 3000/8081 already in use`
```bash
# Find process using port
lsof -i :3000
lsof -i :8081

# Kill process or change ports in docker-compose.yml
```

### Model Training Fails

**Error**: `Out of memory`
```bash
# Train with reduced data or skip SHAP
python -m mlrf_ml --skip-shap

# Or increase system swap space
```

**Error**: `ONNX export failed`
```bash
# Ensure compatible versions
pip install onnx==1.16.0 onnxmltools==1.12.0 skl2onnx==1.16.0
```

### API Issues

**Error**: `ONNX model not found`
```bash
# Verify model exists
ls -la models/lightgbm_model.onnx

# Retrain if needed
python -m mlrf_ml
```

**Error**: `Connection refused on port 8081`
```bash
# Check if API container is running
docker compose ps api

# View API logs
docker compose logs api

# Restart API
docker compose restart api
```

### Dashboard Issues

**Error**: `Mock data warning shown`
- This is normal when the API is unavailable
- Ensure API is running: `curl http://localhost:8081/health`
- Check browser console for CORS errors

**Error**: `Blank page`
```bash
# Rebuild dashboard
docker compose build dashboard
docker compose up -d dashboard
```

---

## Next Steps

After setup is complete:

1. **Explore the Dashboard**: Navigate through stores, families, and time horizons
2. **Try What-If Analysis**: Adjust oil prices and promotions to see forecast changes
3. **Compare Stores**: Use the Compare page to benchmark performance
4. **Review API Documentation**: See `mlrf-api/README.md` for endpoint details
5. **Understand the Architecture**: Read `docs/adr/` for design decisions
6. **Deploy to Production**: Follow `docs/DEPLOYMENT.md` for Kubernetes setup

---

## Support

- **Documentation**: Check the `docs/` directory
- **Architecture Decisions**: See `docs/adr/`
- **Model Details**: See `docs/MODEL_CARD.md`
- **Issues**: Open an issue on GitHub

---

## File Reference

| Path | Description |
|------|-------------|
| `mlrf-data/` | Data processing package (Polars) |
| `mlrf-ml/` | ML training package (LightGBM, ONNX) |
| `mlrf-api/` | Go inference API |
| `mlrf-dashboard/` | React frontend |
| `scripts/` | Pipeline automation scripts |
| `deploy/` | Kubernetes and monitoring configs |
| `data/` | Raw and processed data (gitignored) |
| `models/` | Trained models (gitignored) |
