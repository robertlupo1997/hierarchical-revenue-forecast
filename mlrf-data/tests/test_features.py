"""Tests for features module."""

import polars as pl

from mlrf_data.features import (
    build_feature_matrix,
    create_date_features,
    create_lag_features,
    create_rolling_features,
)


def create_sample_data(n_days: int = 100, n_stores: int = 2, n_families: int = 2) -> pl.DataFrame:
    """Create sample data for testing."""
    start_date = pl.date(2017, 1, 1)
    end_date = start_date + pl.duration(days=n_days - 1)
    dates = pl.date_range(start_date, end_date, eager=True)

    rows = []
    for store in range(1, n_stores + 1):
        for family_idx in range(n_families):
            family = f"FAMILY_{family_idx}"
            for i, date in enumerate(dates):
                # Create predictable sales pattern
                rows.append({
                    "date": date,
                    "store_nbr": store,
                    "family": family,
                    "sales": float(100 + i * 10 + store * 5 + family_idx * 3),
                })

    return pl.DataFrame(rows)


def test_create_lag_features_values():
    """Test that lag features have correct values."""
    df = create_sample_data(n_days=10, n_stores=1, n_families=1)
    df = df.sort(["store_nbr", "family", "date"])

    result = create_lag_features(df, ["store_nbr", "family"], lags=[1, 7])

    # Lag 1 should be previous day's value
    sales = result["sales"].to_list()
    lag1 = result["sales_lag_1"].to_list()

    # First value should be null
    assert lag1[0] is None
    # Second value should be first day's sales
    assert lag1[1] == sales[0]
    # Third value should be second day's sales
    assert lag1[2] == sales[1]


def test_create_lag_features_by_group():
    """Test that lag features are computed separately per group."""
    df = create_sample_data(n_days=5, n_stores=2, n_families=1)
    df = df.sort(["store_nbr", "family", "date"])

    result = create_lag_features(df, ["store_nbr", "family"], lags=[1])

    # Get data for each store
    store1 = result.filter(pl.col("store_nbr") == 1).sort("date")
    store2 = result.filter(pl.col("store_nbr") == 2).sort("date")

    # First day of each store should have null lag
    assert store1["sales_lag_1"].to_list()[0] is None
    assert store2["sales_lag_1"].to_list()[0] is None

    # Second day's lag should be from same store
    assert store1["sales_lag_1"].to_list()[1] == store1["sales"].to_list()[0]
    assert store2["sales_lag_1"].to_list()[1] == store2["sales"].to_list()[0]


def test_create_rolling_features_no_data_leakage():
    """Test that rolling features don't leak future data."""
    # Create data with clear pattern
    df = pl.DataFrame({
        "date": pl.date_range(pl.date(2017, 1, 1), pl.date(2017, 1, 10), eager=True),
        "store_nbr": [1] * 10,
        "family": ["GROCERY"] * 10,
        "sales": [float(i * 100) for i in range(1, 11)],  # 100, 200, 300, ...
    })

    result = create_rolling_features(df, ["store_nbr", "family"], windows=[3])

    # Rolling mean of window 3 on day 5 (sales=500) should be mean of days 2,3,4 (200,300,400)
    # because we shift by 1 to prevent leakage
    row_idx = 4  # day 5 (0-indexed)
    expected_mean = (200 + 300 + 400) / 3
    actual_mean = result["sales_rolling_mean_3"].to_list()[row_idx]

    assert abs(actual_mean - expected_mean) < 0.001, f"Expected {expected_mean}, got {actual_mean}"


def test_create_date_features():
    """Test that date features are correctly extracted."""
    df = pl.DataFrame({
        "date": ["2017-01-01", "2017-02-15", "2020-02-29"],
        "sales": [100.0, 200.0, 300.0],
    }).with_columns(pl.col("date").str.to_date("%Y-%m-%d"))

    result = create_date_features(df)

    # Check year
    assert result["year"].to_list() == [2017, 2017, 2020]

    # Check month
    assert result["month"].to_list() == [1, 2, 2]

    # Check day
    assert result["day"].to_list() == [1, 15, 29]

    # Check is_mid_month
    assert result["is_mid_month"].to_list() == [0, 1, 0]

    # Check is_leap_year
    assert result["is_leap_year"].to_list() == [0, 0, 1]


def test_build_feature_matrix_drops_nulls():
    """Test that build_feature_matrix correctly drops rows with null lags."""
    df = create_sample_data(n_days=100, n_stores=2, n_families=2)

    # Build with horizon of 10
    result = build_feature_matrix(df, forecast_horizon=10)

    # Should have no null values in lag_10 column
    null_count = result.select(pl.col("sales_lag_10").null_count()).item()
    assert null_count == 0, f"Found {null_count} null values in sales_lag_10"


def test_build_feature_matrix_has_all_features():
    """Test that build_feature_matrix creates all expected features."""
    df = create_sample_data(n_days=100, n_stores=1, n_families=1)

    result = build_feature_matrix(df, forecast_horizon=10)

    # Check date features exist
    date_features = [
        "year", "month", "day", "dayofweek", "dayofyear", "is_mid_month", "is_leap_year"
    ]
    for feat in date_features:
        assert feat in result.columns, f"Missing date feature: {feat}"

    # Check lag features exist (horizon = 10)
    lag_features = ["sales_lag_1", "sales_lag_7", "sales_lag_10"]
    for feat in lag_features:
        assert feat in result.columns, f"Missing lag feature: {feat}"

    # Check rolling features exist
    rolling_features = ["sales_rolling_mean_7", "sales_rolling_std_7"]
    for feat in rolling_features:
        assert feat in result.columns, f"Missing rolling feature: {feat}"


def test_build_feature_matrix_unique_id():
    """Test that unique_id is created correctly."""
    # Need enough data for lags
    df = create_sample_data(n_days=100, n_stores=2, n_families=2)
    result = build_feature_matrix(df, forecast_horizon=10)

    assert "unique_id" in result.columns
    # Check format is "store_family"
    sample_id = result["unique_id"].to_list()[0]
    assert "_" in sample_id
