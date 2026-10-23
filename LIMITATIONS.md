# Limitations

This file records what MLRF does **not** do, what is unverified, and what it would take to verify
it. It exists because the repository's documentation previously claimed capabilities and numbers the
code does not support. Everything below is stated from the code as it currently stands.

If you are evaluating this repository, read this file first.

---

## 1. It is not a multi-horizon forecaster

This is the most important limitation, and the one most likely to be probed in an interview.

**What the docs used to say:** the model supports 15, 30, 60, and 90-day forecast horizons, with
accuracy degrading over longer horizons.

**What the code does:** feature engineering adds a lag equal to the nominal maximum horizon, but the
training label stays the current row's `sales`. It is never shifted to `sales[t+h]`. In training,
the horizon list is collapsed to `max_horizon` and used only as the length of the validation window.
One model then predicts each validation row's contemporaneous sales. At serving time, one feature
vector produces one scalar, and horizon is not a model input at all: `/predict/simple` validates the
horizon field and includes it in the cache key, but it never reaches the model.

**Correct description:** a rolling one-step regressor over unit sales.

**To verify a real horizon claim** you would need: a shifted label per horizon (or recursive
generation of future lags), one model or one conditioning mechanism per horizon, and an evaluation
at a fixed forecast origin.

## 2. The evaluation uses information unavailable at a forecast origin

Lag and rolling features are computed over the complete series before any train/validation split,
and cross-validation runs with `gap_days=0`. After the first held-out day, `sales_lag_1` and the
rolling windows contain actual sales from **inside** the validation window.

This is defensible as a rolling one-step evaluation, where each day's actual is observed before the
next prediction is made. It is not a forecast made once at a fixed origin, and its error figures
should not be read as horizon accuracy. The checked-in feature-importance artifact is consistent
with this: `sales_rolling_mean_7` and `sales_lag_1` dominate.

**To fix the evaluation** you would need a gap of at least the horizon between train and validation,
features built only from data available at the origin, and a demonstration that no post-origin
actual enters any feature.

## 3. No metric in this repository is reproducible from a clean clone

`models/metrics.json`, fold predictions, validation datasets, and any Kaggle submission are absent.
Previously published figures (RMSLE 0.477, RMSE 214.58, MAE 58.04, a fold RMSLE of 0.652, and a
"top 20% Kaggle" placement) cannot be reproduced or audited here. The matching numbers in
`mlrf-api/internal/handlers/health.go` are hard-coded literals, not evaluation output.

The walk-forward result the pipeline computes is a **tuning-split** metric. It has never been
labelled or treated as a held-out result in this repository, and should not be.

**To publish a metric** you would need to commit the metrics artifact together with the code
revision and dataset snapshot that produced it, and to hold out a split never used for tuning.

## 4. Claimed features that are not wired into the system

- **Hierarchical reconciliation (MinTrace)**: implemented as standalone utilities. The training
  pipeline's hierarchy step only counts stores, families, and series; it never imports or calls
  `reconcile_forecasts`. Nothing writes reconciled forecasts anywhere. No comparison against
  bottom-up or top-down has been run, so the previously claimed 3-8% RMSLE lift has no basis.
- **Statistical model comparison (AutoARIMA / ETS / SeasonalNaive)**: a standalone library wrapper
  that `train_pipeline` never calls. Its `skip_statistical` argument is documented but unused after
  declaration. The model-comparison table served by the API and the second, different table
  hard-coded in the dashboard are both illustrative constants.
- **`/hierarchy` predictions**: the endpoint reads a precomputed JSON file. That file's generator
  uses historical mean sales as the "prediction", multiplies by 30, and injects pseudo-random
  trends. These are not model outputs.
- **Prediction intervals**: a single global set of raw residual quantiles, computed across every
  store, family, and validation row, is added to every prediction. They are not horizon-, series-,
  or scale-aware, and their coverage has never been checked. Calling them 80% and 95% intervals is
  not supported. Cached simple responses omit the interval fields entirely.

## 5. This is unit sales, not revenue

The Kaggle target is carried through the code only as `sales`. No unit price, exchange rate, or
revenue conversion is loaded or modelled anywhere. The dashboard formats these values as currency,
which makes unit counts look like dollars. The repository name and package prefix still say
revenue; the model does not.

## 6. Training and serving do not agree on features

- Python trains categorical columns named `family` and `type`, using pandas category dtypes.
- The feature pipeline never creates `family_encoded` or `type_encoded`, but the Go Parquet reader
  looks for exactly those columns as optional. Missing optional columns read as zero, so the serving
  path supplies **category zero for every family and every store type**.
- The Go inference layer names those last two positions `family` and `type`, while its own test
  expects `family_encoded` and currently fails.
- The SHAP service uses `family_encoded` / `type_encoded`.

There is no golden-vector parity test asserting that the same input yields the same feature vector
and the same prediction through Python, ONNX, Go, and the dashboard.

## 7. Future-dated inference is an average lookup, not a forecast

Exact features exist only for historical rows. For a date beyond the feature file, the Go feature
store returns an **average vector** for that store and family across the entire file, including
averaged year, month, lags, promotion, and rolling values. The dashboard requests weekly future
dates, so every date past the end of the dataset receives essentially the same averaged vector and
therefore essentially the same prediction. The requested horizon changes the cache key but never the
model input.

## 8. The dashboard falls back to mock data

The dashboard substitutes mock data when hierarchy, metrics, forecast, or accuracy responses are
missing, and the API's `/accuracy` handler silently returns hard-coded results when its artifact is
absent, without an `is_mock` marker. The `/historical` handler fabricates weekly values when data is
unavailable and does set `is_mock`, but the dashboard's client type omits that field, so the flag is
discarded. When API intervals are absent, the dashboard invents ±10% and ±15% bands and still labels
them "80% CI" and "95% CI".

Consequence: a screenshot or a running demo does not by itself demonstrate a working prediction
path.

## 9. Health checks can call a broken deployment healthy

`/health` returns 200 and a top-level status of `healthy` when the ONNX model, Redis, feature store,
and SHAP service are all absent. A test asserts this behaviour. CI's Docker smoke test only curls
that endpoint, while the ONNX, feature, hierarchy, metrics, and interval artifacts it would need are
gitignored. A green smoke check therefore does not establish that prediction works.

## 10. Known defects

- **The what-if analysis edits the wrong features.** Its name-to-index map puts `oil_price` at 0,
  `onpromotion` at 1, and `sales_lag_7` at 9; the real vector has year, month, and day there. A user
  changing oil price is changing year. Several exposed controls (`is_payday`, `is_weekend`,
  `transactions`) are not model features at all.
- **The local cache is not concurrency-safe.** It is a plain Go map with no mutex, read and mutated
  on concurrent request paths. This is a data race that can panic with `concurrent map read and map
  write`. It is also neither TinyLFU nor LRU: eviction is a scan for entries older than half the
  TTL, which means the configured 10,000-entry size is not a strict bound.
- **Redis failure disables all caching.** Cache construction pings Redis and returns an error on
  failure, after which the server sets the whole cache, including the local tier, to nil. There is
  no local-only fallback.
- **The Parquet read loop treats every read error as EOF** and still marks the store as loaded, so a
  corrupt or truncated file yields a silently partial feature store.
- **Historical cache keys convert the store number to a Unicode rune** rather than decimal text.
- **`VITE_API_URL` cannot take effect at runtime.** The dashboard Dockerfile bakes the Vite bundle
  at build time, before the Compose runtime environment exists.
- **`PredictBatch` claims efficiency it does not have**: it loops over the mutex-serialized
  single-prediction call.

## 11. Test coverage gives more comfort than it should

- `go test ./...` fails `TestFeatureNames` (the categorical naming mismatch in section 6).
- The SHAP suite fails 4 of 18 tests: mocks return a 1-D array while production code immediately
  indexes the first row.
- The tracked Playwright status file records 18 failed tests, and the E2E suite states that it
  passes without a backend. Several E2E tests assert nothing when an element is absent.
- The passing ML tests use random, independent fake lag features, so they cannot catch leakage or
  ordering bugs.
- The ONNX export test exercises an all-numeric toy model, not the real categorical path.
- The reconciliation test only checks that returned objects have `__class__`, which every Python
  object has. No test invokes `reconcile_forecasts` on a real hierarchy.

There is no end-to-end test asserting that raw data produces one consistent, honest prediction
through Python, ONNX, Go, and the dashboard.

## 12. Unmeasured, therefore unclaimed

None of the following has a benchmark script, input snapshot, hardware description, or result
artifact in this repository, so no figure is published for any of them:

- API latency (cached or uncached), throughput, and P95/P99 behaviour
- Polars-versus-pandas speed or memory
- Go-versus-Python inference latency, memory footprint, or cold start
- Cache hit rate and per-tier cache latency (both tiers share one unlabelled hit counter)
- SHAP explanation latency, throughput, and memory
- Training wall-clock time and hardware requirements
- Disk and RAM requirements for setup
- Accuracy by horizon, by product-family sparsity, by holiday, or by store

The tooling to measure several of these exists (`scripts/integration_tests.sh`, the k6 suites in
`mlrf-api/tests/load/`). Running it in a described environment and committing the output is what
would turn any of these into a claim.

## 13. Other things this repository does not establish

- **License**: there is no LICENSE file. The README previously said MIT and the model card said
  Apache 2.0.
- **Dataset properties**: date range, row counts, and country are not verifiable here, because the
  data is not checked in and no data-profile artifact is generated.
- **PII**: the pipeline selects store-family-day fields and does not intentionally select customer
  identifiers, but no PII scan exists, so absence of PII is not certified.
- **Fairness**: no store-level parity or fairness analysis has been performed. The `cluster` field
  is imported unchanged from the dataset's store metadata.
- **Accessibility**: the SHAP waterfall's interactive bars have pointer handlers only, with no
  roles, ARIA labels, `tabIndex`, or keyboard handlers.
