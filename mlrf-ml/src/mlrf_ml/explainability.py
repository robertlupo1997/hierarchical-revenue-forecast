"""SHAP-based model explainability for LightGBM."""

import json
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
import shap


def create_tree_explainer(model: lgb.Booster) -> shap.TreeExplainer:
    """
    Create SHAP TreeExplainer for LightGBM model.

    Uses tree_path_dependent feature perturbation which doesn't require
    background data and is faster than interventional.

    Parameters
    ----------
    model : lgb.Booster
        Trained LightGBM model

    Returns
    -------
    shap.TreeExplainer
        SHAP explainer instance
    """
    return shap.TreeExplainer(
        model,
        feature_perturbation="tree_path_dependent",
    )


def compute_shap_values(
    explainer: shap.TreeExplainer,
    X: pd.DataFrame,
) -> shap.Explanation:
    """
    Compute SHAP values for given features.

    Parameters
    ----------
    explainer : shap.TreeExplainer
        SHAP explainer
    X : pd.DataFrame
        Features to explain

    Returns
    -------
    shap.Explanation
        SHAP explanation object with values, base_values, and data
    """
    return explainer(X)


def get_feature_importance(
    shap_values: shap.Explanation,
    feature_names: list[str] | None = None,
) -> pd.DataFrame:
    """
    Get global feature importance from SHAP values.

    Parameters
    ----------
    shap_values : shap.Explanation
        SHAP explanation object
    feature_names : list[str], optional
        Feature names. Uses shap_values.feature_names if available

    Returns
    -------
    pd.DataFrame
        Feature importance sorted by absolute SHAP value
    """
    if feature_names is None:
        feature_names = list(shap_values.feature_names)

    importance = np.abs(shap_values.values).mean(axis=0)

    return pd.DataFrame(
        {
            "feature": feature_names,
            "importance": importance,
        }
    ).sort_values("importance", ascending=False)


def create_waterfall_data(
    shap_values: np.ndarray,
    base_value: float,
    feature_names: list[str],
    feature_values: np.ndarray | None = None,
    max_display: int = 10,
) -> dict:
    """
    Create data structure for React waterfall chart.

    Parameters
    ----------
    shap_values : np.ndarray
        SHAP values for a single prediction
    base_value : float
        Base/expected value
    feature_names : list[str]
        Feature names
    feature_values : np.ndarray, optional
        Actual feature values
    max_display : int
        Maximum features to display (rest grouped as "Other")

    Returns
    -------
    dict
        Waterfall chart data with base_value, features, and prediction
    """
    # Sort by absolute SHAP value (descending)
    sorted_indices = np.argsort(-np.abs(shap_values))[:max_display]

    features = []
    cumulative = base_value

    for idx in sorted_indices:
        shap_val = float(shap_values[idx])
        cumulative += shap_val

        feature_val = None
        if feature_values is not None:
            feature_val = float(feature_values[idx])

        features.append(
            {
                "name": feature_names[idx],
                "value": feature_val,
                "shap_value": shap_val,
                "cumulative": float(cumulative),
                "direction": "positive" if shap_val > 0 else "negative",
            }
        )

    # Add "Other" for remaining features
    remaining_indices = np.setdiff1d(np.arange(len(shap_values)), sorted_indices)
    if len(remaining_indices) > 0:
        other_shap = float(shap_values[remaining_indices].sum())
        if abs(other_shap) > 0.01:  # Only include if significant
            cumulative += other_shap
            features.append(
                {
                    "name": f"Other ({len(remaining_indices)} features)",
                    "value": None,
                    "shap_value": other_shap,
                    "cumulative": float(cumulative),
                    "direction": "positive" if other_shap > 0 else "negative",
                }
            )

    return {
        "base_value": float(base_value),
        "features": features,
        "prediction": float(cumulative),
    }


def export_shap_for_api(
    shap_values: shap.Explanation,
    feature_names: list[str],
    output_path: Path,
    sample_indices: list[int] | None = None,
    max_samples: int = 100,
) -> None:
    """
    Export SHAP values to JSON for Go API consumption.

    Parameters
    ----------
    shap_values : shap.Explanation
        SHAP explanation object
    feature_names : list[str]
        Feature names
    output_path : Path
        Output JSON file path
    sample_indices : list[int], optional
        Specific sample indices to export
    max_samples : int
        Maximum samples to export if sample_indices not specified
    """
    if sample_indices is None:
        sample_indices = list(range(min(max_samples, len(shap_values))))

    export_data = {
        "base_value": float(shap_values.base_values[0]),
        "feature_names": feature_names,
        "samples": [],
    }

    for idx in sample_indices:
        # Get SHAP values for this sample
        sv = shap_values.values[idx]
        bv = float(shap_values.base_values[idx])

        # Get feature values if available
        fv = None
        if hasattr(shap_values, "data") and shap_values.data is not None:
            fv = shap_values.data[idx].tolist()

        sample = {
            "index": idx,
            "prediction": bv + float(sv.sum()),
            "shap_values": sv.tolist(),
            "feature_values": fv,
        }
        export_data["samples"].append(sample)

    with open(output_path, "w") as f:
        json.dump(export_data, f, indent=2)

    print(f"Exported SHAP data for {len(sample_indices)} samples to {output_path}")


def export_waterfall_data(
    shap_values: shap.Explanation,
    feature_names: list[str],
    output_path: Path,
    store_family_pairs: list[tuple[int, str]] | None = None,
    df_metadata: pd.DataFrame | None = None,
    max_display: int = 10,
) -> None:
    """
    Export pre-computed waterfall data for specific store-family combinations.

    Parameters
    ----------
    shap_values : shap.Explanation
        SHAP explanation object
    feature_names : list[str]
        Feature names
    output_path : Path
        Output JSON file path
    store_family_pairs : list[tuple[int, str]], optional
        List of (store_nbr, family) pairs to export
    df_metadata : pd.DataFrame, optional
        DataFrame with store_nbr and family columns to map indices
    max_display : int
        Max features per waterfall
    """
    waterfall_data = {}

    if store_family_pairs is None:
        # Export first 100 samples with index as key
        for idx in range(min(100, len(shap_values))):
            key = str(idx)
            waterfall_data[key] = create_waterfall_data(
                shap_values.values[idx],
                float(shap_values.base_values[idx]),
                feature_names,
                shap_values.data[idx] if hasattr(shap_values, "data") else None,
                max_display,
            )
    else:
        # Export for specific store-family pairs
        for store_nbr, family in store_family_pairs:
            if df_metadata is not None:
                # Find matching row
                mask = (df_metadata["store_nbr"] == store_nbr) & (df_metadata["family"] == family)
                matching_indices = df_metadata.index[mask].tolist()
                if matching_indices:
                    idx = matching_indices[0]
                    key = f"{store_nbr}_{family}"
                    waterfall_data[key] = create_waterfall_data(
                        shap_values.values[idx],
                        float(shap_values.base_values[idx]),
                        feature_names,
                        shap_values.data[idx] if hasattr(shap_values, "data") else None,
                        max_display,
                    )

    with open(output_path, "w") as f:
        json.dump(waterfall_data, f, indent=2)

    print(f"Exported waterfall data for {len(waterfall_data)} combinations to {output_path}")


def save_shap_values(shap_values: shap.Explanation, output_path: Path) -> None:
    """
    Save SHAP values to numpy file.

    Parameters
    ----------
    shap_values : shap.Explanation
        SHAP explanation object
    output_path : Path
        Output .npy file path
    """
    np.save(output_path, shap_values.values)
    print(f"Saved SHAP values to {output_path}")


def load_shap_values(path: Path) -> np.ndarray:
    """
    Load SHAP values from numpy file.

    Parameters
    ----------
    path : Path
        Path to .npy file

    Returns
    -------
    np.ndarray
        SHAP values array
    """
    return np.load(path)
