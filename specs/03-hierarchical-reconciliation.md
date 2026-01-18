# Spec: Hierarchical Reconciliation

## Job To Be Done
As a forecaster, I need forecasts at all hierarchy levels (Total, Store, Family, Bottom) that sum correctly, using optimal reconciliation methods.

## Requirements

### Hierarchy Structure
- Level 0: Total (1 series) - sum of all sales
- Level 1: Store (54 series) - sum per store
- Level 2: Family (33 series) - sum per product family
- Level 3: Bottom (1,782 series) - store × family combinations

### Summing Matrix
- Create S matrix of shape (1870, 1782)
- S @ bottom_forecasts = all_level_forecasts
- Total row: all ones
- Store rows: indicator for each store's families
- Family rows: indicator for each family across stores
- Bottom rows: identity matrix

### Reconciliation Methods
Use hierarchicalforecast library with:
- BottomUp - simple aggregation
- TopDown (forecast_proportions) - distribute top-level
- MinTrace (mint_shrink) - optimal reconciliation
- MinTrace (ols) - OLS reconciliation

### Output
- Reconciled forecasts at `models/reconciled_forecasts.parquet`
- Columns: unique_id, ds, level, prediction, method
- Evaluation metrics per method per level

## Constraints
- Use hierarchicalforecast (pure Python, no R dependency)
- Reconciled forecasts must sum exactly within floating-point tolerance
- MinTrace shrinkage is preferred method

## Verification
- Total prediction = sum of store predictions (within 1%)
- Store predictions = sum of corresponding bottom predictions
- Reconciliation improves RMSLE vs. base forecasts
