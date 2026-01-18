"""Validation metrics and walk-forward cross-validation."""

import json
from datetime import timedelta
from pathlib import Path

import numpy as np
import polars as pl


def rmsle(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """
    Compute Root Mean Squared Logarithmic Error.

    This is the primary metric for the Kaggle Store Sales competition.
    Values are clipped to ensure log is valid.

    Parameters
    ----------
    y_true : np.ndarray
        Actual values
    y_pred : np.ndarray
        Predicted values

    Returns
    -------
    float
        RMSLE score (lower is better)
    """
    # Clip to avoid log(0) and negative values
    y_true = np.clip(y_true, 0, None)
    y_pred = np.clip(y_pred, 0, None)

    return np.sqrt(np.mean((np.log1p(y_pred) - np.log1p(y_true)) ** 2))


def rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """
    Compute Root Mean Squared Error.

    Parameters
    ----------
    y_true : np.ndarray
        Actual values
    y_pred : np.ndarray
        Predicted values

    Returns
    -------
    float
        RMSE score
    """
    return np.sqrt(np.mean((y_pred - y_true) ** 2))


def mae(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """
    Compute Mean Absolute Error.

    Parameters
    ----------
    y_true : np.ndarray
        Actual values
    y_pred : np.ndarray
        Predicted values

    Returns
    -------
    float
        MAE score
    """
    return np.mean(np.abs(y_pred - y_true))


def mape(y_true: np.ndarray, y_pred: np.ndarray, epsilon: float = 1.0) -> float:
    """
    Compute Mean Absolute Percentage Error.

    Parameters
    ----------
    y_true : np.ndarray
        Actual values
    y_pred : np.ndarray
        Predicted values
    epsilon : float
        Small value to avoid division by zero

    Returns
    -------
    float
        MAPE score
    """
    return np.mean(np.abs(y_pred - y_true) / (np.abs(y_true) + epsilon))


def compute_all_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    """
    Compute all evaluation metrics.

    Parameters
    ----------
    y_true : np.ndarray
        Actual values
    y_pred : np.ndarray
        Predicted values

    Returns
    -------
    dict
        Dictionary with all metric values
    """
    return {
        "rmsle": rmsle(y_true, y_pred),
        "rmse": rmse(y_true, y_pred),
        "mae": mae(y_true, y_pred),
        "mape": mape(y_true, y_pred),
        "n_samples": len(y_true),
    }


def walk_forward_split(
    df: pl.DataFrame,
    date_col: str = "date",
    train_days: int = 365,
    valid_days: int = 90,
    gap_days: int = 0,
    n_splits: int = 3,
    step_days: int = 30,
) -> list[tuple[pl.DataFrame, pl.DataFrame]]:
    """
    Generate walk-forward cross-validation splits.

    Parameters
    ----------
    df : pl.DataFrame
        Full dataset sorted by date
    date_col : str
        Date column name
    train_days : int
        Number of days in training set
    valid_days : int
        Number of days in validation set
    gap_days : int
        Gap between train and valid (to match forecast horizon)
    n_splits : int
        Number of CV splits
    step_days : int
        Step between splits

    Returns
    -------
    list[tuple[pl.DataFrame, pl.DataFrame]]
        List of (train_df, valid_df) tuples
    """
    min_date = df.select(pl.col(date_col).min()).item()
    max_date = df.select(pl.col(date_col).max()).item()

    splits = []

    # Start from end and work backwards
    for i in range(n_splits):
        # Calculate split boundaries (working backwards from max_date)
        # Use Python timedelta for date arithmetic with Python date objects
        offset = timedelta(days=i * step_days)

        valid_end = max_date - offset
        valid_start = valid_end - timedelta(days=valid_days)
        train_end = valid_start - timedelta(days=gap_days)
        train_start = train_end - timedelta(days=train_days)

        if train_start < min_date:
            print(f"Skipping split {i}: not enough training data")
            continue

        train_df = df.filter(
            (pl.col(date_col) >= train_start) & (pl.col(date_col) < train_end)
        )
        valid_df = df.filter(
            (pl.col(date_col) >= valid_start) & (pl.col(date_col) <= valid_end)
        )

        if train_df.height > 0 and valid_df.height > 0:
            splits.append((train_df, valid_df))
            print(
                f"Split {len(splits)}: train {train_start} to {train_end} "
                f"({train_df.height:,} rows), "
                f"valid {valid_start} to {valid_end} ({valid_df.height:,} rows)"
            )

    return splits


def evaluate_model_cv(
    model_fn,
    df: pl.DataFrame,
    target_col: str = "sales",
    n_splits: int = 3,
    **cv_kwargs,
) -> dict:
    """
    Evaluate model using walk-forward cross-validation.

    Parameters
    ----------
    model_fn : callable
        Function that takes (train_df, valid_df) and returns predictions array
    df : pl.DataFrame
        Full dataset
    target_col : str
        Target column name
    n_splits : int
        Number of CV splits
    **cv_kwargs
        Additional arguments for walk_forward_split

    Returns
    -------
    dict
        CV results with per-fold and aggregate metrics
    """
    splits = walk_forward_split(df, n_splits=n_splits, **cv_kwargs)

    fold_metrics = []
    all_y_true = []
    all_y_pred = []

    for i, (train_df, valid_df) in enumerate(splits):
        # Get predictions
        y_pred = model_fn(train_df, valid_df)
        y_true = valid_df.select(target_col).to_numpy().ravel()

        # Store for aggregate metrics
        all_y_true.extend(y_true)
        all_y_pred.extend(y_pred)

        # Compute fold metrics
        metrics = compute_all_metrics(y_true, y_pred)
        metrics["fold"] = i + 1
        fold_metrics.append(metrics)

        print(f"Fold {i + 1}: RMSLE = {metrics['rmsle']:.4f}, RMSE = {metrics['rmse']:.2f}")

    # Compute aggregate metrics
    aggregate = compute_all_metrics(np.array(all_y_true), np.array(all_y_pred))

    return {
        "fold_metrics": fold_metrics,
        "aggregate": aggregate,
        "mean_rmsle": np.mean([m["rmsle"] for m in fold_metrics]),
        "std_rmsle": np.std([m["rmsle"] for m in fold_metrics]),
        "n_splits": len(splits),
    }


def save_metrics(metrics: dict, output_path: Path) -> None:
    """
    Save metrics to JSON file.

    Parameters
    ----------
    metrics : dict
        Metrics dictionary
    output_path : Path
        Output file path
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Convert numpy types to Python types for JSON serialization
    def convert(obj):
        if isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        elif isinstance(obj, dict):
            return {k: convert(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [convert(v) for v in obj]
        return obj

    metrics = convert(metrics)

    with open(output_path, "w") as f:
        json.dump(metrics, f, indent=2)

    print(f"Saved metrics to {output_path}")


def load_metrics(path: Path) -> dict:
    """
    Load metrics from JSON file.

    Parameters
    ----------
    path : Path
        Path to metrics file

    Returns
    -------
    dict
        Loaded metrics
    """
    with open(path) as f:
        return json.load(f)
