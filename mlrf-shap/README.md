# MLRF SHAP Service

SHAP explanation service for the MLRF unit-sales forecasting system.

## Overview

This service computes SHAP (SHapley Additive exPlanations) values for LightGBM model predictions on
demand, over an **HTTP JSON API**. Despite the port number, it does not speak gRPC. It computes
explanations for any store-family-date combination it is given features for, rather than serving
pre-computed values.

Its latency, throughput, and memory footprint have not been measured; see LIMITATIONS.md.

## Requirements

- Python 3.10+
- LightGBM model in text format (not ONNX)

## Installation

```bash
# Install dependencies
pip install -e .
```

No protobuf generation step is required, and this package has no protobuf dependency.

## Usage

### Running the service

```bash
# Default settings
mlrf-shap --model /path/to/lightgbm_model.txt

# Custom port and log level
mlrf-shap --port 50051 --model /path/to/model.txt --log-level DEBUG
```

The CLI accepts `--port`, `--model`, and `--log-level`. There is no `--workers` option.

### Docker

```bash
# Build
docker build -t mlrf-shap .

# Run
docker run -p 50051:50051 -v /path/to/models:/models mlrf-shap
```

### Health Check

```bash
curl http://localhost:50051/health
```

## API

The service exposes a JSON API over HTTP.

### `POST /explain`

Compute SHAP values for a prediction.

**Request body:**
- `store_nbr` (int): Store number
- `family` (string): Product family
- `date` (string): Date in YYYY-MM-DD format
- `features` (array of float): 27 features matching model input

**Response body:**
- `base_value` (float): Expected value (average prediction)
- `features` (array): Top contributing features
- `prediction` (float): Final prediction value

### `GET /health`

Returns service health as JSON.

## Performance

Not measured. Latency, throughput, and memory depend on hardware and model size; benchmark on your
target hardware before quoting figures.

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

**Naming is inconsistent across services.** This service and the Go feature store use
`family_encoded` / `type_encoded`, while the Go inference layer names the same two positions
`family` / `type`, and the Python feature pipeline produces neither: it trains on categorical
columns named `family` and `type`. See LIMITATIONS.md on training/serving parity.
