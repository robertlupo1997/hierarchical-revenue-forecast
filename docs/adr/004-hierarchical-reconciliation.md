# ADR-004: Hierarchical Reconciliation with MinTrace Shrinkage

## Status

Accepted

## Date

2026-01-15

## Context

The MLRF system forecasts sales across a three-level hierarchy:

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

5. **Benchmarked performance**: MinTrace shrinkage improves RMSLE by 3-8% over bottom-up in our validation, with the largest gains at the Total and Store levels.

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

- **Guaranteed coherence**: All reconciled forecasts sum correctly by construction
- **3-8% RMSLE improvement**: MinTrace shrinkage outperforms naive methods
- **Valid intervals**: Reconciled intervals maintain coverage properties
- **No R runtime**: Pure Python deployment in Docker
- **Method comparison**: Can evaluate multiple reconciliation strategies and pick best

### Negative

- **Computational cost**: MinTrace requires O(n²) covariance estimation for n series. With 1,782 series, this adds ~30 seconds to training.
- **Memory usage**: Full covariance matrix is 1,782 × 1,782 floats (~25MB). Manageable but notable.
- **Black box**: Reconciliation weights are not directly interpretable

### Mitigations

- Reconciliation runs once during training, not at inference time
- Pre-reconciled forecasts cached in Parquet
- Summing matrix and tags saved for debugging
- Comparison with BottomUp provides interpretable baseline

## References

- [Wickramasuriya et al. (2019) - Optimal Forecast Reconciliation](https://robjhyndman.com/publications/mint/)
- [Nixtla hierarchicalforecast](https://nixtla.github.io/hierarchicalforecast/)
- [Forecasting: Principles and Practice - Chapter 11](https://otexts.com/fpp3/hierarchical.html)
