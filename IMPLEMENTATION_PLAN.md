# Multi-LOB Revenue Forecasting System (MLRF) - Phase 1 Implementation Plan

## Overview

Build a production-grade multi-LOB revenue forecasting system using the Kaggle Store Sales dataset as a proxy for Franklin Street's 7 LOBs. The system will demonstrate:
- Hierarchical time series forecasting with proper reconciliation
- SHAP-based explainability for executive decision-making
- Sub-10ms inference via Go API
- Interactive React dashboard with drilldowns

**Timeline**: 4 weeks (nights/weekends, ~10-15 hrs/week)
**Languages**: Python (ML), Go (API), TypeScript (Dashboard)

---

## Current State Analysis

### Dataset: Kaggle Store Sales
- **Source**: https://www.kaggle.com/competitions/store-sales-time-series-forecasting
- **Structure**: 54 stores × 33 product families = 1,782 time series
- **Date Range**: 2013-01-01 to 2017-08-15 (~4.5 years daily data)
- **Size**: ~3M rows (train.csv), 125MB total
- **External Features**: Oil prices, holidays, promotions, store metadata
- **Evaluation Metric**: RMSLE (Root Mean Squared Logarithmic Error)

### Hierarchy Mapping to Franklin Street
| Kaggle | Franklin Street Equivalent |
|--------|---------------------------|
| Total Sales | Total Company Revenue |
| Store | Geographic Market / Office |
| Product Family (33) | LOB (7): Investment Sales, Property Mgmt, etc. |

### Key Discovery
The Kaggle dataset predicts 15 days out, but we need 90 days (3 months). This requires:
- Extended lag features (lag_90, rolling_90)
- Multiple forecast horizons (15, 30, 60, 90 days)
- Walk-forward validation with 90-day gaps

---

## Desired End State

After Phase 1 completion:
1. **ML Pipeline**: Trained models for all 1,782 store×family combinations with hierarchical reconciliation
2. **Go API**: REST endpoint returning predictions in <10ms with Redis caching
3. **Dashboard**: React app with SHAP waterfall, LOB drilldown, and model comparison
4. **Docker Deployment**: `docker-compose up` runs entire system

### Verification Criteria
- [ ] RMSLE < 0.5 on holdout set (competitive with Kaggle top 20%)
- [ ] API P95 latency < 10ms with warm cache
- [ ] Dashboard loads forecast for any store×family in < 2 seconds
- [ ] All forecasts sum correctly across hierarchy (reconciliation check)

---

## What We're NOT Doing (Phase 1)

- Scala/Spark distributed processing (add in Phase 2 if we hit memory limits)
- FinnTS/R integration (hierarchicalforecast covers this)
- Real-time streaming ingestion
- Automated retraining pipeline (manual trigger only)
- Alert system for forecast deviations
- What-if simulator (moved to Phase 2)
- PyMC Bayesian models (overkill for this use case)

---

## Project Structure

```
mlrf/
├── README.md
├── docker-compose.yml
├── .env.example
│
├── mlrf-data/                    # Data processing (Python/Polars)
│   ├── pyproject.toml
│   ├── src/
│   │   └── mlrf_data/
│   │       ├── __init__.py
│   │       ├── download.py       # Kaggle API download
│   │       ├── preprocess.py     # Cleaning, validation
│   │       ├── features.py       # Feature engineering
│   │       └── hierarchy.py      # Summing matrix construction
│   └── tests/
│
├── mlrf-ml/                      # ML training (Python)
│   ├── pyproject.toml
│   ├── src/
│   │   └── mlrf_ml/
│   │       ├── __init__.py
│   │       ├── models/
│   │       │   ├── statistical.py    # statsforecast models
│   │       │   ├── lightgbm_model.py # LightGBM with custom features
│   │       │   └── ensemble.py       # Model averaging
│   │       ├── reconciliation.py     # hierarchicalforecast integration
│   │       ├── explainability.py     # SHAP computation
│   │       ├── validation.py         # Walk-forward CV, metrics
│   │       └── export.py             # ONNX export for Go
│   ├── notebooks/
│   │   ├── 01_eda.ipynb
│   │   ├── 02_baseline.ipynb
│   │   └── 03_final_model.ipynb
│   └── tests/
│
├── mlrf-api/                     # Go inference API
│   ├── go.mod
│   ├── go.sum
│   ├── cmd/
│   │   └── server/
│   │       └── main.go
│   ├── internal/
│   │   ├── handlers/
│   │   │   ├── predict.go
│   │   │   ├── explain.go
│   │   │   └── health.go
│   │   ├── inference/
│   │   │   └── onnx.go           # ONNX Runtime wrapper
│   │   ├── cache/
│   │   │   └── redis.go
│   │   └── middleware/
│   │       └── logging.go
│   └── Dockerfile
│
├── mlrf-dashboard/               # React frontend
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ForecastChart.tsx
│   │   │   ├── ShapWaterfall.tsx     # Custom visx waterfall
│   │   │   ├── HierarchyDrilldown.tsx
│   │   │   └── ModelComparison.tsx
│   │   ├── hooks/
│   │   │   └── useForecast.ts
│   │   ├── lib/
│   │   │   └── api.ts
│   │   └── pages/
│   │       ├── Dashboard.tsx
│   │       └── Explainability.tsx
│   └── Dockerfile
│
├── models/                       # Trained model artifacts
│   ├── lightgbm_model.onnx
│   ├── shap_explainer.pkl
│   └── hierarchy_matrix.parquet
│
└── data/                         # Local data (gitignored)
    ├── raw/
    ├── processed/
    └── features/
```

---

## Implementation Approach

### Week 1: Data Pipeline + Baseline Models
Focus on getting data flowing and establishing baseline metrics.

### Week 2: ML Pipeline + Hierarchical Reconciliation
Build the full training pipeline with proper reconciliation.

### Week 3: Go API + SHAP Integration
Create the inference API with caching and explainability.

### Week 4: Dashboard + Integration Testing
Build the React frontend and ensure everything works together.

---

## Phase 1.1: Data Pipeline (Days 1-3)

### Overview
Download Kaggle data, clean it, and create features for multiple forecast horizons.

### Changes Required:

#### 1. Project Setup
**File**: `mlrf-data/pyproject.toml`

```toml
[project]
name = "mlrf-data"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "polars>=1.0.0",
    "kaggle>=1.6.0",
    "pyarrow>=15.0.0",
    "python-dotenv>=1.0.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.0.0", "ruff>=0.4.0"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

#### 2. Data Download
**File**: `mlrf-data/src/mlrf_data/download.py`

```python
"""Download Kaggle Store Sales dataset."""
import os
from pathlib import Path
from kaggle.api.kaggle_api_extended import KaggleApi

def download_competition_data(data_dir: Path) -> None:
    """Download and extract competition files."""
    api = KaggleApi()
    api.authenticate()

    competition = "store-sales-time-series-forecasting"
    api.competition_download_files(competition, path=data_dir / "raw")

    # Extract zip
    import zipfile
    zip_path = data_dir / "raw" / f"{competition}.zip"
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(data_dir / "raw")
    zip_path.unlink()

if __name__ == "__main__":
    download_competition_data(Path("data"))
```

#### 3. Data Preprocessing
**File**: `mlrf-data/src/mlrf_data/preprocess.py`

```python
"""Clean and validate raw data."""
import polars as pl
from pathlib import Path

def load_and_clean_train(raw_dir: Path) -> pl.DataFrame:
    """Load train.csv and perform initial cleaning."""
    df = pl.read_csv(raw_dir / "train.csv", try_parse_dates=True)

    # Validate no nulls in key columns
    assert df.select(pl.col("sales").null_count()).item() == 0

    # Convert date column
    df = df.with_columns(
        pl.col("date").str.to_date("%Y-%m-%d")
    )

    # Ensure sales are non-negative (required for RMSLE)
    df = df.with_columns(
        pl.when(pl.col("sales") < 0)
        .then(0)
        .otherwise(pl.col("sales"))
        .alias("sales")
    )

    return df

def load_external_data(raw_dir: Path) -> dict[str, pl.DataFrame]:
    """Load supplementary files."""
    return {
        "oil": pl.read_csv(raw_dir / "oil.csv", try_parse_dates=True),
        "holidays": pl.read_csv(raw_dir / "holidays_events.csv", try_parse_dates=True),
        "stores": pl.read_csv(raw_dir / "stores.csv"),
        "transactions": pl.read_csv(raw_dir / "transactions.csv", try_parse_dates=True),
    }

def merge_external_features(
    train: pl.DataFrame,
    external: dict[str, pl.DataFrame]
) -> pl.DataFrame:
    """Join external data to training set."""
    # Oil prices (forward fill missing)
    oil = external["oil"].with_columns(
        pl.col("date").str.to_date("%Y-%m-%d")
    ).sort("date").with_columns(
        pl.col("dcoilwtico").forward_fill().alias("oil_price")
    )

    train = train.join(oil.select("date", "oil_price"), on="date", how="left")

    # Store metadata
    train = train.join(external["stores"], on="store_nbr", how="left")

    # Holidays (national only for simplicity)
    holidays = external["holidays"].filter(
        pl.col("locale") == "National"
    ).select("date", "type").with_columns(
        pl.col("date").str.to_date("%Y-%m-%d")
    ).unique()

    train = train.join(
        holidays.with_columns(pl.lit(1).alias("is_holiday")),
        on="date",
        how="left"
    ).with_columns(
        pl.col("is_holiday").fill_null(0)
    )

    return train
```

#### 4. Feature Engineering
**File**: `mlrf-data/src/mlrf_data/features.py`

```python
"""Create features for multiple forecast horizons."""
import polars as pl

def create_lag_features(
    df: pl.DataFrame,
    group_cols: list[str],
    target_col: str = "sales",
    lags: list[int] = [1, 7, 14, 28, 90]
) -> pl.DataFrame:
    """Create lag features per group."""
    for lag in lags:
        df = df.with_columns(
            pl.col(target_col)
            .shift(lag)
            .over(group_cols)
            .alias(f"{target_col}_lag_{lag}")
        )
    return df

def create_rolling_features(
    df: pl.DataFrame,
    group_cols: list[str],
    target_col: str = "sales",
    windows: list[int] = [7, 14, 28, 90]
) -> pl.DataFrame:
    """Create rolling statistics per group."""
    for window in windows:
        df = df.with_columns([
            pl.col(target_col)
            .rolling_mean(window)
            .over(group_cols)
            .alias(f"{target_col}_rolling_mean_{window}"),

            pl.col(target_col)
            .rolling_std(window)
            .over(group_cols)
            .alias(f"{target_col}_rolling_std_{window}"),
        ])
    return df

def create_date_features(df: pl.DataFrame) -> pl.DataFrame:
    """Extract date components."""
    return df.with_columns([
        pl.col("date").dt.year().alias("year"),
        pl.col("date").dt.month().alias("month"),
        pl.col("date").dt.day().alias("day"),
        pl.col("date").dt.weekday().alias("dayofweek"),
        pl.col("date").dt.ordinal_day().alias("dayofyear"),
        (pl.col("date").dt.day() == 15).cast(pl.Int8).alias("is_mid_month"),
        (pl.col("date").dt.is_leap_year()).cast(pl.Int8).alias("is_leap_year"),
    ])

def create_promotion_features(df: pl.DataFrame) -> pl.DataFrame:
    """Create promotion-related features."""
    return df.with_columns([
        pl.col("onpromotion").fill_null(0),
        pl.col("onpromotion")
        .rolling_sum(7)
        .over(["store_nbr", "family"])
        .alias("promo_rolling_7"),
    ])

def build_feature_matrix(
    df: pl.DataFrame,
    forecast_horizon: int = 90
) -> pl.DataFrame:
    """Build complete feature matrix for given horizon."""
    group_cols = ["store_nbr", "family"]

    # Sort by group and date
    df = df.sort(group_cols + ["date"])

    # Create all features
    df = create_date_features(df)
    df = create_promotion_features(df)
    df = create_lag_features(df, group_cols, lags=[1, 7, 14, 28, forecast_horizon])
    df = create_rolling_features(df, group_cols, windows=[7, 14, 28, forecast_horizon])

    # Drop rows with null lags (first `forecast_horizon` days per group)
    df = df.drop_nulls(subset=[f"sales_lag_{forecast_horizon}"])

    return df
```

#### 5. Hierarchy Matrix Construction
**File**: `mlrf-data/src/mlrf_data/hierarchy.py`

```python
"""Build summing matrix for hierarchical forecasting."""
import polars as pl
import numpy as np

def build_hierarchy_spec(df: pl.DataFrame) -> dict:
    """
    Create hierarchy specification for hierarchicalforecast.

    Hierarchy:
    - Level 0: Total (1 series)
    - Level 1: Store (54 series)
    - Level 2: Family (33 series)
    - Level 3: Store × Family (1,782 series = bottom level)
    """
    stores = df.select("store_nbr").unique().sort("store_nbr")["store_nbr"].to_list()
    families = df.select("family").unique().sort("family")["family"].to_list()

    # Create unique_id for each bottom-level series
    bottom_ids = []
    for store in stores:
        for family in families:
            bottom_ids.append(f"{store}_{family}")

    # Build tags dictionary for hierarchicalforecast
    tags = {
        "Total": np.array(["Total"] * len(bottom_ids)),
        "Store": np.array([f"Store_{uid.split('_')[0]}" for uid in bottom_ids]),
        "Family": np.array([f"Family_{uid.split('_')[1]}" for uid in bottom_ids]),
    }

    return {
        "bottom_ids": bottom_ids,
        "tags": tags,
        "n_stores": len(stores),
        "n_families": len(families),
        "n_bottom": len(bottom_ids),
    }

def create_summing_matrix(hierarchy_spec: dict) -> np.ndarray:
    """
    Create summing matrix S for reconciliation.

    S @ bottom_forecasts = all_level_forecasts
    """
    n_bottom = hierarchy_spec["n_bottom"]
    n_stores = hierarchy_spec["n_stores"]
    n_families = hierarchy_spec["n_families"]

    # Total aggregation levels:
    # 1 (Total) + 54 (Stores) + 33 (Families) + 1782 (Bottom) = 1870
    n_total = 1 + n_stores + n_families + n_bottom

    S = np.zeros((n_total, n_bottom))

    # Total row (sums all bottom)
    S[0, :] = 1

    # Store rows
    for i, store_idx in enumerate(range(n_stores)):
        start = store_idx * n_families
        end = start + n_families
        S[1 + i, start:end] = 1

    # Family rows
    for j in range(n_families):
        for store_idx in range(n_stores):
            S[1 + n_stores + j, store_idx * n_families + j] = 1

    # Bottom level (identity)
    S[1 + n_stores + n_families:, :] = np.eye(n_bottom)

    return S
```

### Success Criteria:

#### Automated Verification:
- [ ] Data downloads successfully: `python -m mlrf_data.download`
- [ ] Feature matrix builds without errors: `python -m mlrf_data.features`
- [ ] Tests pass: `pytest mlrf-data/tests/`
- [ ] Linting passes: `ruff check mlrf-data/`

#### Manual Verification:
- [ ] Feature matrix has expected shape (~2.5M rows after lag filtering)
- [ ] No data leakage (lags properly shifted)
- [ ] Hierarchy sums correctly (spot check: Total = sum of all stores)

---

## Phase 1.2: ML Pipeline (Days 4-8)

### Overview
Train statistical + ML models, apply hierarchical reconciliation, compute SHAP values.

### Changes Required:

#### 1. ML Project Setup
**File**: `mlrf-ml/pyproject.toml`

```toml
[project]
name = "mlrf-ml"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "mlrf-data",
    "polars>=1.0.0",
    "numpy>=1.26.0",
    "pandas>=2.2.0",
    "scikit-learn>=1.4.0",
    "lightgbm>=4.3.0",
    "statsforecast>=1.7.0",
    "hierarchicalforecast>=0.4.0",
    "shap>=0.45.0",
    "onnx>=1.16.0",
    "onnxmltools>=1.12.0",
    "skl2onnx>=1.16.0",
    "pingouin>=0.5.4",
    "statsmodels>=0.14.0",
    "mlflow>=2.12.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.0.0", "ruff>=0.4.0", "jupyter>=1.0.0"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

#### 2. Statistical Models
**File**: `mlrf-ml/src/mlrf_ml/models/statistical.py`

```python
"""Statistical forecasting with statsforecast."""
from statsforecast import StatsForecast
from statsforecast.models import (
    AutoARIMA,
    AutoETS,
    MSTL,
    SeasonalNaive,
)
import pandas as pd

def create_statsforecast_models(season_length: int = 7):
    """Create ensemble of statistical models."""
    return [
        AutoARIMA(season_length=season_length),
        AutoETS(season_length=season_length),
        MSTL(season_length=[7, 365]),  # Weekly + yearly seasonality
        SeasonalNaive(season_length=season_length),  # Baseline
    ]

def train_statistical_forecasts(
    df: pd.DataFrame,
    horizon: int = 90,
    freq: str = "D"
) -> pd.DataFrame:
    """
    Train statistical models on all series.

    df must have columns: unique_id, ds (date), y (target)
    """
    sf = StatsForecast(
        models=create_statsforecast_models(),
        freq=freq,
        n_jobs=-1,  # Use all cores
    )

    # Generate forecasts with prediction intervals
    forecasts = sf.forecast(
        df=df,
        h=horizon,
        level=[80, 95],  # 80% and 95% prediction intervals
    )

    return forecasts

def cross_validate_statistical(
    df: pd.DataFrame,
    horizon: int = 90,
    n_windows: int = 3,
    step_size: int = 30
) -> pd.DataFrame:
    """Walk-forward cross-validation."""
    sf = StatsForecast(
        models=create_statsforecast_models(),
        freq="D",
        n_jobs=-1,
    )

    cv_results = sf.cross_validation(
        df=df,
        h=horizon,
        n_windows=n_windows,
        step_size=step_size,
    )

    return cv_results
```

#### 3. LightGBM Model
**File**: `mlrf-ml/src/mlrf_ml/models/lightgbm_model.py`

```python
"""LightGBM model for tabular forecasting."""
import lightgbm as lgb
import numpy as np
import polars as pl
from sklearn.model_selection import TimeSeriesSplit

# Features to use (must match feature engineering)
FEATURE_COLS = [
    # Date features
    "year", "month", "day", "dayofweek", "dayofyear",
    "is_mid_month", "is_leap_year",
    # External
    "oil_price", "is_holiday", "onpromotion", "promo_rolling_7",
    # Store metadata
    "cluster", "type",
    # Lag features
    "sales_lag_1", "sales_lag_7", "sales_lag_14", "sales_lag_28", "sales_lag_90",
    # Rolling features
    "sales_rolling_mean_7", "sales_rolling_mean_14",
    "sales_rolling_mean_28", "sales_rolling_mean_90",
    "sales_rolling_std_7", "sales_rolling_std_14",
    "sales_rolling_std_28", "sales_rolling_std_90",
]

CATEGORICAL_COLS = ["family", "type", "cluster"]

def get_lgb_params() -> dict:
    """LightGBM hyperparameters optimized for time series."""
    return {
        "objective": "regression",
        "metric": "rmse",
        "boosting_type": "gbdt",
        "num_leaves": 63,
        "learning_rate": 0.05,
        "feature_fraction": 0.8,
        "bagging_fraction": 0.8,
        "bagging_freq": 5,
        "verbose": -1,
        "num_threads": -1,
        "seed": 42,
    }

def train_lightgbm(
    train_df: pl.DataFrame,
    valid_df: pl.DataFrame,
    target_col: str = "sales"
) -> lgb.Booster:
    """Train LightGBM model."""
    # Convert to pandas for LightGBM
    X_train = train_df.select(FEATURE_COLS).to_pandas()
    y_train = train_df.select(target_col).to_pandas().values.ravel()

    X_valid = valid_df.select(FEATURE_COLS).to_pandas()
    y_valid = valid_df.select(target_col).to_pandas().values.ravel()

    # Handle categoricals
    for col in CATEGORICAL_COLS:
        if col in X_train.columns:
            X_train[col] = X_train[col].astype("category")
            X_valid[col] = X_valid[col].astype("category")

    train_data = lgb.Dataset(X_train, label=y_train, categorical_feature=CATEGORICAL_COLS)
    valid_data = lgb.Dataset(X_valid, label=y_valid, reference=train_data)

    model = lgb.train(
        get_lgb_params(),
        train_data,
        num_boost_round=1000,
        valid_sets=[train_data, valid_data],
        valid_names=["train", "valid"],
        callbacks=[
            lgb.early_stopping(stopping_rounds=50),
            lgb.log_evaluation(period=100),
        ],
    )

    return model

def predict_lightgbm(
    model: lgb.Booster,
    df: pl.DataFrame
) -> np.ndarray:
    """Generate predictions."""
    X = df.select(FEATURE_COLS).to_pandas()
    for col in CATEGORICAL_COLS:
        if col in X.columns:
            X[col] = X[col].astype("category")

    return model.predict(X)
```

#### 4. Hierarchical Reconciliation
**File**: `mlrf-ml/src/mlrf_ml/reconciliation.py`

```python
"""Hierarchical forecast reconciliation."""
import pandas as pd
import numpy as np
from hierarchicalforecast.core import HierarchicalReconciliation
from hierarchicalforecast.methods import (
    BottomUp,
    TopDown,
    MinTrace,
    ERM,
)

def get_reconciliation_methods():
    """Define reconciliation methods to compare."""
    return [
        BottomUp(),
        TopDown(method="forecast_proportions"),
        MinTrace(method="mint_shrink"),  # Optimal reconciliation
        MinTrace(method="ols"),
    ]

def reconcile_forecasts(
    base_forecasts: pd.DataFrame,
    actuals: pd.DataFrame,
    S: np.ndarray,
    tags: dict,
) -> pd.DataFrame:
    """
    Apply hierarchical reconciliation.

    Parameters
    ----------
    base_forecasts : pd.DataFrame
        Forecasts with columns: unique_id, ds, and model columns
    actuals : pd.DataFrame
        Historical data with columns: unique_id, ds, y
    S : np.ndarray
        Summing matrix from hierarchy.create_summing_matrix()
    tags : dict
        Hierarchy tags from hierarchy.build_hierarchy_spec()

    Returns
    -------
    pd.DataFrame
        Reconciled forecasts for all hierarchy levels
    """
    hrec = HierarchicalReconciliation(reconcilers=get_reconciliation_methods())

    reconciled = hrec.reconcile(
        Y_hat_df=base_forecasts,
        Y_df=actuals,
        S=S,
        tags=tags,
    )

    return reconciled

def evaluate_reconciliation(
    reconciled: pd.DataFrame,
    actuals: pd.DataFrame,
    tags: dict,
) -> pd.DataFrame:
    """Evaluate reconciliation methods at each hierarchy level."""
    from hierarchicalforecast.evaluation import scaled_crps, mase

    # Merge with actuals
    df = reconciled.merge(actuals, on=["unique_id", "ds"])

    # Calculate metrics per method and level
    results = []
    for method_col in [c for c in reconciled.columns if "/" in c]:
        for level_name, level_tags in tags.items():
            level_mask = df["unique_id"].isin(level_tags)
            level_df = df[level_mask]

            mape = np.mean(np.abs(level_df[method_col] - level_df["y"]) / (level_df["y"] + 1))
            rmse = np.sqrt(np.mean((level_df[method_col] - level_df["y"]) ** 2))

            results.append({
                "method": method_col,
                "level": level_name,
                "mape": mape,
                "rmse": rmse,
            })

    return pd.DataFrame(results)
```

#### 5. SHAP Explainability
**File**: `mlrf-ml/src/mlrf_ml/explainability.py`

```python
"""SHAP-based model explainability."""
import shap
import lightgbm as lgb
import numpy as np
import pandas as pd
import json
from pathlib import Path

def create_tree_explainer(model: lgb.Booster) -> shap.TreeExplainer:
    """Create SHAP TreeExplainer for LightGBM model."""
    return shap.TreeExplainer(
        model,
        feature_perturbation="tree_path_dependent",  # No background data needed
    )

def compute_shap_values(
    explainer: shap.TreeExplainer,
    X: pd.DataFrame,
) -> shap.Explanation:
    """Compute SHAP values for given features."""
    return explainer(X)

def get_feature_importance(
    shap_values: shap.Explanation,
    feature_names: list[str],
) -> pd.DataFrame:
    """Get global feature importance from SHAP values."""
    importance = np.abs(shap_values.values).mean(axis=0)

    return pd.DataFrame({
        "feature": feature_names,
        "importance": importance,
    }).sort_values("importance", ascending=False)

def export_shap_for_api(
    shap_values: shap.Explanation,
    feature_names: list[str],
    output_path: Path,
    sample_indices: list[int] = None,
) -> None:
    """
    Export SHAP values to JSON for Go API consumption.

    Format optimized for React waterfall charts.
    """
    if sample_indices is None:
        sample_indices = list(range(min(100, len(shap_values))))

    export_data = {
        "base_value": float(shap_values.base_values[0]),
        "feature_names": feature_names,
        "samples": [],
    }

    for idx in sample_indices:
        sample = {
            "index": idx,
            "prediction": float(shap_values.base_values[idx] + shap_values.values[idx].sum()),
            "shap_values": shap_values.values[idx].tolist(),
            "feature_values": shap_values.data[idx].tolist() if hasattr(shap_values, "data") else None,
        }
        export_data["samples"].append(sample)

    with open(output_path, "w") as f:
        json.dump(export_data, f)

def create_waterfall_data(
    shap_values: np.ndarray,
    base_value: float,
    feature_names: list[str],
    feature_values: np.ndarray,
    max_display: int = 10,
) -> dict:
    """
    Create data structure for React waterfall chart.

    Returns dict with:
    - base_value: starting point
    - features: list of {name, value, shap_value, cumulative}
    - prediction: final prediction
    """
    # Sort by absolute SHAP value
    sorted_indices = np.argsort(-np.abs(shap_values))[:max_display]

    features = []
    cumulative = base_value

    for idx in sorted_indices:
        shap_val = shap_values[idx]
        cumulative += shap_val
        features.append({
            "name": feature_names[idx],
            "value": float(feature_values[idx]) if feature_values is not None else None,
            "shap_value": float(shap_val),
            "cumulative": float(cumulative),
            "direction": "positive" if shap_val > 0 else "negative",
        })

    # Add "other" for remaining features
    other_shap = shap_values[~np.isin(np.arange(len(shap_values)), sorted_indices)].sum()
    if abs(other_shap) > 0.01:
        cumulative += other_shap
        features.append({
            "name": f"Other ({len(shap_values) - max_display} features)",
            "value": None,
            "shap_value": float(other_shap),
            "cumulative": float(cumulative),
            "direction": "positive" if other_shap > 0 else "negative",
        })

    return {
        "base_value": float(base_value),
        "features": features,
        "prediction": float(cumulative),
    }
```

#### 6. ONNX Export
**File**: `mlrf-ml/src/mlrf_ml/export.py`

```python
"""Export models to ONNX format for Go inference."""
import lightgbm as lgb
import onnxmltools
from onnxmltools.convert.lightgbm.operator_converters.LightGbm import convert_lightgbm
from skl2onnx.common.data_types import FloatTensorType
from pathlib import Path

def export_lightgbm_to_onnx(
    model: lgb.Booster,
    feature_names: list[str],
    output_path: Path,
) -> None:
    """Export LightGBM model to ONNX format."""
    # Define input shape
    initial_types = [
        ("input", FloatTensorType([None, len(feature_names)]))
    ]

    # Convert to ONNX
    onnx_model = onnxmltools.convert_lightgbm(
        model,
        initial_types=initial_types,
        target_opset=15,
    )

    # Save
    onnxmltools.utils.save_model(onnx_model, str(output_path))
    print(f"Exported ONNX model to {output_path}")

def validate_onnx_model(
    onnx_path: Path,
    sample_input: np.ndarray,
    expected_output: np.ndarray,
    rtol: float = 1e-3,
) -> bool:
    """Validate ONNX model produces same output as original."""
    import onnxruntime as ort

    session = ort.InferenceSession(str(onnx_path))
    input_name = session.get_inputs()[0].name

    onnx_output = session.run(None, {input_name: sample_input.astype(np.float32)})[0]

    return np.allclose(onnx_output.flatten(), expected_output, rtol=rtol)
```

### Success Criteria:

#### Automated Verification:
- [ ] Statistical models train: `python -m mlrf_ml.models.statistical`
- [ ] LightGBM trains without errors: `python -m mlrf_ml.models.lightgbm_model`
- [ ] Reconciliation runs: `python -m mlrf_ml.reconciliation`
- [ ] ONNX export validates: `python -m mlrf_ml.export`
- [ ] Tests pass: `pytest mlrf-ml/tests/`

#### Manual Verification:
- [ ] Cross-validation RMSLE < 0.5 for best model
- [ ] Reconciled forecasts sum correctly (Total = sum of stores)
- [ ] SHAP values are reasonable (no extreme outliers)
- [ ] ONNX model matches LightGBM predictions within 0.1%

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 1.3: Go API (Days 9-14)

### Overview
Build high-performance inference API with ONNX Runtime, Redis caching, and SHAP endpoint.

### Changes Required:

#### 1. Go Module Setup
**File**: `mlrf-api/go.mod`

```go
module github.com/yourusername/mlrf-api

go 1.22

require (
    github.com/yalue/onnxruntime_go v1.10.0
    github.com/go-chi/chi/v5 v5.0.12
    github.com/redis/go-redis/v9 v9.5.1
    github.com/go-redis/cache/v9 v9.0.0
    github.com/rs/zerolog v1.32.0
    github.com/prometheus/client_golang v1.19.0
)
```

#### 2. Main Server
**File**: `mlrf-api/cmd/server/main.go`

```go
package main

import (
    "context"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"

    "github.com/go-chi/chi/v5"
    "github.com/go-chi/chi/v5/middleware"
    "github.com/rs/zerolog"
    "github.com/rs/zerolog/log"

    "github.com/yourusername/mlrf-api/internal/handlers"
    "github.com/yourusername/mlrf-api/internal/inference"
    "github.com/yourusername/mlrf-api/internal/cache"
)

func main() {
    // Setup logging
    zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
    log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

    // Initialize ONNX Runtime
    onnxSession, err := inference.NewONNXSession("models/lightgbm_model.onnx")
    if err != nil {
        log.Fatal().Err(err).Msg("Failed to load ONNX model")
    }
    defer onnxSession.Close()

    // Initialize Redis cache
    redisCache, err := cache.NewRedisCache(os.Getenv("REDIS_URL"))
    if err != nil {
        log.Warn().Err(err).Msg("Redis unavailable, running without cache")
    }

    // Create handlers
    h := handlers.NewHandlers(onnxSession, redisCache)

    // Setup router
    r := chi.NewRouter()
    r.Use(middleware.RequestID)
    r.Use(middleware.RealIP)
    r.Use(middleware.Logger)
    r.Use(middleware.Recoverer)
    r.Use(middleware.Timeout(30 * time.Second))

    // Routes
    r.Get("/health", h.Health)
    r.Post("/predict", h.Predict)
    r.Post("/predict/batch", h.PredictBatch)
    r.Post("/explain", h.Explain)
    r.Get("/metrics", h.Metrics)

    // Start server
    srv := &http.Server{
        Addr:    ":8080",
        Handler: r,
    }

    // Graceful shutdown
    go func() {
        log.Info().Msg("Starting server on :8080")
        if err := srv.ListenAndServe(); err != http.ErrServerClosed {
            log.Fatal().Err(err).Msg("Server failed")
        }
    }()

    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    srv.Shutdown(ctx)
    log.Info().Msg("Server stopped")
}
```

#### 3. ONNX Inference
**File**: `mlrf-api/internal/inference/onnx.go`

```go
package inference

import (
    "fmt"
    "sync"

    ort "github.com/yalue/onnxruntime_go"
)

// ONNXSession wraps ONNX Runtime for thread-safe inference
type ONNXSession struct {
    session      *ort.AdvancedSession
    inputShape   ort.Shape
    outputShape  ort.Shape
    inputTensor  *ort.Tensor[float32]
    outputTensor *ort.Tensor[float32]
    mu           sync.Mutex
}

// NewONNXSession creates a new ONNX inference session
func NewONNXSession(modelPath string) (*ONNXSession, error) {
    // Initialize ONNX Runtime
    ort.SetSharedLibraryPath("libonnxruntime.so")
    if err := ort.InitializeEnvironment(); err != nil {
        return nil, fmt.Errorf("failed to init onnxruntime: %w", err)
    }

    // Define shapes (must match model)
    inputShape := ort.NewShape(1, 26)  // batch=1, features=26
    outputShape := ort.NewShape(1, 1)

    // Pre-allocate tensors for performance
    inputData := make([]float32, 26)
    inputTensor, err := ort.NewTensor(inputShape, inputData)
    if err != nil {
        return nil, fmt.Errorf("failed to create input tensor: %w", err)
    }

    outputTensor, err := ort.NewEmptyTensor[float32](outputShape)
    if err != nil {
        return nil, fmt.Errorf("failed to create output tensor: %w", err)
    }

    // Create session with pre-allocated tensors
    session, err := ort.NewAdvancedSession(
        modelPath,
        []string{"input"},
        []string{"output"},
        []ort.Value{inputTensor},
        []ort.Value{outputTensor},
        nil,
    )
    if err != nil {
        return nil, fmt.Errorf("failed to create session: %w", err)
    }

    return &ONNXSession{
        session:      session,
        inputShape:   inputShape,
        outputShape:  outputShape,
        inputTensor:  inputTensor,
        outputTensor: outputTensor,
    }, nil
}

// Predict runs inference on input features
func (s *ONNXSession) Predict(features []float32) (float32, error) {
    s.mu.Lock()
    defer s.mu.Unlock()

    if len(features) != 26 {
        return 0, fmt.Errorf("expected 26 features, got %d", len(features))
    }

    // Copy features to input tensor
    inputData := s.inputTensor.GetData()
    copy(inputData, features)

    // Run inference
    if err := s.session.Run(); err != nil {
        return 0, fmt.Errorf("inference failed: %w", err)
    }

    // Get output
    outputData := s.outputTensor.GetData()
    return outputData[0], nil
}

// Close releases resources
func (s *ONNXSession) Close() {
    s.session.Destroy()
    s.inputTensor.Destroy()
    s.outputTensor.Destroy()
    ort.DestroyEnvironment()
}
```

#### 4. Redis Cache
**File**: `mlrf-api/internal/cache/redis.go`

```go
package cache

import (
    "context"
    "encoding/json"
    "fmt"
    "time"

    "github.com/redis/go-redis/v9"
    "github.com/go-redis/cache/v9"
)

type RedisCache struct {
    client *redis.Client
    cache  *cache.Cache
}

type PredictionResult struct {
    StoreNbr   int       `json:"store_nbr"`
    Family     string    `json:"family"`
    Date       string    `json:"date"`
    Prediction float32   `json:"prediction"`
    CachedAt   time.Time `json:"cached_at"`
}

func NewRedisCache(url string) (*RedisCache, error) {
    opt, err := redis.ParseURL(url)
    if err != nil {
        return nil, err
    }

    client := redis.NewClient(opt)

    // Test connection
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    if err := client.Ping(ctx).Err(); err != nil {
        return nil, fmt.Errorf("redis connection failed: %w", err)
    }

    // Create cache with local TinyLFU
    c := cache.New(&cache.Options{
        Redis:      client,
        LocalCache: cache.NewTinyLFU(10000, time.Minute),
    })

    return &RedisCache{client: client, cache: c}, nil
}

func (r *RedisCache) GetPrediction(ctx context.Context, key string) (*PredictionResult, error) {
    var result PredictionResult
    err := r.cache.Get(ctx, key, &result)
    if err != nil {
        return nil, err
    }
    return &result, nil
}

func (r *RedisCache) SetPrediction(ctx context.Context, key string, result *PredictionResult, ttl time.Duration) error {
    result.CachedAt = time.Now()
    return r.cache.Set(&cache.Item{
        Ctx:   ctx,
        Key:   key,
        Value: result,
        TTL:   ttl,
    })
}

func GenerateCacheKey(storeNbr int, family string, date string, horizon int) string {
    return fmt.Sprintf("pred:v1:%d:%s:%s:%d", storeNbr, family, date, horizon)
}
```

#### 5. HTTP Handlers
**File**: `mlrf-api/internal/handlers/predict.go`

```go
package handlers

import (
    "encoding/json"
    "net/http"
    "time"

    "github.com/rs/zerolog/log"
    "github.com/yourusername/mlrf-api/internal/inference"
    "github.com/yourusername/mlrf-api/internal/cache"
)

type Handlers struct {
    onnx  *inference.ONNXSession
    cache *cache.RedisCache
}

func NewHandlers(onnx *inference.ONNXSession, c *cache.RedisCache) *Handlers {
    return &Handlers{onnx: onnx, cache: c}
}

type PredictRequest struct {
    StoreNbr int       `json:"store_nbr"`
    Family   string    `json:"family"`
    Date     string    `json:"date"`
    Features []float32 `json:"features"`
    Horizon  int       `json:"horizon"`
}

type PredictResponse struct {
    StoreNbr   int     `json:"store_nbr"`
    Family     string  `json:"family"`
    Date       string  `json:"date"`
    Prediction float32 `json:"prediction"`
    Cached     bool    `json:"cached"`
    LatencyMs  float64 `json:"latency_ms"`
}

func (h *Handlers) Predict(w http.ResponseWriter, r *http.Request) {
    start := time.Now()
    ctx := r.Context()

    var req PredictRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }

    // Check cache first
    cacheKey := cache.GenerateCacheKey(req.StoreNbr, req.Family, req.Date, req.Horizon)
    if h.cache != nil {
        if cached, err := h.cache.GetPrediction(ctx, cacheKey); err == nil {
            resp := PredictResponse{
                StoreNbr:   cached.StoreNbr,
                Family:     cached.Family,
                Date:       cached.Date,
                Prediction: cached.Prediction,
                Cached:     true,
                LatencyMs:  float64(time.Since(start).Microseconds()) / 1000,
            }
            w.Header().Set("Content-Type", "application/json")
            json.NewEncoder(w).Encode(resp)
            return
        }
    }

    // Run inference
    prediction, err := h.onnx.Predict(req.Features)
    if err != nil {
        log.Error().Err(err).Msg("inference failed")
        http.Error(w, "inference failed", http.StatusInternalServerError)
        return
    }

    // Cache result
    if h.cache != nil {
        result := &cache.PredictionResult{
            StoreNbr:   req.StoreNbr,
            Family:     req.Family,
            Date:       req.Date,
            Prediction: prediction,
        }
        h.cache.SetPrediction(ctx, cacheKey, result, time.Hour)
    }

    resp := PredictResponse{
        StoreNbr:   req.StoreNbr,
        Family:     req.Family,
        Date:       req.Date,
        Prediction: prediction,
        Cached:     false,
        LatencyMs:  float64(time.Since(start).Microseconds()) / 1000,
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(resp)
}

func (h *Handlers) Health(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)
    w.Write([]byte(`{"status":"healthy"}`))
}
```

#### 6. SHAP Explanation Endpoint
**File**: `mlrf-api/internal/handlers/explain.go`

```go
package handlers

import (
    "encoding/json"
    "net/http"
    "os"
)

type ExplainRequest struct {
    StoreNbr int    `json:"store_nbr"`
    Family   string `json:"family"`
    Date     string `json:"date"`
}

type WaterfallFeature struct {
    Name       string  `json:"name"`
    Value      float64 `json:"value"`
    ShapValue  float64 `json:"shap_value"`
    Cumulative float64 `json:"cumulative"`
    Direction  string  `json:"direction"`
}

type ExplainResponse struct {
    BaseValue  float64            `json:"base_value"`
    Features   []WaterfallFeature `json:"features"`
    Prediction float64            `json:"prediction"`
}

// For now, serve pre-computed SHAP values from JSON file
// In production, compute on-demand or use a Python sidecar
func (h *Handlers) Explain(w http.ResponseWriter, r *http.Request) {
    var req ExplainRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "invalid request body", http.StatusBadRequest)
        return
    }

    // Load pre-computed SHAP data
    // Key: store_family format
    shapFile := "models/shap_data.json"
    data, err := os.ReadFile(shapFile)
    if err != nil {
        http.Error(w, "SHAP data not found", http.StatusNotFound)
        return
    }

    var shapData map[string]ExplainResponse
    if err := json.Unmarshal(data, &shapData); err != nil {
        http.Error(w, "failed to parse SHAP data", http.StatusInternalServerError)
        return
    }

    // Look up by store_family
    key := fmt.Sprintf("%d_%s", req.StoreNbr, req.Family)
    resp, ok := shapData[key]
    if !ok {
        http.Error(w, "no SHAP data for this combination", http.StatusNotFound)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(resp)
}
```

#### 7. Dockerfile
**File**: `mlrf-api/Dockerfile`

```dockerfile
FROM golang:1.22-bookworm AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=1 go build -o server ./cmd/server

FROM debian:bookworm-slim

# Install ONNX Runtime
RUN apt-get update && apt-get install -y wget && \
    wget https://github.com/microsoft/onnxruntime/releases/download/v1.17.1/onnxruntime-linux-x64-1.17.1.tgz && \
    tar -xzf onnxruntime-linux-x64-1.17.1.tgz && \
    cp onnxruntime-linux-x64-1.17.1/lib/* /usr/lib/ && \
    rm -rf onnxruntime-linux-x64-1.17.1* && \
    apt-get clean

WORKDIR /app
COPY --from=builder /app/server .
COPY models/ ./models/

EXPOSE 8080
CMD ["./server"]
```

### Success Criteria:

#### Automated Verification:
- [ ] Go builds: `go build ./cmd/server`
- [ ] Tests pass: `go test ./...`
- [ ] Docker builds: `docker build -t mlrf-api .`
- [ ] Health endpoint returns 200: `curl localhost:8080/health`

#### Manual Verification:
- [ ] Predict endpoint returns valid predictions
- [ ] P95 latency < 10ms with warm cache
- [ ] Explain endpoint returns waterfall data
- [ ] Cache hit ratio > 80% for repeated requests

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 1.4: React Dashboard (Days 15-21)

### Overview
Build interactive dashboard with SHAP waterfall, hierarchy drilldown, and model comparison.

### Changes Required:

#### 1. Project Setup
**File**: `mlrf-dashboard/package.json`

```json
{
  "name": "mlrf-dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bunx --bun vite",
    "build": "bunx --bun vite build",
    "preview": "bunx --bun vite preview",
    "lint": "bunx eslint . --ext ts,tsx",
    "typecheck": "bunx tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0",
    "@tanstack/react-query": "^5.28.0",
    "@visx/group": "^3.3.0",
    "@visx/scale": "^3.5.0",
    "@visx/shape": "^3.5.0",
    "@visx/axis": "^3.5.0",
    "@visx/tooltip": "^3.3.0",
    "recharts": "^2.12.0",
    "date-fns": "^3.3.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-tooltip": "^1.0.7",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "class-variance-authority": "^0.7.0",
    "lucide-react": "^0.344.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.18",
    "eslint": "^8.57.0",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.4.0",
    "vite": "^5.1.0"
  }
}
```

#### 2. API Client
**File**: `mlrf-dashboard/src/lib/api.ts`

```typescript
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export interface PredictRequest {
  store_nbr: number;
  family: string;
  date: string;
  features: number[];
  horizon: number;
}

export interface PredictResponse {
  store_nbr: number;
  family: string;
  date: string;
  prediction: number;
  cached: boolean;
  latency_ms: number;
}

export interface WaterfallFeature {
  name: string;
  value: number | null;
  shap_value: number;
  cumulative: number;
  direction: 'positive' | 'negative';
}

export interface ExplainResponse {
  base_value: number;
  features: WaterfallFeature[];
  prediction: number;
}

export interface HierarchyNode {
  id: string;
  name: string;
  level: 'total' | 'store' | 'family' | 'bottom';
  prediction: number;
  actual?: number;
  children?: HierarchyNode[];
}

export async function fetchPrediction(req: PredictRequest): Promise<PredictResponse> {
  const res = await fetch(`${API_BASE}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`Prediction failed: ${res.statusText}`);
  return res.json();
}

export async function fetchExplanation(
  storeNbr: number,
  family: string,
  date: string
): Promise<ExplainResponse> {
  const res = await fetch(`${API_BASE}/explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store_nbr: storeNbr, family, date }),
  });
  if (!res.ok) throw new Error(`Explanation failed: ${res.statusText}`);
  return res.json();
}

export async function fetchHierarchy(date: string): Promise<HierarchyNode> {
  const res = await fetch(`${API_BASE}/hierarchy?date=${date}`);
  if (!res.ok) throw new Error(`Hierarchy fetch failed: ${res.statusText}`);
  return res.json();
}
```

#### 3. SHAP Waterfall Component
**File**: `mlrf-dashboard/src/components/ShapWaterfall.tsx`

```typescript
import { useMemo } from 'react';
import { Group } from '@visx/group';
import { scaleBand, scaleLinear } from '@visx/scale';
import { Bar } from '@visx/shape';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { useTooltip, TooltipWithBounds } from '@visx/tooltip';
import type { WaterfallFeature } from '../lib/api';

interface ShapWaterfallProps {
  baseValue: number;
  features: WaterfallFeature[];
  prediction: number;
  width?: number;
  height?: number;
}

export function ShapWaterfall({
  baseValue,
  features,
  prediction,
  width = 600,
  height = 400,
}: ShapWaterfallProps) {
  const margin = { top: 20, right: 30, bottom: 40, left: 120 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const {
    tooltipOpen,
    tooltipData,
    tooltipLeft,
    tooltipTop,
    showTooltip,
    hideTooltip,
  } = useTooltip<WaterfallFeature>();

  // Add base and prediction to data
  const chartData = useMemo(() => {
    const data: Array<{
      name: string;
      start: number;
      end: number;
      value: number;
      direction: 'positive' | 'negative' | 'base' | 'prediction';
    }> = [];

    // Base value bar
    data.push({
      name: 'Base Value',
      start: 0,
      end: baseValue,
      value: baseValue,
      direction: 'base',
    });

    // Feature contributions
    let cumulative = baseValue;
    for (const f of features) {
      const start = cumulative;
      cumulative += f.shap_value;
      data.push({
        name: f.name,
        start: Math.min(start, cumulative),
        end: Math.max(start, cumulative),
        value: f.shap_value,
        direction: f.direction,
      });
    }

    // Final prediction
    data.push({
      name: 'Prediction',
      start: 0,
      end: prediction,
      value: prediction,
      direction: 'prediction',
    });

    return data;
  }, [baseValue, features, prediction]);

  const yScale = scaleBand({
    domain: chartData.map((d) => d.name),
    range: [0, innerHeight],
    padding: 0.3,
  });

  const xMin = Math.min(...chartData.map((d) => d.start), 0);
  const xMax = Math.max(...chartData.map((d) => d.end));

  const xScale = scaleLinear({
    domain: [xMin - Math.abs(xMin) * 0.1, xMax + Math.abs(xMax) * 0.1],
    range: [0, innerWidth],
    nice: true,
  });

  const getBarColor = (direction: string) => {
    switch (direction) {
      case 'positive':
        return '#ef4444'; // red
      case 'negative':
        return '#3b82f6'; // blue
      case 'base':
        return '#6b7280'; // gray
      case 'prediction':
        return '#10b981'; // green
      default:
        return '#6b7280';
    }
  };

  return (
    <div className="relative">
      <svg width={width} height={height}>
        <Group left={margin.left} top={margin.top}>
          {chartData.map((d) => {
            const barY = yScale(d.name) ?? 0;
            const barHeight = yScale.bandwidth();
            const barX = xScale(d.start);
            const barWidth = Math.abs(xScale(d.end) - xScale(d.start));

            return (
              <Bar
                key={d.name}
                x={barX}
                y={barY}
                width={barWidth}
                height={barHeight}
                fill={getBarColor(d.direction)}
                rx={2}
                onMouseEnter={(e) => {
                  const feature = features.find((f) => f.name === d.name);
                  if (feature) {
                    showTooltip({
                      tooltipData: feature,
                      tooltipLeft: e.clientX,
                      tooltipTop: e.clientY,
                    });
                  }
                }}
                onMouseLeave={hideTooltip}
              />
            );
          })}
          <AxisLeft
            scale={yScale}
            tickLabelProps={() => ({
              fontSize: 11,
              textAnchor: 'end',
              dy: '0.33em',
            })}
          />
          <AxisBottom
            scale={xScale}
            top={innerHeight}
            tickLabelProps={() => ({
              fontSize: 11,
              textAnchor: 'middle',
            })}
          />
        </Group>
      </svg>

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds left={tooltipLeft} top={tooltipTop}>
          <div className="text-sm">
            <div className="font-semibold">{tooltipData.name}</div>
            <div>Value: {tooltipData.value?.toFixed(2) ?? 'N/A'}</div>
            <div>SHAP: {tooltipData.shap_value.toFixed(4)}</div>
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
}
```

#### 4. Hierarchy Drilldown Component
**File**: `mlrf-dashboard/src/components/HierarchyDrilldown.tsx`

```typescript
import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { HierarchyNode } from '../lib/api';

interface HierarchyDrilldownProps {
  data: HierarchyNode;
  onSelect?: (node: HierarchyNode) => void;
}

export function HierarchyDrilldown({ data, onSelect }: HierarchyDrilldownProps) {
  const [selectedPath, setSelectedPath] = useState<string[]>(['Total']);
  const [currentNode, setCurrentNode] = useState<HierarchyNode>(data);

  const handleDrillDown = (node: HierarchyNode) => {
    if (node.children && node.children.length > 0) {
      setSelectedPath([...selectedPath, node.name]);
      setCurrentNode(node);
      onSelect?.(node);
    }
  };

  const handleDrillUp = (index: number) => {
    const newPath = selectedPath.slice(0, index + 1);
    setSelectedPath(newPath);

    // Navigate back to that node
    let node = data;
    for (let i = 1; i < newPath.length; i++) {
      const child = node.children?.find((c) => c.name === newPath[i]);
      if (child) node = child;
    }
    setCurrentNode(node);
    onSelect?.(node);
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'total':
        return 'bg-purple-100 text-purple-800';
      case 'store':
        return 'bg-blue-100 text-blue-800';
      case 'family':
        return 'bg-green-100 text-green-800';
      case 'bottom':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav className="flex items-center space-x-2 text-sm">
        {selectedPath.map((name, index) => (
          <span key={name} className="flex items-center">
            {index > 0 && <span className="mx-2 text-gray-400">/</span>}
            <button
              onClick={() => handleDrillUp(index)}
              className={`hover:underline ${
                index === selectedPath.length - 1 ? 'font-semibold' : ''
              }`}
            >
              {name}
            </button>
          </span>
        ))}
      </nav>

      {/* Current level summary */}
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{currentNode.name}</h3>
            <span
              className={`inline-block rounded px-2 py-1 text-xs ${getLevelColor(
                currentNode.level
              )}`}
            >
              {currentNode.level.toUpperCase()}
            </span>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">
              ${currentNode.prediction.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </div>
            <div className="text-sm text-gray-500">Predicted Revenue</div>
          </div>
        </div>
      </div>

      {/* Children grid */}
      {currentNode.children && currentNode.children.length > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {currentNode.children.map((child) => (
            <button
              key={child.id}
              onClick={() => handleDrillDown(child)}
              className="rounded-lg border bg-white p-4 text-left shadow-sm transition hover:shadow-md"
            >
              <div className="font-medium">{child.name}</div>
              <div className="mt-2 text-lg font-semibold">
                ${child.prediction.toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
              </div>
              {child.children && (
                <div className="mt-1 text-xs text-gray-500">
                  {child.children.length} items →
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

#### 5. Model Comparison Component
**File**: `mlrf-dashboard/src/components/ModelComparison.tsx`

```typescript
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface ModelMetric {
  model: string;
  rmsle: number;
  mape: number;
  rmse: number;
}

interface ModelComparisonProps {
  data: ModelMetric[];
  selectedMetric?: 'rmsle' | 'mape' | 'rmse';
}

export function ModelComparison({
  data,
  selectedMetric = 'rmsle',
}: ModelComparisonProps) {
  const sortedData = [...data].sort((a, b) => a[selectedMetric] - b[selectedMetric]);

  const getBarColor = (index: number) => {
    if (index === 0) return '#10b981'; // Best model - green
    if (index === sortedData.length - 1) return '#ef4444'; // Worst - red
    return '#3b82f6'; // Others - blue
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Model Performance Comparison</h3>
        <select
          value={selectedMetric}
          onChange={(e) => {
            // Would need state lifting for this to work
          }}
          className="rounded border px-3 py-1.5 text-sm"
        >
          <option value="rmsle">RMSLE</option>
          <option value="mape">MAPE</option>
          <option value="rmse">RMSE</option>
        </select>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={sortedData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="model" type="category" width={150} />
          <Tooltip
            formatter={(value: number) => value.toFixed(4)}
            labelFormatter={(label) => `Model: ${label}`}
          />
          <Bar
            dataKey={selectedMetric}
            fill="#3b82f6"
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>

      {/* Best model highlight */}
      <div className="rounded-lg bg-green-50 p-4">
        <div className="flex items-center space-x-2">
          <span className="text-green-600">★</span>
          <span className="font-medium">Best Model:</span>
          <span>{sortedData[0]?.model}</span>
          <span className="text-gray-500">
            ({selectedMetric.toUpperCase()}: {sortedData[0]?.[selectedMetric].toFixed(4)})
          </span>
        </div>
      </div>
    </div>
  );
}
```

#### 6. Dashboard Page
**File**: `mlrf-dashboard/src/pages/Dashboard.tsx`

```typescript
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShapWaterfall } from '../components/ShapWaterfall';
import { HierarchyDrilldown } from '../components/HierarchyDrilldown';
import { ModelComparison } from '../components/ModelComparison';
import { fetchExplanation, fetchHierarchy } from '../lib/api';

// Mock data for initial development
const mockModels = [
  { model: 'LightGBM + MinTrace', rmsle: 0.42, mape: 0.15, rmse: 1250 },
  { model: 'AutoARIMA + BottomUp', rmsle: 0.48, mape: 0.18, rmse: 1450 },
  { model: 'ETS + TopDown', rmsle: 0.51, mape: 0.21, rmse: 1580 },
  { model: 'SeasonalNaive', rmsle: 0.65, mape: 0.28, rmse: 2100 },
];

export function Dashboard() {
  const [selectedDate] = useState('2017-08-01');
  const [selectedStore, setSelectedStore] = useState(1);
  const [selectedFamily, setSelectedFamily] = useState('GROCERY I');

  const { data: hierarchyData, isLoading: hierarchyLoading } = useQuery({
    queryKey: ['hierarchy', selectedDate],
    queryFn: () => fetchHierarchy(selectedDate),
  });

  const { data: explanationData, isLoading: explanationLoading } = useQuery({
    queryKey: ['explanation', selectedStore, selectedFamily, selectedDate],
    queryFn: () => fetchExplanation(selectedStore, selectedFamily, selectedDate),
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Multi-LOB Revenue Forecasting
        </h1>
        <p className="text-gray-600">
          90-day forecast with SHAP explainability
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* SHAP Waterfall - Priority A */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold">
            Forecast Explanation
          </h2>
          {explanationLoading ? (
            <div className="flex h-64 items-center justify-center">
              Loading...
            </div>
          ) : explanationData ? (
            <ShapWaterfall
              baseValue={explanationData.base_value}
              features={explanationData.features}
              prediction={explanationData.prediction}
              width={500}
              height={400}
            />
          ) : (
            <div className="text-gray-500">Select a forecast to explain</div>
          )}
        </div>

        {/* Model Comparison - Priority D */}
        <div className="rounded-lg bg-white p-6 shadow">
          <ModelComparison data={mockModels} selectedMetric="rmsle" />
        </div>

        {/* Hierarchy Drilldown - Priority B */}
        <div className="col-span-2 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold">
            Revenue by Hierarchy
          </h2>
          {hierarchyLoading ? (
            <div className="flex h-64 items-center justify-center">
              Loading...
            </div>
          ) : hierarchyData ? (
            <HierarchyDrilldown
              data={hierarchyData}
              onSelect={(node) => {
                // Extract store/family from selection
                if (node.level === 'bottom') {
                  const [store, family] = node.id.split('_');
                  setSelectedStore(parseInt(store));
                  setSelectedFamily(family);
                }
              }}
            />
          ) : (
            <div className="text-gray-500">Loading hierarchy...</div>
          )}
        </div>
      </div>
    </div>
  );
}
```

#### 7. Dockerfile
**File**: `mlrf-dashboard/Dockerfile`

```dockerfile
FROM oven/bun:1 AS builder

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `bun run typecheck`
- [ ] Lint passes: `bun run lint`
- [ ] Build succeeds: `bun run build`
- [ ] Docker builds: `docker build -t mlrf-dashboard .`

#### Manual Verification:
- [ ] SHAP waterfall displays correctly with positive/negative bars
- [ ] Hierarchy drilldown navigates Total → Store → Family → Bottom
- [ ] Model comparison shows ranked models
- [ ] Dashboard loads in < 2 seconds

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to integration.

---

## Phase 1.5: Integration & Deployment (Days 22-28)

### Overview
Wire everything together with Docker Compose and ensure end-to-end functionality.

### Changes Required:

#### 1. Docker Compose
**File**: `docker-compose.yml`

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3

  api:
    build: ./mlrf-api
    ports:
      - "8080:8080"
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      redis:
        condition: service_healthy
    volumes:
      - ./models:/app/models:ro
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  dashboard:
    build: ./mlrf-dashboard
    ports:
      - "3000:80"
    environment:
      - VITE_API_URL=http://localhost:8080
    depends_on:
      - api

volumes:
  redis-data:
```

#### 2. README
**File**: `README.md`

```markdown
# Multi-LOB Revenue Forecasting System (MLRF)

Production-grade revenue forecasting system with hierarchical reconciliation and SHAP explainability.

## Quick Start

```bash
# 1. Download data
cd mlrf-data && python -m mlrf_data.download

# 2. Train models
cd ../mlrf-ml && python -m mlrf_ml.train

# 3. Start system
cd .. && docker-compose up -d

# 4. Open dashboard
open http://localhost:3000
```

## Architecture

- **Data Processing**: Polars (Python) - Rust-backed dataframes
- **ML Pipeline**: LightGBM + statsforecast + hierarchicalforecast
- **API**: Go + ONNX Runtime - <10ms inference
- **Dashboard**: React + TypeScript + visx

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/predict` | POST | Single prediction |
| `/predict/batch` | POST | Batch predictions |
| `/explain` | POST | SHAP explanation |
| `/hierarchy` | GET | Hierarchy tree |

## Performance

- API P95 latency: <10ms (with cache)
- Dashboard load: <2s
- Model RMSLE: <0.5

## License

MIT
```

### Success Criteria:

#### Automated Verification:
- [ ] `docker-compose up -d` starts all services
- [ ] Health checks pass: `curl localhost:8080/health`
- [ ] Dashboard accessible: `curl localhost:3000`

#### Manual Verification:
- [ ] Full flow works: Select hierarchy → View forecast → See SHAP explanation
- [ ] API responds in <10ms with cache hits
- [ ] Dashboard renders correctly on desktop and tablet

---

## Testing Strategy

### Unit Tests:
- Data validation (no nulls, correct types)
- Feature engineering (lag values correct)
- SHAP output format
- API request/response serialization

### Integration Tests:
- ML pipeline end-to-end (raw data → predictions)
- API with Redis caching
- Dashboard API integration

### Manual Testing Steps:
1. Download Kaggle data and verify files
2. Run feature engineering, check for data leakage
3. Train models, verify RMSLE < 0.5
4. Start Docker Compose, verify all services healthy
5. Navigate hierarchy drilldown (Total → Store → Family)
6. Select a forecast, verify SHAP waterfall displays
7. Compare models, verify ranking correct

---

## Performance Considerations

### Data Pipeline
- Polars lazy evaluation for memory efficiency
- Parquet format for disk storage (10x smaller than CSV)

### ML Training
- LightGBM early stopping to prevent overfitting
- Walk-forward validation with 90-day gaps

### Go API
- Pre-allocated tensors for ONNX inference
- Redis with TinyLFU local cache
- Connection pooling

### Dashboard
- React Query for caching and deduplication
- Lazy loading for hierarchy children
- Debounced search inputs

---

## References

- Kaggle Competition: https://www.kaggle.com/competitions/store-sales-time-series-forecasting
- hierarchicalforecast docs: https://nixtla.github.io/hierarchicalforecast/
- statsforecast docs: https://nixtla.github.io/statsforecast/
- SHAP docs: https://shap.readthedocs.io/
- onnxruntime-go: https://github.com/yalue/onnxruntime_go
- visx: https://airbnb.io/visx/
