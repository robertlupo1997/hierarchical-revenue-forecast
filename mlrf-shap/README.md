# MLRF SHAP Service

Real-time SHAP explanation service for the Multi-LOB Revenue Forecasting System.

## Overview

This service provides on-demand SHAP (SHapley Additive exPlanations) computation for LightGBM model predictions via gRPC. Unlike pre-computed or mocked SHAP values, this service computes real explanations for any store-family-date combination.

## Requirements

- Python 3.10+
- LightGBM model in text format (not ONNX)

## Installation

```bash
# Install dependencies
pip install -e .

# Generate proto files (required before first run)
python generate_proto.py
```

## Usage

### Running the service

```bash
# Default settings
mlrf-shap --model /path/to/lightgbm_model.txt

# Custom port and workers
mlrf-shap --port 50051 --model /path/to/model.txt --workers 10 --log-level DEBUG
```

### Docker

```bash
# Build
docker build -t mlrf-shap .

# Run
docker run -p 50051:50051 -v /path/to/models:/models mlrf-shap
```

### Health Check

```bash
# Using grpc_health_probe
grpc_health_probe -addr=localhost:50051

# Using grpcurl
grpcurl -plaintext localhost:50051 shap.ShapService/Health
```

## API

### Explain

Compute SHAP values for a prediction.

```protobuf
rpc Explain(ExplainRequest) returns (ExplainResponse);
```

**Request:**
- `store_nbr` (int32): Store number
- `family` (string): Product family
- `date` (string): Date in YYYY-MM-DD format
- `features` (repeated float): 27 features matching model input

**Response:**
- `base_value` (double): Expected value (average prediction)
- `features` (repeated WaterfallFeature): Top contributing features
- `prediction` (double): Final prediction value

### Health

Check service health.

```protobuf
rpc Health(HealthRequest) returns (HealthResponse);
```

## Performance

- Typical latency: 50-200ms per explanation
- Throughput: ~50-100 RPS depending on hardware
- Memory: ~500MB (model + explainer)

## Feature Names

The service expects 27 features in this order:
1. year, month, day, dayofweek, dayofyear
2. is_mid_month, is_leap_year
3. oil_price, is_holiday, onpromotion, promo_rolling_7
4. cluster
5. sales_lag_1, sales_lag_7, sales_lag_14, sales_lag_28, sales_lag_90
6. sales_rolling_mean_7, sales_rolling_mean_14, sales_rolling_mean_28, sales_rolling_mean_90
7. sales_rolling_std_7, sales_rolling_std_14, sales_rolling_std_28, sales_rolling_std_90
8. family_encoded, type_encoded
