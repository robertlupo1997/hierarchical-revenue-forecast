# Spec: SHAP Explainability

## Job To Be Done
As an FP&A analyst, I need to understand WHY the model made a specific prediction so I can explain forecasts to executives.

## Requirements

### SHAP Computation
- Use TreeExplainer for LightGBM model
- feature_perturbation="tree_path_dependent" (no background data needed)
- Compute SHAP values for representative samples
- Store at `models/shap_values.npy`

### Feature Importance
- Global feature importance from mean absolute SHAP values
- Rank features by importance
- Store at `models/feature_importance.json`

### Waterfall Data
- Per-prediction waterfall format:
  - base_value: expected prediction before features
  - features: list of {name, value, shap_value, cumulative, direction}
  - prediction: final prediction
- Store pre-computed for API at `models/shap_data.json`

### Export Format
JSON structure for API:
```json
{
  "1_GROCERY I": {
    "base_value": 1234.5,
    "features": [
      {"name": "sales_lag_7", "value": 500, "shap_value": 123.4, "cumulative": 1357.9, "direction": "positive"},
      ...
    ],
    "prediction": 1500.0
  }
}
```

## Constraints
- No extreme SHAP values (abs < 1000)
- No NaN or Inf values
- Top 10 features shown in waterfall
- "Other" bucket for remaining features

## Verification
- SHAP base_value + sum(shap_values) ≈ prediction
- No NaN/Inf in SHAP data
- Feature importance ranking is sensible
