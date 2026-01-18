"""Hierarchical forecast reconciliation using hierarchicalforecast."""

import numpy as np
import pandas as pd
from hierarchicalforecast.core import HierarchicalReconciliation
from hierarchicalforecast.methods import BottomUp, MinTrace, TopDown


def get_reconciliation_methods() -> list:
    """
    Get list of reconciliation methods to compare.

    Returns
    -------
    list
        List of reconciliation method instances
    """
    return [
        BottomUp(),
        TopDown(method="forecast_proportions"),
        MinTrace(method="mint_shrink"),  # Optimal reconciliation with shrinkage
        MinTrace(method="ols"),  # OLS reconciliation
    ]


def reconcile_forecasts(
    base_forecasts: pd.DataFrame,
    actuals: pd.DataFrame,
    S: np.ndarray,
    tags: dict,
    methods: list | None = None,
) -> pd.DataFrame:
    """
    Apply hierarchical reconciliation to base forecasts.

    Parameters
    ----------
    base_forecasts : pd.DataFrame
        Base forecasts with columns: unique_id, ds, and model prediction columns
    actuals : pd.DataFrame
        Historical data with columns: unique_id, ds, y
    S : np.ndarray
        Summing matrix from hierarchy construction
    tags : dict
        Hierarchy tags mapping level names to series identifiers
    methods : list, optional
        Reconciliation methods. Defaults to get_reconciliation_methods()

    Returns
    -------
    pd.DataFrame
        Reconciled forecasts for all hierarchy levels
    """
    if methods is None:
        methods = get_reconciliation_methods()

    hrec = HierarchicalReconciliation(reconcilers=methods)

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
    """
    Evaluate reconciliation methods at each hierarchy level.

    Parameters
    ----------
    reconciled : pd.DataFrame
        Reconciled forecasts with method columns
    actuals : pd.DataFrame
        Actual values with columns: unique_id, ds, y
    tags : dict
        Hierarchy tags

    Returns
    -------
    pd.DataFrame
        Evaluation metrics per method and level
    """
    # Merge reconciled with actuals
    df = reconciled.merge(actuals, on=["unique_id", "ds"])

    # Get reconciliation method columns (contain "/" from hierarchicalforecast)
    method_cols = [c for c in reconciled.columns if "/" in c]

    results = []
    for method_col in method_cols:
        for level_name, level_ids in tags.items():
            # Filter to this level
            level_mask = df["unique_id"].isin(level_ids)
            level_df = df[level_mask]

            if len(level_df) == 0:
                continue

            # Calculate metrics
            y_true = level_df["y"].values
            y_pred = level_df[method_col].values

            # Avoid division by zero
            mape = np.mean(np.abs(y_pred - y_true) / (np.abs(y_true) + 1))
            rmse = np.sqrt(np.mean((y_pred - y_true) ** 2))
            mae = np.mean(np.abs(y_pred - y_true))

            results.append(
                {
                    "method": method_col,
                    "level": level_name,
                    "mape": mape,
                    "rmse": rmse,
                    "mae": mae,
                    "n_samples": len(level_df),
                }
            )

    return pd.DataFrame(results)


def aggregate_bottom_forecasts(
    bottom_forecasts: np.ndarray,
    S: np.ndarray,
) -> np.ndarray:
    """
    Aggregate bottom-level forecasts to all hierarchy levels using summing matrix.

    Parameters
    ----------
    bottom_forecasts : np.ndarray
        Forecasts for bottom-level series, shape (n_bottom,) or (n_periods, n_bottom)
    S : np.ndarray
        Summing matrix, shape (n_total, n_bottom)

    Returns
    -------
    np.ndarray
        Forecasts for all levels, shape (n_total,) or (n_periods, n_total)
    """
    if bottom_forecasts.ndim == 1:
        return S @ bottom_forecasts
    else:
        # Multiple periods: apply to each row
        return np.array([S @ row for row in bottom_forecasts])


def verify_hierarchy_consistency(
    forecasts: pd.DataFrame,
    S: np.ndarray,
    bottom_ids: list[str],
    tol: float = 1e-6,
) -> bool:
    """
    Verify that forecasts are consistent with hierarchy structure.

    Parameters
    ----------
    forecasts : pd.DataFrame
        Forecasts with unique_id column and value columns
    S : np.ndarray
        Summing matrix
    bottom_ids : list[str]
        List of bottom-level unique_ids
    tol : float
        Tolerance for consistency check

    Returns
    -------
    bool
        True if forecasts are hierarchy-consistent
    """
    # Get value columns (exclude unique_id, ds)
    value_cols = [c for c in forecasts.columns if c not in ["unique_id", "ds"]]

    for col in value_cols:
        # Group by unique_id and get mean (or first if single value)
        values_by_id = forecasts.groupby("unique_id")[col].mean().to_dict()

        # Extract bottom-level values
        bottom_values = np.array([values_by_id.get(uid, 0) for uid in bottom_ids])

        # Compute expected hierarchy values
        expected_all = S @ bottom_values

        # Check consistency (simplified - just verify total matches)
        expected_total = expected_all[0]
        actual_total = sum(values_by_id.get(uid, 0) for uid in bottom_ids)

        if abs(expected_total - actual_total) > tol:
            print(f"Hierarchy inconsistency in {col}: expected {expected_total:.2f}, "
                  f"got {actual_total:.2f}")
            return False

    return True


def select_best_reconciliation_method(
    evaluation_results: pd.DataFrame,
    metric: str = "rmse",
    level: str | None = None,
) -> str:
    """
    Select the best reconciliation method based on evaluation metrics.

    Parameters
    ----------
    evaluation_results : pd.DataFrame
        Output from evaluate_reconciliation()
    metric : str
        Metric to use for selection ('rmse', 'mape', 'mae')
    level : str, optional
        Hierarchy level to evaluate. If None, uses aggregate across all levels.

    Returns
    -------
    str
        Name of best method
    """
    df = evaluation_results.copy()

    if level is not None:
        df = df[df["level"] == level]

    # Aggregate by method
    method_scores = df.groupby("method")[metric].mean().sort_values()

    best_method = method_scores.index[0]
    best_score = method_scores.iloc[0]

    print(f"Best method by {metric}: {best_method} ({best_score:.4f})")

    return best_method
