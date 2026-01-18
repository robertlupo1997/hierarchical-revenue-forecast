"""LightGBM model for tabular time series forecasting."""

import pickle
from pathlib import Path

import lightgbm as lgb
import numpy as np
import polars as pl

# Features to use (must match feature engineering in mlrf-data)
FEATURE_COLS = [
    # Date features
    "year",
    "month",
    "day",
    "dayofweek",
    "dayofyear",
    "is_mid_month",
    "is_leap_year",
    # External features
    "oil_price",
    "is_holiday",
    "onpromotion",
    "promo_rolling_7",
    # Store metadata (encoded as numeric)
    "cluster",
    # Lag features
    "sales_lag_1",
    "sales_lag_7",
    "sales_lag_14",
    "sales_lag_28",
    "sales_lag_90",
    # Rolling features
    "sales_rolling_mean_7",
    "sales_rolling_mean_14",
    "sales_rolling_mean_28",
    "sales_rolling_mean_90",
    "sales_rolling_std_7",
    "sales_rolling_std_14",
    "sales_rolling_std_28",
    "sales_rolling_std_90",
]

# Categorical columns for LightGBM
CATEGORICAL_COLS = ["family", "type"]


def get_lgb_params() -> dict:
    """
    Get LightGBM hyperparameters optimized for time series.

    Returns
    -------
    dict
        LightGBM training parameters
    """
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


def prepare_features(
    df: pl.DataFrame,
    feature_cols: list[str] | None = None,
    categorical_cols: list[str] | None = None,
) -> tuple:
    """
    Prepare features for LightGBM training.

    Parameters
    ----------
    df : pl.DataFrame
        Input data with feature columns
    feature_cols : list[str], optional
        List of feature column names. Defaults to FEATURE_COLS
    categorical_cols : list[str], optional
        List of categorical column names. Defaults to CATEGORICAL_COLS

    Returns
    -------
    tuple
        (X DataFrame, available_features list, categorical_features list)
    """
    if feature_cols is None:
        feature_cols = FEATURE_COLS
    if categorical_cols is None:
        categorical_cols = CATEGORICAL_COLS

    # Get available features (some may not exist in data)
    available_features = [col for col in feature_cols if col in df.columns]
    available_categoricals = [col for col in categorical_cols if col in df.columns]

    # Convert to pandas for LightGBM
    X = df.select(available_features + available_categoricals).to_pandas()

    # Convert categoricals to category dtype
    for col in available_categoricals:
        X[col] = X[col].astype("category")

    return X, available_features + available_categoricals, available_categoricals


def train_lightgbm(
    train_df: pl.DataFrame,
    valid_df: pl.DataFrame,
    target_col: str = "sales",
    feature_cols: list[str] | None = None,
    categorical_cols: list[str] | None = None,
    num_boost_round: int = 1000,
    early_stopping_rounds: int = 50,
) -> tuple[lgb.Booster, list[str]]:
    """
    Train LightGBM model for time series forecasting.

    Parameters
    ----------
    train_df : pl.DataFrame
        Training data with features and target
    valid_df : pl.DataFrame
        Validation data for early stopping
    target_col : str
        Name of target column
    feature_cols : list[str], optional
        Feature columns to use. Defaults to FEATURE_COLS
    categorical_cols : list[str], optional
        Categorical columns. Defaults to CATEGORICAL_COLS
    num_boost_round : int
        Maximum number of boosting rounds
    early_stopping_rounds : int
        Early stopping patience

    Returns
    -------
    tuple
        (trained LightGBM Booster, list of feature names used)
    """
    # Prepare features
    X_train, feature_names, cat_features = prepare_features(
        train_df, feature_cols, categorical_cols
    )
    y_train = train_df.select(target_col).to_pandas().values.ravel()

    X_valid, _, _ = prepare_features(valid_df, feature_cols, categorical_cols)
    y_valid = valid_df.select(target_col).to_pandas().values.ravel()

    # Create LightGBM datasets
    train_data = lgb.Dataset(
        X_train,
        label=y_train,
        categorical_feature=cat_features if cat_features else "auto",
        feature_name=feature_names,
    )
    valid_data = lgb.Dataset(
        X_valid,
        label=y_valid,
        reference=train_data,
        categorical_feature=cat_features if cat_features else "auto",
        feature_name=feature_names,
    )

    # Train model
    model = lgb.train(
        get_lgb_params(),
        train_data,
        num_boost_round=num_boost_round,
        valid_sets=[train_data, valid_data],
        valid_names=["train", "valid"],
        callbacks=[
            lgb.early_stopping(stopping_rounds=early_stopping_rounds),
            lgb.log_evaluation(period=100),
        ],
    )

    return model, feature_names


def predict_lightgbm(
    model: lgb.Booster,
    df: pl.DataFrame,
    feature_cols: list[str] | None = None,
    categorical_cols: list[str] | None = None,
) -> np.ndarray:
    """
    Generate predictions with trained LightGBM model.

    Parameters
    ----------
    model : lgb.Booster
        Trained LightGBM model
    df : pl.DataFrame
        Data to predict on
    feature_cols : list[str], optional
        Feature columns. Defaults to FEATURE_COLS
    categorical_cols : list[str], optional
        Categorical columns. Defaults to CATEGORICAL_COLS

    Returns
    -------
    np.ndarray
        Predictions array
    """
    X, _, _ = prepare_features(df, feature_cols, categorical_cols)
    return model.predict(X)


def save_lightgbm_model(model: lgb.Booster, path: Path) -> None:
    """
    Save LightGBM model to pickle file.

    Parameters
    ----------
    model : lgb.Booster
        Trained model
    path : Path
        Output path
    """
    with open(path, "wb") as f:
        pickle.dump(model, f)
    print(f"Saved LightGBM model to {path}")


def load_lightgbm_model(path: Path) -> lgb.Booster:
    """
    Load LightGBM model from pickle file.

    Parameters
    ----------
    path : Path
        Model file path

    Returns
    -------
    lgb.Booster
        Loaded model
    """
    with open(path, "rb") as f:
        return pickle.load(f)


def create_train_valid_split(
    df: pl.DataFrame,
    date_col: str = "date",
    valid_days: int = 90,
) -> tuple[pl.DataFrame, pl.DataFrame]:
    """
    Create time-based train/validation split.

    Parameters
    ----------
    df : pl.DataFrame
        Full dataset
    date_col : str
        Date column name
    valid_days : int
        Number of days to use for validation (from end)

    Returns
    -------
    tuple
        (train_df, valid_df)
    """
    max_date = df.select(pl.col(date_col).max()).item()
    split_date = max_date - pl.duration(days=valid_days)

    train_df = df.filter(pl.col(date_col) < split_date)
    valid_df = df.filter(pl.col(date_col) >= split_date)

    print(f"Train: {train_df.height:,} rows, Valid: {valid_df.height:,} rows")
    print(f"Split date: {split_date}")

    return train_df, valid_df
