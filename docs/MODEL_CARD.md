# MLRF Model Card

> Read [LIMITATIONS.md](../LIMITATIONS.md) alongside this card. The performance sections below
> report no numbers, because no evaluation artifact is checked in to support any.

## Model Overview

| Property | Value |
|----------|-------|
| **Model Name** | MLRF unit-sales forecasting model |
| **Model Type** | LightGBM Gradient Boosting |
| **Version** | 0.1.0 (the version declared by every package in this repository) |
| **Framework** | LightGBM 4.3.0 or newer; the provided API image installs ONNX Runtime 1.18.0 |
| **Training Date** | Not recorded. The checked-in model artifact carries no training timestamp |
| **License** | None. This repository contains no LICENSE file |

---

## Intended Use

### Primary Use Cases

This is an experimental portfolio project, not a system validated for operational use. Its
implemented behaviour is:

- **Unit-sales prediction**: predicts the Kaggle dataset's `sales` target for a store-family-day.
  This is a unit-sales quantity. The repository contains no price data, no currency conversion,
  and no revenue calculation.
- **Feature attribution**: SHAP values describing each feature's additive contribution to the
  model output.

### Intended Users
- Reviewers evaluating this repository as a work sample
- Data science teams wanting a baseline store-sales regression to build on

### Out of Scope
- Operational demand, inventory, or staffing decisions. The evaluation described below does not
  establish forecast accuracy at any horizon.
- Individual customer-level predictions (model operates at store-family level)
- Causal inference (model identifies correlations, not causation)
- Multi-step-ahead forecasting. The model predicts one row at a time from features that include
  recent actual sales; see "Forecast Horizons" below.

---

## Training Data

### Data Source
**Kaggle Store Sales - Time Series Forecasting** competition dataset

### Data Characteristics

The dataset is not checked into this repository, so the properties below are the pipeline's
expectations rather than measured values. Record the observed values from a generated data-profile
artifact before publishing them.

| Property | Value |
|----------|-------|
| **Date Range** | Determined by the downloaded dataset; not verified here |
| **Total Rows** | Determined by the downloaded dataset and feature-row filtering; not verified here |
| **Stores** | 54 |
| **Product Families** | 33 |
| **Time Series** | 1,782 (54 stores × 33 families) |
| **Target** | `sales` (units), used unmodified |

For geographic and collection context, consult the competition's own dataset documentation.

### Product Families
The API's accepted family names are the authority here. They include `HOME AND KITCHEN I`,
`HOME AND KITCHEN II`, and `LIQUOR,WINE,BEER`; see
`mlrf-api/internal/handlers/validation.go` for the full case-sensitive list.

### Feature Engineering

**27 Total Features** (25 numeric + 2 categorical):

| Category | Features |
|----------|----------|
| **Date Features** | year, month, day, dayofweek, dayofyear, is_mid_month, is_leap_year |
| **External** | oil_price, is_holiday, onpromotion, promo_rolling_7 |
| **Store Metadata** | cluster |
| **Lag Features** | sales_lag_1, sales_lag_7, sales_lag_14, sales_lag_28, sales_lag_90 |
| **Rolling Statistics** | sales_rolling_mean_7, sales_rolling_mean_14, sales_rolling_mean_28, sales_rolling_mean_90, sales_rolling_std_7, sales_rolling_std_14, sales_rolling_std_28, sales_rolling_std_90 |
| **Categorical** | family, type |

`dayofweek` is the ISO weekday number, 1 (Monday) through 7 (Sunday). `dayofyear` is the ordinal
day, 1 through 365 or 366 in a leap year.

### Data Preprocessing
1. **Forward fill** for missing oil prices after temporal join
2. **No scaling**: numeric features are passed to LightGBM without repository-defined scaling
3. **Categorical dtypes**: `family` and `type` are converted to pandas `category` dtype and handled
   by LightGBM's native categorical support. No label encoding is performed.
4. **Null handling**: feature engineering drops the initial rows in each series that lack the
   maximum-horizon (90-day) lag. No per-row null percentage is computed.

---

## Model Architecture

### Algorithm
**LightGBM (Light Gradient Boosting Machine)**
- Gradient boosting decision tree ensemble
- Native categorical feature handling

### Hyperparameters

| Parameter | Value |
|-----------|-------|
| Objective | regression |
| Boosting Type | gbdt |
| Num Leaves | 63 |
| Learning Rate | 0.05 |
| Feature Fraction | 0.8 |
| Bagging Fraction | 0.8 |
| Bagging Frequency | 5 |
| Random Seed | 42 |

### Training Configuration
- **Validation Strategy**: walk-forward splits with 90-day validation windows and **no gap**
  (`gap_days=0`)
- **Early Stopping**: used, with a default patience of 50 rounds on the validation split
- **Target Transformation**: none. The model trains on raw `sales` with an RMSE training metric;
  RMSLE is computed afterwards from log1p-transformed predictions and targets.

---

## Performance Metrics

**No performance numbers are reported in this card, and none should be quoted from this
repository.** `models/metrics.json`, fold predictions, and validation datasets are absent, so
previously published figures (RMSLE 0.477, RMSE 214.58, MAE 58.04, and a fold RMSLE of 0.652)
cannot be reproduced or audited from a clean clone. Identical values appearing in API handler
code are hard-coded literals, not evaluation output.

More importantly, the current evaluation would not support horizon accuracy even if its artifacts
were present. Lag and rolling features are built over the complete series before any split, and
validation uses no gap. After the first held-out day, `sales_lag_1` and the rolling windows contain
actual sales from inside the validation window. This is a **rolling one-step evaluation**, in which
each day's actual is observed before the next prediction, not a forecast made once at a fixed
origin. The checked-in feature-importance artifact is consistent with this: short-history features
dominate.

To publish a metric from this repository, run the training pipeline and commit the resulting
metrics artifact together with the code revision and dataset snapshot that produced it. A metric
computed on the walk-forward tuning split must be labelled as a tuning-split result, not as a
held-out score.

### Forecast Horizons

**The model does not support multiple forecast horizons.** One feature vector produces one scalar
prediction, and horizon is not a model input. In training, the horizon list is collapsed to
`max_horizon` and used only as the validation-window length; the label is always the current row's
`sales`, never `sales[t+h]`.

At serving time, `/predict/simple` accepts a `horizon` field of 15, 30, 60, or 90 and uses it in the
cache key, but the value never reaches the model. No horizon-specific accuracy has been evaluated,
so this card makes no claim that accuracy differs between horizons.

### Hierarchical Reconciliation
- **Status**: not applied. The training pipeline's hierarchy step counts stores, families, and
  series; it never imports or calls `reconcile_forecasts`.
- **Available utilities**: MinTrace shrinkage, bottom-up, top-down, and OLS reconciliation exist as
  standalone functions in `mlrf-ml/src/mlrf_ml/reconciliation.py`. No comparison between them has
  been run or recorded.
- **Consistency check**: the standalone helper uses an absolute tolerance of 1e-6 and currently
  verifies only the total.
- **Structure**: Total, 54 Store aggregates, 33 Family aggregates, and 1,782 Store × Family bottom
  series. Store and Family aggregates are parallel cross-sections, not a Store -> Family chain.

---

## Explainability

### SHAP Integration
The model includes SHAP (SHapley Additive exPlanations) for prediction interpretability:
- **Explainer Type**: TreeExplainer (optimized for gradient boosting)
- **Visualization**: Waterfall charts showing feature contributions
- **API Endpoint**: `/explain` returns SHAP values for a prediction

SHAP values describe association between a feature and the model's output. They are not evidence of
a causal mechanism in the world.

### Top Feature Importance

From the checked-in `models/feature_importance.csv`:

1. `sales_rolling_mean_7`
2. `sales_lag_1`
3. `sales_lag_7`
4. `sales_lag_14`
5. `onpromotion`

`oil_price` ranks 22nd. The concentration of importance in one- and seven-day history is expected
given the rolling one-step evaluation described above.

---

## Limitations

See [LIMITATIONS.md](../LIMITATIONS.md) for the full list, including unimplemented features and
unverified behaviour. Model-specific points:

1. **Not a multi-horizon forecaster**: see "Forecast Horizons" above. This is the most important
   limitation of the model.
2. **Evaluation uses in-window actuals**: reported errors reflect one-step-ahead prediction, and
   would not carry over to a fixed-origin forecast.
3. **Temporal Scope**: the competition data ends in August 2017; the model does not capture later
   trends or disruptions.
4. **External Shocks**: cannot predict impacts of unprecedented events (pandemics, natural
   disasters, policy changes).
5. **Historical Data Requirement**: the default feature matrix drops the first 90 rows of each
   series so that the 90-day lag is present. No ablation establishes how much history is needed for
   a given accuracy level.
6. **Unevaluated subgroups**: performance on product families with many zero-sales days, on
   holidays, and across stores has not been measured in this repository.
7. **Serving does not restrict to trained series**: the full `/predict` endpoint accepts any
   positive store number together with caller-supplied features. Family names are restricted to the
   API's configured list.
8. **Future dates fall back to averages**: for a date beyond the feature file, the Go feature store
   returns an average vector for the store and family, so such requests do not produce a genuine
   forecast.

---

## Ethical Considerations

### Data Privacy
- **Data granularity**: the pipeline uses store-family-day fields and does not intentionally select
  customer identifiers. The training data is not checked in and the repository performs no PII
  scan, so this card cannot certify the absence of PII.

### Fairness
- No demographic or socioeconomic features are used, and no fairness or store-level parity analysis
  has been performed in this repository.
- The store `cluster` field is imported unchanged from the dataset's store metadata. How it was
  derived is not documented here.

### Responsible Use
- Predictions should **not** be the sole basis for staffing reductions
- Human oversight recommended for decisions affecting employment
- Model outputs are estimates, not guarantees
- Prediction intervals are a single global set of raw residual quantiles applied to every series and
  every prediction. Their coverage has never been checked, so they should not be relied on as 80% or
  95% intervals.

### Environmental Impact
- Training compute and inference cost have not been measured. Use the included load tests and time a
  training run in your target environment before quoting figures.

---

## Deployment

### Inference Environment
- **Runtime**: Go with ONNX Runtime 1.18.0, loaded as a shared library (not a static binary)
- **Latency Target**: P95 < 100ms, P99 < 200ms. These are targets; no measured result is checked in.
- **Caching**: Redis plus a local in-process map with TTL expiry and best-effort age-based eviction
- **Batch Support**: up to 100 predictions per request, executed as a serialized loop of single
  predictions

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/predict/simple` | POST | Single prediction with simplified input |
| `/predict` | POST | Single prediction with full features |
| `/predict/batch` | POST | Batch predictions (max 100) |
| `/explain` | POST | SHAP waterfall data |
| `/hierarchy` | GET | Hierarchy tree read from a precomputed JSON artifact |
| `/whatif` | POST | What-if parameter sensitivity. Its feature-index map is currently incorrect; see LIMITATIONS.md |

### Monitoring
- Prometheus metrics at `/metrics/prometheus`
- Grafana dashboards for latency, error rate, cache hit ratio
- Alerting rules for error rate and latency thresholds
- Cache hit and miss counters are aggregate and not labelled by tier

---

## Maintenance

### Retraining Recommendations
- **Frequency**: monthly, or on observed accuracy drift once a reproducible evaluation exists
- **Data Window**: include the most recent 4 years of data
- **Triggers**: new stores added, product family changes, significant accuracy drift

### Version History

| Version | Date | Changes | Metrics |
|---------|------|---------|---------|
| 0.1.0 | Not recorded | Initial prototype | None published; see Performance Metrics |

---

## References

### Data Source
- Kaggle Store Sales Competition: https://www.kaggle.com/competitions/store-sales-time-series-forecasting

### Libraries
- LightGBM: https://lightgbm.readthedocs.io/
- ONNX Runtime: https://onnxruntime.ai/
- SHAP: https://shap.readthedocs.io/
- hierarchicalforecast: https://nixtla.github.io/hierarchicalforecast/

### Model Cards Framework
- Mitchell et al. (2019). "Model Cards for Model Reporting"
- Google Model Cards: https://modelcards.withgoogle.com/

---

## Contact

For questions about this model:
- **Repository**: MLRF store unit-sales forecasting system
- **Documentation**: See `/docs/` directory
- **Issues**: Report via repository issue tracker
