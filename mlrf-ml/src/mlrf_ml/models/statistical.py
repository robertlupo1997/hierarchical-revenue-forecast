"""Statistical forecasting with statsforecast."""

import pandas as pd
from statsforecast import StatsForecast
from statsforecast.models import AutoARIMA, AutoETS, SeasonalNaive


def create_statsforecast_models(season_length: int = 7) -> list:
    """
    Create ensemble of statistical models.

    Parameters
    ----------
    season_length : int
        Primary seasonal period (7 for daily data with weekly seasonality)

    Returns
    -------
    list
        List of statsforecast model instances
    """
    return [
        AutoARIMA(season_length=season_length),
        AutoETS(season_length=season_length),
        SeasonalNaive(season_length=season_length),  # Baseline
    ]


def train_statistical_forecasts(
    df: pd.DataFrame,
    horizon: int = 90,
    freq: str = "D",
    level: list[int] | None = None,
) -> pd.DataFrame:
    """
    Train statistical models on all series and generate forecasts.

    Parameters
    ----------
    df : pd.DataFrame
        Input data with columns: unique_id, ds (date), y (target)
    horizon : int
        Forecast horizon in periods
    freq : str
        Time series frequency ('D' for daily)
    level : list[int], optional
        Prediction interval levels. Defaults to [80, 95]

    Returns
    -------
    pd.DataFrame
        Forecasts with columns for each model and prediction intervals
    """
    if level is None:
        level = [80, 95]

    sf = StatsForecast(
        models=create_statsforecast_models(),
        freq=freq,
        n_jobs=-1,  # Use all cores
    )

    # Generate forecasts with prediction intervals
    forecasts = sf.forecast(
        df=df,
        h=horizon,
        level=level,
    )

    return forecasts


def cross_validate_statistical(
    df: pd.DataFrame,
    horizon: int = 90,
    n_windows: int = 3,
    step_size: int = 30,
    freq: str = "D",
) -> pd.DataFrame:
    """
    Walk-forward cross-validation for statistical models.

    Parameters
    ----------
    df : pd.DataFrame
        Input data with columns: unique_id, ds (date), y (target)
    horizon : int
        Forecast horizon in periods
    n_windows : int
        Number of cross-validation windows
    step_size : int
        Step size between windows in periods
    freq : str
        Time series frequency

    Returns
    -------
    pd.DataFrame
        Cross-validation results with forecasts and actuals
    """
    sf = StatsForecast(
        models=create_statsforecast_models(),
        freq=freq,
        n_jobs=-1,
    )

    cv_results = sf.cross_validation(
        df=df,
        h=horizon,
        n_windows=n_windows,
        step_size=step_size,
    )

    return cv_results


def prepare_statsforecast_data(
    df: pd.DataFrame,
    unique_id_col: str = "unique_id",
    date_col: str = "date",
    target_col: str = "sales",
) -> pd.DataFrame:
    """
    Prepare data for statsforecast format.

    Parameters
    ----------
    df : pd.DataFrame
        Input data with date and target columns
    unique_id_col : str
        Column name for series identifier
    date_col : str
        Column name for date
    target_col : str
        Column name for target variable

    Returns
    -------
    pd.DataFrame
        Data formatted for statsforecast (unique_id, ds, y)
    """
    return df[[unique_id_col, date_col, target_col]].rename(
        columns={unique_id_col: "unique_id", date_col: "ds", target_col: "y"}
    )
