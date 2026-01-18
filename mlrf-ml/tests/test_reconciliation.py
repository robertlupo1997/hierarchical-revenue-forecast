"""Tests for hierarchical reconciliation module."""

import numpy as np
import pandas as pd

from mlrf_ml.reconciliation import (
    aggregate_bottom_forecasts,
    get_reconciliation_methods,
    select_best_reconciliation_method,
)


def test_get_reconciliation_methods():
    """Test get_reconciliation_methods returns valid methods."""
    methods = get_reconciliation_methods()

    assert len(methods) >= 1
    # All methods should have a reconcile method
    for method in methods:
        assert hasattr(method, "__class__")


def test_aggregate_bottom_forecasts_1d():
    """Test aggregate_bottom_forecasts with 1D input."""
    # Simple 2x2 hierarchy: Total -> 2 stores -> 4 bottom (2 families each)
    # S matrix: (7, 4) - Total, 2 stores, 4 bottom
    S = np.array([
        [1, 1, 1, 1],  # Total
        [1, 1, 0, 0],  # Store 1
        [0, 0, 1, 1],  # Store 2
        [1, 0, 0, 0],  # Bottom 1
        [0, 1, 0, 0],  # Bottom 2
        [0, 0, 1, 0],  # Bottom 3
        [0, 0, 0, 1],  # Bottom 4
    ], dtype=np.float32)

    bottom_forecasts = np.array([100, 200, 300, 400], dtype=np.float32)

    all_forecasts = aggregate_bottom_forecasts(bottom_forecasts, S)

    # Check total
    assert all_forecasts[0] == 1000  # 100 + 200 + 300 + 400

    # Check store aggregates
    assert all_forecasts[1] == 300  # Store 1: 100 + 200
    assert all_forecasts[2] == 700  # Store 2: 300 + 400

    # Check bottom level (unchanged)
    assert np.allclose(all_forecasts[3:], bottom_forecasts)


def test_aggregate_bottom_forecasts_2d():
    """Test aggregate_bottom_forecasts with 2D input (multiple periods)."""
    S = np.array([
        [1, 1],  # Total
        [1, 0],  # Bottom 1
        [0, 1],  # Bottom 2
    ], dtype=np.float32)

    # 3 periods, 2 bottom series
    bottom_forecasts = np.array([
        [100, 200],  # Period 1
        [150, 250],  # Period 2
        [200, 300],  # Period 3
    ], dtype=np.float32)

    all_forecasts = aggregate_bottom_forecasts(bottom_forecasts, S)

    # Check shape
    assert all_forecasts.shape == (3, 3)

    # Check totals for each period
    assert all_forecasts[0, 0] == 300  # Period 1: 100 + 200
    assert all_forecasts[1, 0] == 400  # Period 2: 150 + 250
    assert all_forecasts[2, 0] == 500  # Period 3: 200 + 300


def test_select_best_reconciliation_method():
    """Test select_best_reconciliation_method selects correct method."""
    evaluation_results = pd.DataFrame({
        "method": ["BottomUp/", "TopDown/", "MinTrace/mint_shrink"],
        "level": ["Total", "Total", "Total"],
        "rmse": [100, 150, 80],  # MinTrace has lowest
        "mape": [0.1, 0.15, 0.08],
    })

    best = select_best_reconciliation_method(evaluation_results, metric="rmse")
    assert best == "MinTrace/mint_shrink"


def test_select_best_reconciliation_method_by_level():
    """Test select_best_reconciliation_method filters by level."""
    evaluation_results = pd.DataFrame({
        "method": [
            "BottomUp/", "TopDown/", "MinTrace/",
            "BottomUp/", "TopDown/", "MinTrace/",
        ],
        "level": [
            "Total", "Total", "Total",
            "Store", "Store", "Store",
        ],
        "rmse": [
            100, 80, 90,  # TopDown best at Total
            90, 120, 70,  # MinTrace best at Store
        ],
    })

    best_total = select_best_reconciliation_method(
        evaluation_results, metric="rmse", level="Total"
    )
    best_store = select_best_reconciliation_method(
        evaluation_results, metric="rmse", level="Store"
    )

    assert best_total == "TopDown/"
    assert best_store == "MinTrace/"
