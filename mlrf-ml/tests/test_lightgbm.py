"""Tests for LightGBM model module."""

import numpy as np
import polars as pl

from mlrf_ml.models.lightgbm_model import (
    create_train_valid_split,
    get_lgb_params,
    predict_lightgbm,
    prepare_features,
    train_lightgbm,
)


def create_sample_data(n_samples: int = 1000) -> pl.DataFrame:
    """Create sample data for testing."""
    np.random.seed(42)

    dates = pl.date_range(
        pl.date(2017, 1, 1),
        pl.date(2017, 1, 1) + pl.duration(days=n_samples - 1),
        eager=True,
    )

    return pl.DataFrame({
        "date": dates,
        "store_nbr": np.random.randint(1, 5, n_samples),
        "family": np.random.choice(["GROCERY", "BEVERAGES", "DAIRY"], n_samples),
        "sales": np.random.exponential(100, n_samples).astype(np.float64),
        "year": [d.year for d in dates],
        "month": [d.month for d in dates],
        "day": [d.day for d in dates],
        "dayofweek": [d.weekday() for d in dates],
        "dayofyear": np.arange(1, n_samples + 1) % 365 + 1,
        "is_mid_month": np.zeros(n_samples, dtype=np.int8),
        "is_leap_year": np.zeros(n_samples, dtype=np.int8),
        "oil_price": np.random.uniform(40, 60, n_samples),
        "is_holiday": np.random.randint(0, 2, n_samples),
        "onpromotion": np.random.randint(0, 2, n_samples),
        "promo_rolling_7": np.random.randint(0, 8, n_samples),
        "cluster": np.random.randint(1, 5, n_samples),
        "type": np.random.choice(["A", "B", "C"], n_samples),
        "sales_lag_1": np.random.exponential(100, n_samples),
        "sales_lag_7": np.random.exponential(100, n_samples),
        "sales_lag_14": np.random.exponential(100, n_samples),
        "sales_lag_28": np.random.exponential(100, n_samples),
        "sales_lag_90": np.random.exponential(100, n_samples),
        "sales_rolling_mean_7": np.random.exponential(100, n_samples),
        "sales_rolling_mean_14": np.random.exponential(100, n_samples),
        "sales_rolling_mean_28": np.random.exponential(100, n_samples),
        "sales_rolling_mean_90": np.random.exponential(100, n_samples),
        "sales_rolling_std_7": np.random.exponential(20, n_samples),
        "sales_rolling_std_14": np.random.exponential(20, n_samples),
        "sales_rolling_std_28": np.random.exponential(20, n_samples),
        "sales_rolling_std_90": np.random.exponential(20, n_samples),
    })


def test_get_lgb_params():
    """Test get_lgb_params returns valid parameters."""
    params = get_lgb_params()

    assert "objective" in params
    assert "metric" in params
    assert "boosting_type" in params
    assert params["objective"] == "regression"
    assert params["metric"] == "rmse"


def test_prepare_features():
    """Test prepare_features extracts correct columns."""
    df = create_sample_data(100)

    X, feature_names, cat_features = prepare_features(df)

    # Check output types
    assert hasattr(X, "values")  # Should be pandas DataFrame
    assert isinstance(feature_names, list)
    assert isinstance(cat_features, list)

    # Check categorical conversion
    for col in cat_features:
        assert str(X[col].dtype) == "category"


def test_prepare_features_handles_missing_columns():
    """Test prepare_features handles missing columns gracefully."""
    # Create minimal data without all features
    df = pl.DataFrame({
        "year": [2017, 2017],
        "month": [1, 2],
        "sales": [100.0, 200.0],
    })

    X, feature_names, cat_features = prepare_features(df)

    # Should only include available features
    assert "year" in feature_names
    assert "month" in feature_names
    assert len(feature_names) == 2


def test_create_train_valid_split():
    """Test create_train_valid_split creates correct splits."""
    df = create_sample_data(365)

    train_df, valid_df = create_train_valid_split(df, valid_days=90)

    # Check sizes are reasonable
    assert train_df.height > 0
    assert valid_df.height > 0
    assert train_df.height + valid_df.height == df.height

    # Check no overlap
    train_max = train_df.select(pl.col("date").max()).item()
    valid_min = valid_df.select(pl.col("date").min()).item()
    assert train_max < valid_min


def test_train_lightgbm():
    """Test train_lightgbm trains a model successfully."""
    df = create_sample_data(500)
    train_df, valid_df = create_train_valid_split(df, valid_days=100)

    model, feature_names = train_lightgbm(
        train_df,
        valid_df,
        target_col="sales",
        num_boost_round=10,  # Small for test speed
        early_stopping_rounds=5,
    )

    # Check model was trained
    assert model is not None
    assert len(feature_names) > 0

    # Check model can make predictions
    valid_pd = valid_df.select(feature_names).to_pandas()
    valid_pd = valid_pd.astype({"family": "category", "type": "category"})
    predictions = model.predict(valid_pd)
    assert len(predictions) == valid_df.height


def test_predict_lightgbm():
    """Test predict_lightgbm generates predictions."""
    df = create_sample_data(500)
    train_df, valid_df = create_train_valid_split(df, valid_days=100)

    model, feature_names = train_lightgbm(
        train_df,
        valid_df,
        num_boost_round=10,
        early_stopping_rounds=5,
    )

    predictions = predict_lightgbm(model, valid_df)

    assert len(predictions) == valid_df.height
    assert not np.any(np.isnan(predictions))


def test_train_lightgbm_predictions_reasonable():
    """Test that LightGBM predictions are in reasonable range."""
    df = create_sample_data(500)
    train_df, valid_df = create_train_valid_split(df, valid_days=100)

    model, feature_names = train_lightgbm(
        train_df,
        valid_df,
        num_boost_round=50,
        early_stopping_rounds=10,
    )

    predictions = predict_lightgbm(model, valid_df)
    actuals = valid_df.select("sales").to_numpy().ravel()

    # Predictions should be in similar range as actuals
    pred_mean = np.mean(predictions)
    actual_mean = np.mean(actuals)

    # Allow 50% deviation for mean (since it's synthetic data)
    assert abs(pred_mean - actual_mean) / actual_mean < 0.5
