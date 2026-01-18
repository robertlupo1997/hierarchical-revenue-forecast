"""Tests for validation metrics module."""

import numpy as np
import polars as pl

from mlrf_ml.validation import (
    compute_all_metrics,
    mae,
    mape,
    rmse,
    rmsle,
    walk_forward_split,
)


def test_rmsle_perfect_prediction():
    """Test RMSLE with perfect predictions."""
    y_true = np.array([100, 200, 300, 400, 500])
    y_pred = np.array([100, 200, 300, 400, 500])

    score = rmsle(y_true, y_pred)
    assert score == 0.0


def test_rmsle_known_value():
    """Test RMSLE with known values."""
    y_true = np.array([1, 10, 100])
    y_pred = np.array([1, 10, 100])

    score = rmsle(y_true, y_pred)
    assert score == 0.0


def test_rmsle_handles_zeros():
    """Test RMSLE handles zero values correctly."""
    y_true = np.array([0, 10, 100])
    y_pred = np.array([0, 10, 100])

    score = rmsle(y_true, y_pred)
    assert score == 0.0


def test_rmsle_handles_negative_predictions():
    """Test RMSLE clips negative predictions to zero."""
    y_true = np.array([10, 20, 30])
    y_pred = np.array([-5, 20, 30])

    # Should not raise error
    score = rmsle(y_true, y_pred)
    assert score > 0  # Non-zero because of clipped prediction


def test_rmse_perfect_prediction():
    """Test RMSE with perfect predictions."""
    y_true = np.array([100, 200, 300])
    y_pred = np.array([100, 200, 300])

    score = rmse(y_true, y_pred)
    assert score == 0.0


def test_rmse_known_value():
    """Test RMSE with known error."""
    y_true = np.array([100, 200, 300])
    y_pred = np.array([110, 210, 310])  # All predictions 10 higher

    score = rmse(y_true, y_pred)
    assert abs(score - 10.0) < 1e-6


def test_mae_perfect_prediction():
    """Test MAE with perfect predictions."""
    y_true = np.array([100, 200, 300])
    y_pred = np.array([100, 200, 300])

    score = mae(y_true, y_pred)
    assert score == 0.0


def test_mae_known_value():
    """Test MAE with known error."""
    y_true = np.array([100, 200, 300])
    y_pred = np.array([90, 210, 300])  # Errors: 10, 10, 0

    score = mae(y_true, y_pred)
    expected = (10 + 10 + 0) / 3
    assert abs(score - expected) < 1e-6


def test_mape_perfect_prediction():
    """Test MAPE with perfect predictions."""
    y_true = np.array([100, 200, 300])
    y_pred = np.array([100, 200, 300])

    score = mape(y_true, y_pred)
    assert score == 0.0


def test_compute_all_metrics():
    """Test compute_all_metrics returns all expected keys."""
    y_true = np.array([100, 200, 300])
    y_pred = np.array([110, 190, 310])

    metrics = compute_all_metrics(y_true, y_pred)

    assert "rmsle" in metrics
    assert "rmse" in metrics
    assert "mae" in metrics
    assert "mape" in metrics
    assert "n_samples" in metrics
    assert metrics["n_samples"] == 3


def test_walk_forward_split_creates_splits():
    """Test walk_forward_split creates correct number of splits."""
    # Create sample data spanning 1 year
    dates = pl.date_range(pl.date(2017, 1, 1), pl.date(2017, 12, 31), eager=True)
    df = pl.DataFrame({
        "date": dates,
        "value": list(range(len(dates))),
    })

    splits = walk_forward_split(
        df,
        date_col="date",
        train_days=180,
        valid_days=30,
        gap_days=0,
        n_splits=3,
        step_days=30,
    )

    assert len(splits) <= 3
    assert all(len(s) == 2 for s in splits)  # Each split is (train, valid) tuple


def test_walk_forward_split_no_data_leakage():
    """Test walk_forward_split ensures no data leakage between train and valid."""
    dates = pl.date_range(pl.date(2017, 1, 1), pl.date(2017, 12, 31), eager=True)
    df = pl.DataFrame({
        "date": dates,
        "value": list(range(len(dates))),
    })

    splits = walk_forward_split(
        df,
        date_col="date",
        train_days=180,
        valid_days=30,
        gap_days=0,
        n_splits=2,
        step_days=30,
    )

    for train_df, valid_df in splits:
        train_max = train_df.select(pl.col("date").max()).item()
        valid_min = valid_df.select(pl.col("date").min()).item()

        # Train max should be before valid min
        assert train_max < valid_min, "Data leakage detected: train dates overlap with valid"


def test_walk_forward_split_with_gap():
    """Test walk_forward_split respects gap between train and valid."""
    dates = pl.date_range(pl.date(2017, 1, 1), pl.date(2017, 12, 31), eager=True)
    df = pl.DataFrame({
        "date": dates,
        "value": list(range(len(dates))),
    })

    gap_days = 30
    splits = walk_forward_split(
        df,
        date_col="date",
        train_days=150,
        valid_days=30,
        gap_days=gap_days,
        n_splits=2,
        step_days=30,
    )

    for train_df, valid_df in splits:
        train_max = train_df.select(pl.col("date").max()).item()
        valid_min = valid_df.select(pl.col("date").min()).item()

        # Gap should be at least gap_days
        actual_gap = (valid_min - train_max).days
        assert actual_gap >= gap_days, f"Gap {actual_gap} is less than {gap_days}"
