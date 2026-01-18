# Spec: Data Pipeline

## Job To Be Done
As a data scientist, I need to download, clean, and transform the Kaggle Store Sales dataset into a feature matrix suitable for time series forecasting with 90-day horizons.

## Requirements

### Data Download
- Download from Kaggle competition: `store-sales-time-series-forecasting`
- Files needed: train.csv, oil.csv, holidays_events.csv, stores.csv, transactions.csv
- Store in `data/raw/`
- Requires `~/.kaggle/kaggle.json` credentials

### Data Cleaning
- Parse dates correctly
- Handle negative sales (clip to 0)
- Forward-fill missing oil prices
- Filter to national holidays only
- Join store metadata

### Feature Engineering
- Date features: year, month, day, dayofweek, dayofyear, is_mid_month, is_leap_year
- Lag features: lag_1, lag_7, lag_14, lag_28, lag_90 (per store×family)
- Rolling features: rolling_mean and rolling_std for windows 7, 14, 28, 90
- Promotion features: onpromotion, promo_rolling_7

### Output
- Feature matrix at `data/features/feature_matrix.parquet`
- Expected shape: ~2.5M rows after dropping null lags
- Columns: all features + store_nbr, family, date, sales

## Constraints
- Use Polars (NOT Pandas) for all operations
- Use lazy evaluation where possible for memory efficiency
- Parquet format for storage (10x smaller than CSV)

## Verification
- No null values in required columns
- No data leakage (lag values from prior dates only)
- Hierarchy sums correctly (total = sum of stores)
- Shape > 2M rows
