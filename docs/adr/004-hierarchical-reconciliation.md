# ADR-004: Hierarchical Reconciliation with MinTrace Shrinkage

## Status

Accepted as a decision, **not implemented in the pipeline.** The reconciliation functions exist as
standalone utilities in `mlrf-ml/src/mlrf_ml/reconciliation.py`. The training pipeline's hierarchy
step only counts stores, families, and series; it never imports or calls `reconcile_forecasts`. The
API's `/hierarchy` endpoint reads a precomputed JSON file whose generator uses historical mean sales
rather than model forecasts. No reconciled forecast is produced or persisted anywhere in this
repository, and no accuracy or timing figure below has been measured.

## Date

2026-01-15

## Context

The MLRF system is intended to forecast sales across a hierarchy of:

```
Total (1 series)
└── Store (54 series)
    └── Product Family (33 families × 54 stores = 1,782 series)
```

Independent forecasts at each level are **incoherent** - the sum of store forecasts doesn't equal the total forecast, and the sum of family forecasts within a store doesn't equal the store forecast. Users querying "Total revenue" and summing "All store revenues" would see different numbers, destroying trust.

### Requirements

1. **Coherence**: Forecasts must sum correctly across hierarchy levels
2. **Accuracy**: Reconciliation should improve (or not degrade) forecast accuracy
3. **Scalability**: Process 1,782 bottom-level series efficiently
4. **Uncertainty**: Maintain valid prediction intervals after reconciliation
5. **No R dependency**: Production environment cannot have R runtime

### Options Considered

1. **Bottom-Up (BU)**: Aggregate bottom-level forecasts upward
   - Pros: Simple, always coherent
   - Cons: Ignores information from aggregate-level forecasts

2. **Top-Down (TD)**: Disaggregate top-level forecast using historical proportions
   - Pros: Captures macro trends
   - Cons: Distorts bottom-level patterns, poor for sparse series

3. **MinTrace (Optimal Combination)**: Combine all forecasts using covariance-weighted reconciliation
   - Pros: Theoretically optimal, uses all information
   - Cons: Requires covariance estimation

4. **ERM (Empirical Risk Minimization)**: Machine learning approach
   - Pros: Can capture complex relationships
   - Cons: Computationally expensive, less interpretable

## Decision

We chose **MinTrace with shrinkage estimation** (`mint_shrink`) from the Nixtla `hierarchicalforecast` library.

### Key factors

1. **Optimal combination**: MinTrace finds the linear combination of base forecasts that minimizes trace of the reconciled forecast error covariance, giving theoretically optimal point forecasts.

2. **Shrinkage estimator**: The shrinkage variant (`mint_shrink`) uses a regularized covariance estimator that handles high-dimensional cases (1,782 series) where sample covariance is singular. It shrinks toward a diagonal target, balancing bias-variance tradeoff.

3. **Pure Python**: The `hierarchicalforecast` library is pure Python (NumPy/SciPy), eliminating R dependency required by the R `hts` package. Critical for Docker deployment.

4. **Nixtla ecosystem integration**: Works seamlessly with `statsforecast` and `mlforecast` for consistent API across the ML pipeline.

5. **Expected accuracy benefit**: the hierarchical-forecasting literature reports accuracy gains for
   MinTrace over bottom-up. **We have not measured this.** No reconciliation experiment, metric, or
   comparison result exists in this repository.

### Implementation

```python
from hierarchicalforecast.core import HierarchicalReconciliation
from hierarchicalforecast.methods import MinTrace

# Reconciliation methods to evaluate
methods = [
    BottomUp(),                           # Baseline
    TopDown(method="forecast_proportions"),
    MinTrace(method="mint_shrink"),       # Primary method
    MinTrace(method="ols"),               # Alternative
]

hrec = HierarchicalReconciliation(reconcilers=methods)
reconciled = hrec.reconcile(
    Y_hat_df=base_forecasts,  # All levels
    Y_df=actuals,              # Historical for covariance
    S=summing_matrix,          # Hierarchy structure
    tags=hierarchy_tags,
)
```

### Summing Matrix

The summing matrix `S` encodes hierarchy constraints:

```
S = [1  1  1  ... 1  1]      # Total = sum of all bottom
    [1  1  0  ... 0  0]      # Store 1 = sum of store 1 families
    [0  0  1  ... 0  0]      # Store 2 = sum of store 2 families
    ...
    [1  0  0  ... 0  0]      # Bottom series 1
    [0  1  0  ... 0  0]      # Bottom series 2
    ...
```

## Consequences

### Positive

- **Guaranteed coherence**: reconciled forecasts sum correctly by construction
- **No R runtime**: pure Python deployment in Docker
- **Method comparison is possible**: the utilities can evaluate several reconciliation strategies,
  though no such evaluation has been run

Accuracy improvement is not listed as a consequence, because it has not been measured. Interval
coherence is not claimed either: the reconciliation utility operates on point forecasts only, and
neither interval reconciliation nor coverage validation is implemented.

### Negative

- **Computational cost**: MinTrace requires O(n²) covariance estimation for n series. Its runtime
  has not been measured here, because the training pipeline does not run it.
- **Memory usage**: a full 1,782 × 1,782 covariance matrix is on the order of tens of MB.
- **Black box**: reconciliation weights are not directly interpretable

### Mitigations

- Reconciliation is intended to run once during training rather than at inference time
- Summing matrix and tags are saved for debugging
- Comparison with BottomUp would provide an interpretable baseline

## References

- [Wickramasuriya et al. (2019) - Optimal Forecast Reconciliation](https://robjhyndman.com/publications/mint/)
- [Nixtla hierarchicalforecast](https://nixtla.github.io/hierarchicalforecast/)
- [Forecasting: Principles and Practice - Chapter 11](https://otexts.com/fpp3/hierarchical.html)
