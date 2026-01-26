"""HTTP SHAP explanation service implementation."""

import logging
from pathlib import Path
from threading import Lock
from typing import Optional

import lightgbm as lgb
import numpy as np
import shap

logger = logging.getLogger(__name__)


class ShapService:
    """Service for computing SHAP explanations."""

    # Feature names matching the 27-feature model input
    FEATURE_NAMES = [
        "year", "month", "day", "dayofweek", "dayofyear",
        "is_mid_month", "is_leap_year", "oil_price", "is_holiday",
        "onpromotion", "promo_rolling_7", "cluster",
        "sales_lag_1", "sales_lag_7", "sales_lag_14", "sales_lag_28", "sales_lag_90",
        "sales_rolling_mean_7", "sales_rolling_mean_14", "sales_rolling_mean_28", "sales_rolling_mean_90",
        "sales_rolling_std_7", "sales_rolling_std_14", "sales_rolling_std_28", "sales_rolling_std_90",
        "family_encoded", "type_encoded",
    ]

    def __init__(self, model_path: str, max_display: int = 10):
        """
        Initialize SHAP service with LightGBM model.

        Parameters
        ----------
        model_path : str
            Path to LightGBM model file (text format, not ONNX)
        max_display : int
            Maximum features to show in waterfall (rest grouped as "Other")
        """
        self.model_path = model_path
        self.max_display = max_display
        self.model: Optional[lgb.Booster] = None
        self.explainer: Optional[shap.TreeExplainer] = None
        self.requests_served = 0
        self._lock = Lock()

        self._load_model()

    def _load_model(self) -> None:
        """Load LightGBM model and create SHAP explainer."""
        logger.info(f"Loading model from {self.model_path}")

        if not Path(self.model_path).exists():
            raise FileNotFoundError(f"Model file not found: {self.model_path}")

        self.model = lgb.Booster(model_file=self.model_path)

        # Use tree_path_dependent for fast computation without background data
        self.explainer = shap.TreeExplainer(
            self.model,
            feature_perturbation="tree_path_dependent",
        )

        logger.info("Model and SHAP explainer loaded successfully")

    def explain(
        self,
        store_nbr: int,
        family: str,
        date: str,
        features: list[float],
    ) -> dict:
        """
        Compute SHAP values for a prediction.

        This computes REAL SHAP values on-demand using the TreeExplainer.
        No mocks, no pre-computed fallbacks.

        Parameters
        ----------
        store_nbr : int
            Store number
        family : str
            Product family
        date : str
            Date string
        features : list[float]
            27 features matching model input

        Returns
        -------
        dict
            Waterfall data with base_value, features, prediction
        """
        with self._lock:
            self.requests_served += 1

        # Validate feature count
        if len(features) != 27:
            raise ValueError(f"Expected 27 features, got {len(features)}")

        # Convert to numpy array
        features_arr = np.array(features, dtype=np.float64).reshape(1, -1)

        # Compute SHAP values
        shap_values = self.explainer.shap_values(features_arr)[0]
        base_value = float(self.explainer.expected_value)

        # Sort features by absolute SHAP value (descending)
        sorted_indices = np.argsort(-np.abs(shap_values))

        # Take top N features for display
        top_indices = sorted_indices[:self.max_display]
        remaining_indices = sorted_indices[self.max_display:]

        cumulative = base_value
        waterfall_features = []

        for idx in top_indices:
            sv = float(shap_values[idx])
            cumulative += sv

            waterfall_features.append({
                "name": self.FEATURE_NAMES[idx],
                "value": float(features[idx]),
                "shap_value": sv,
                "cumulative": cumulative,
                "direction": "positive" if sv > 0 else "negative",
            })

        # Add "Other" for remaining features if significant
        if len(remaining_indices) > 0:
            other_shap = float(shap_values[remaining_indices].sum())
            if abs(other_shap) > 0.01:
                cumulative += other_shap
                waterfall_features.append({
                    "name": f"Other ({len(remaining_indices)} features)",
                    "value": 0.0,
                    "shap_value": other_shap,
                    "cumulative": cumulative,
                    "direction": "positive" if other_shap > 0 else "negative",
                })

        logger.debug(
            f"Computed SHAP for store={store_nbr}, "
            f"family={family}, prediction={cumulative:.2f}"
        )

        return {
            "base_value": base_value,
            "features": waterfall_features,
            "prediction": cumulative,
        }

    def health(self) -> dict:
        """Check service health."""
        return {
            "healthy": self.model is not None and self.explainer is not None,
            "model_path": self.model_path,
            "requests_served": self.requests_served,
        }
