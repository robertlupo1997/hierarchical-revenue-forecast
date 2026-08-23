# Spec: ML Training

> **Status: partially implemented.** This is the original specification, kept as a record of intent.
> Not delivered: the statistical models are never called by the training pipeline, so no model
> selection happens; the 15/30/60/90-day horizons are not implemented (the label is never shifted to
> `sales[t+h]`); and there is no holdout RMSLE, because validation runs with no gap and its features
> contain actuals from inside the validation window. See LIMITATIONS.md.

## Job To Be Done
As a data scientist, I need to train forecasting models that achieve RMSLE < 0.5 on the holdout set and export them for production inference.

## Requirements

### Statistical Models
- AutoARIMA with weekly seasonality
- AutoETS with weekly seasonality
- MSTL with weekly + yearly seasonality
- SeasonalNaive as baseline
- Use statsforecast library

### LightGBM Model
- Gradient boosting for tabular features
- Hyperparameters: num_leaves=63, learning_rate=0.05, feature_fraction=0.8
- Early stopping with 50 rounds
- Walk-forward validation with 90-day gaps

### Model Comparison
- Cross-validate all models
- Compute RMSLE, MAPE, RMSE for each
- Select best model based on RMSLE
- Store metrics in `models/metrics.json`

### ONNX Export
- Export LightGBM model to ONNX format
- Validate ONNX predictions match original within 0.1%
- Store at `models/lightgbm_model.onnx`
- Store original at `models/lightgbm_model.pkl`

## Constraints
- Target metric: RMSLE (Root Mean Squared Logarithmic Error)
- Forecast horizons: 15, 30, 60, 90 days
- Must handle 1,782 bottom-level time series
- Model file size < 100MB for deployment

## Verification
- RMSLE < 0.5 on holdout set
- ONNX model matches LightGBM within 0.1%
- All model artifacts saved to `models/`
