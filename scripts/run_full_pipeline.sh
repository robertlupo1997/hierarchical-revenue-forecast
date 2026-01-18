#!/bin/bash
# Run the complete MLRF pipeline from raw data to running system
set -e

echo "=========================================="
echo "  MLRF Full Pipeline Execution"
echo "=========================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v python3 &> /dev/null; then
    echo "ERROR: python3 not found"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "ERROR: docker not found"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "ERROR: docker-compose not found"
    exit 1
fi

# Use docker compose or docker-compose depending on what's available
if docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

echo "Prerequisites OK"
echo ""

# Step 1: Create virtual environment and install Python packages
echo "Step 1/8: Setting up Python environment..."
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi
source .venv/bin/activate

pip install -q -e "./mlrf-data[dev]"
pip install -q -e "./mlrf-ml[dev]"
echo "  Python packages installed"

# Step 2: Download Kaggle data
echo ""
echo "Step 2/8: Downloading Kaggle data..."
if [ ! -f "data/raw/train.csv" ]; then
    python -m mlrf_data.download
    echo "  Data downloaded"
else
    echo "  Data already exists, skipping download"
fi

# Step 3: Preprocess raw data
echo ""
echo "Step 3/8: Preprocessing raw data..."
if [ ! -f "data/processed/train_preprocessed.parquet" ]; then
    python -m mlrf_data.preprocess
    echo "  Preprocessing complete"
else
    echo "  Preprocessed data already exists"
fi

# Step 4: Build feature matrix
echo ""
echo "Step 4/8: Building feature matrix..."
if [ ! -f "data/features/feature_matrix.parquet" ]; then
    python -m mlrf_data.features
    echo "  Feature matrix built"
else
    echo "  Feature matrix already exists"
    # Verify it has sufficient rows
    ROWS=$(python -c "import polars as pl; print(pl.read_parquet('data/features/feature_matrix.parquet').shape[0])")
    echo "  Feature matrix has $ROWS rows"
fi

# Step 5: Train ML models
echo ""
echo "Step 5/8: Training ML models..."
if [ ! -f "models/lightgbm_model.onnx" ]; then
    python -m mlrf_ml
    echo "  Models trained and exported"
else
    echo "  Models already exist"
fi

# Step 6: Validate model quality
echo ""
echo "Step 6/8: Validating model quality..."
if [ -f "models/metrics.json" ]; then
    python -c "
import json
with open('models/metrics.json') as f:
    metrics = json.load(f)
rmsle = metrics.get('rmsle', metrics.get('test_rmsle', 1.0))
print(f'  Model RMSLE: {rmsle:.4f}')
if rmsle > 0.5:
    print('  WARNING: RMSLE above 0.5 threshold')
else:
    print('  RMSLE within acceptable range')
"
else
    echo "  WARNING: No metrics.json found, skipping validation"
fi

# Step 7: Start Docker services
echo ""
echo "Step 7/8: Starting Docker services..."
$COMPOSE_CMD down 2>/dev/null || true
$COMPOSE_CMD up -d

# Wait for services to be healthy
echo "  Waiting for services to become healthy..."
MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    # Check API health
    if curl -s http://localhost:8081/health | grep -q "ok\|healthy" 2>/dev/null; then
        echo "  API is healthy"
        break
    fi
    sleep 2
    WAITED=$((WAITED + 2))
    echo "  Waiting... ($WAITED/${MAX_WAIT}s)"
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo "  WARNING: API did not become healthy within ${MAX_WAIT}s"
    echo "  Checking logs..."
    $COMPOSE_CMD logs api | tail -20
fi

# Wait for dashboard
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -s http://localhost:3000 | grep -q "html" 2>/dev/null; then
        echo "  Dashboard is healthy"
        break
    fi
    sleep 2
    WAITED=$((WAITED + 2))
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo "  WARNING: Dashboard did not become healthy within ${MAX_WAIT}s"
    echo "  Checking logs..."
    $COMPOSE_CMD logs dashboard | tail -20
fi

# Step 8: Run integration tests
echo ""
echo "Step 8/8: Running integration tests..."
if [ -x "$SCRIPT_DIR/integration_tests.sh" ]; then
    "$SCRIPT_DIR/integration_tests.sh"
else
    echo "  WARNING: integration_tests.sh not found or not executable"
fi

echo ""
echo "=========================================="
echo "  FULL PIPELINE COMPLETE"
echo "=========================================="
echo ""
echo "System is running at:"
echo "  - API: http://localhost:8081"
echo "  - Dashboard: http://localhost:3000"
echo ""
echo "To stop: $COMPOSE_CMD down"
