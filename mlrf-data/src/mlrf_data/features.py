"""Create features for multiple forecast horizons using Polars."""

from pathlib import Path

import polars as pl


def create_lag_features(
    df: pl.DataFrame,
    group_cols: list[str],
    target_col: str = "sales",
    lags: list[int] | None = None,
) -> pl.DataFrame:
    """
    Create lag features per group.

    Parameters
    ----------
    df : pl.DataFrame
        Input data sorted by group and date
    group_cols : list[str]
        Columns to group by (e.g., ["store_nbr", "family"])
    target_col : str
        Target column to create lags for
    lags : list[int], optional
        List of lag periods. Defaults to [1, 7, 14, 28, 90]

    Returns
    -------
    pl.DataFrame
        Data with lag features added
    """
    if lags is None:
        lags = [1, 7, 14, 28, 90]

    for lag in lags:
        df = df.with_columns(
            pl.col(target_col).shift(lag).over(group_cols).alias(f"{target_col}_lag_{lag}")
        )

    return df


def create_rolling_features(
    df: pl.DataFrame,
    group_cols: list[str],
    target_col: str = "sales",
    windows: list[int] | None = None,
) -> pl.DataFrame:
    """
    Create rolling statistics per group.

    Parameters
    ----------
    df : pl.DataFrame
        Input data sorted by group and date
    group_cols : list[str]
        Columns to group by
    target_col : str
        Target column to compute rolling stats for
    windows : list[int], optional
        List of rolling window sizes. Defaults to [7, 14, 28, 90]

    Returns
    -------
    pl.DataFrame
        Data with rolling mean and std features
    """
    if windows is None:
        windows = [7, 14, 28, 90]

    for window in windows:
        # Rolling mean (shifted by 1 to prevent data leakage)
        df = df.with_columns(
            pl.col(target_col)
            .shift(1)
            .rolling_mean(window_size=window)
            .over(group_cols)
            .alias(f"{target_col}_rolling_mean_{window}")
        )

        # Rolling std (shifted by 1 to prevent data leakage)
        df = df.with_columns(
            pl.col(target_col)
            .shift(1)
            .rolling_std(window_size=window)
            .over(group_cols)
            .alias(f"{target_col}_rolling_std_{window}")
        )

    return df


def create_date_features(df: pl.DataFrame) -> pl.DataFrame:
    """
    Extract date components as features.

    Parameters
    ----------
    df : pl.DataFrame
        Data with date column

    Returns
    -------
    pl.DataFrame
        Data with date features added
    """
    return df.with_columns(
        [
            pl.col("date").dt.year().alias("year"),
            pl.col("date").dt.month().alias("month"),
            pl.col("date").dt.day().alias("day"),
            pl.col("date").dt.weekday().alias("dayofweek"),
            pl.col("date").dt.ordinal_day().alias("dayofyear"),
            (pl.col("date").dt.day() == 15).cast(pl.Int8).alias("is_mid_month"),
            pl.col("date").dt.is_leap_year().cast(pl.Int8).alias("is_leap_year"),
            # Week of month (approximately)
            ((pl.col("date").dt.day() - 1) // 7 + 1).alias("week_of_month"),
            # Quarter
            ((pl.col("date").dt.month() - 1) // 3 + 1).alias("quarter"),
        ]
    )


def create_promotion_features(df: pl.DataFrame) -> pl.DataFrame:
    """
    Create promotion-related features.

    Parameters
    ----------
    df : pl.DataFrame
        Data with onpromotion column

    Returns
    -------
    pl.DataFrame
        Data with promotion features added
    """
    # Check if onpromotion column exists
    if "onpromotion" not in df.columns:
        return df

    return df.with_columns(
        [
            pl.col("onpromotion").fill_null(0),
            # Rolling sum of promotions (last 7 days)
            pl.col("onpromotion")
            .shift(1)
            .rolling_sum(window_size=7)
            .over(["store_nbr", "family"])
            .fill_null(0)
            .alias("promo_rolling_7"),
        ]
    )


def create_store_family_features(df: pl.DataFrame) -> pl.DataFrame:
    """
    Create store and family interaction features.

    Parameters
    ----------
    df : pl.DataFrame
        Data with store_nbr and family columns

    Returns
    -------
    pl.DataFrame
        Data with store-family interaction features
    """
    # Create unique identifier for store-family combination
    df = df.with_columns(
        (pl.col("store_nbr").cast(pl.Utf8) + "_" + pl.col("family")).alias("unique_id")
    )

    return df


def build_feature_matrix(
    df: pl.DataFrame,
    forecast_horizon: int = 90,
) -> pl.DataFrame:
    """
    Build complete feature matrix for given horizon.

    This function creates all features needed for the forecasting model,
    including lags, rolling statistics, date features, and promotions.

    Parameters
    ----------
    df : pl.DataFrame
        Preprocessed data with date, store_nbr, family, sales columns
    forecast_horizon : int
        Maximum forecast horizon in days (determines which lags to include)

    Returns
    -------
    pl.DataFrame
        Feature matrix with all features, ready for modeling
    """
    group_cols = ["store_nbr", "family"]

    # Sort by group and date (critical for correct lag computation)
    df = df.sort(group_cols + ["date"])

    # Create all features
    print("Creating date features...")
    df = create_date_features(df)

    print("Creating promotion features...")
    df = create_promotion_features(df)

    print("Creating store-family features...")
    df = create_store_family_features(df)

    # Determine lag periods - include forecast_horizon as the maximum lag
    # This ensures we can predict up to forecast_horizon days out
    lags = [1, 7, 14, 28, forecast_horizon]
    print(f"Creating lag features: {lags}...")
    df = create_lag_features(df, group_cols, lags=lags)

    # Rolling windows
    windows = [7, 14, 28, forecast_horizon]
    print(f"Creating rolling features: {windows}...")
    df = create_rolling_features(df, group_cols, windows=windows)

    # Drop rows with null lags (first `forecast_horizon` days per group)
    # This prevents data leakage and ensures all features are available
    initial_rows = df.height
    df = df.drop_nulls(subset=[f"sales_lag_{forecast_horizon}"])
    dropped_rows = initial_rows - df.height
    print(f"Dropped {dropped_rows:,} rows with null lags (first {forecast_horizon} days per group)")

    return df


def features_pipeline(
    processed_dir: Path,
    features_dir: Path,
    forecast_horizon: int = 90,
) -> pl.DataFrame:
    """
    Run full feature engineering pipeline.

    Parameters
    ----------
    processed_dir : Path
        Directory containing preprocessed Parquet file
    features_dir : Path
        Directory to save feature matrix
    forecast_horizon : int
        Maximum forecast horizon in days

    Returns
    -------
    pl.DataFrame
        Feature matrix ready for model training
    """
    features_dir.mkdir(parents=True, exist_ok=True)

    # Load preprocessed data
    input_path = processed_dir / "train_preprocessed.parquet"
    print(f"Loading preprocessed data from {input_path}...")
    df = pl.read_parquet(input_path)
    print(f"Loaded {df.height:,} rows")

    # Build feature matrix
    df = build_feature_matrix(df, forecast_horizon=forecast_horizon)

    # Save feature matrix
    output_path = features_dir / "feature_matrix.parquet"
    df.write_parquet(output_path)
    print(f"Saved feature matrix to {output_path}")
    print(f"Final shape: {df.height:,} rows, {df.width} columns")

    return df


if __name__ == "__main__":
    project_root = Path(__file__).parent.parent.parent.parent
    processed_dir = project_root / "data" / "processed"
    features_dir = project_root / "data" / "features"

    features_pipeline(processed_dir, features_dir, forecast_horizon=90)
