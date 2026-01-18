"""Tests for SHAP explainability module."""

import numpy as np

from mlrf_ml.explainability import create_waterfall_data, get_feature_importance


class MockShapExplanation:
    """Mock SHAP explanation for testing."""

    def __init__(self, values: np.ndarray, base_values: np.ndarray):
        self.values = values
        self.base_values = base_values
        self.feature_names = [f"feature_{i}" for i in range(values.shape[1])]


def test_create_waterfall_data_basic():
    """Test create_waterfall_data creates correct structure."""
    shap_values = np.array([0.5, -0.3, 0.2, 0.1, -0.05])
    base_value = 100.0
    feature_names = ["feat_a", "feat_b", "feat_c", "feat_d", "feat_e"]
    feature_values = np.array([1.0, 2.0, 3.0, 4.0, 5.0])

    result = create_waterfall_data(
        shap_values, base_value, feature_names, feature_values, max_display=3
    )

    # Check structure
    assert "base_value" in result
    assert "features" in result
    assert "prediction" in result

    # Check base value
    assert result["base_value"] == base_value

    # Check prediction equals base + sum of SHAP values
    expected_pred = base_value + shap_values.sum()
    assert abs(result["prediction"] - expected_pred) < 1e-6


def test_create_waterfall_data_sorted_by_importance():
    """Test features are sorted by absolute SHAP value."""
    shap_values = np.array([0.1, -0.5, 0.3])  # Middle feature is most important
    base_value = 100.0
    feature_names = ["low", "high", "medium"]
    feature_values = np.array([1.0, 2.0, 3.0])

    result = create_waterfall_data(
        shap_values, base_value, feature_names, feature_values, max_display=3
    )

    # First feature should be "high" (largest absolute SHAP)
    assert result["features"][0]["name"] == "high"
    assert result["features"][0]["shap_value"] == -0.5


def test_create_waterfall_data_direction():
    """Test positive/negative direction is correctly assigned."""
    shap_values = np.array([0.5, -0.3])
    base_value = 100.0
    feature_names = ["positive_feat", "negative_feat"]

    result = create_waterfall_data(
        shap_values, base_value, feature_names, None, max_display=2
    )

    # Check directions
    positive_feat = next(f for f in result["features"] if f["name"] == "positive_feat")
    negative_feat = next(f for f in result["features"] if f["name"] == "negative_feat")

    assert positive_feat["direction"] == "positive"
    assert negative_feat["direction"] == "negative"


def test_create_waterfall_data_cumulative():
    """Test cumulative values are correctly computed."""
    shap_values = np.array([10.0, 20.0])
    base_value = 100.0
    feature_names = ["feat_a", "feat_b"]

    result = create_waterfall_data(
        shap_values, base_value, feature_names, None, max_display=2
    )

    # Sort features by SHAP value (descending by absolute)
    # feat_b (20) should be first, then feat_a (10)
    assert result["features"][0]["name"] == "feat_b"
    assert result["features"][0]["cumulative"] == 120.0  # 100 + 20

    assert result["features"][1]["name"] == "feat_a"
    assert result["features"][1]["cumulative"] == 130.0  # 100 + 20 + 10


def test_create_waterfall_data_other_grouping():
    """Test 'Other' grouping for remaining features."""
    # 5 features, but only display 2
    shap_values = np.array([0.5, 0.4, 0.3, 0.2, 0.1])
    base_value = 100.0
    feature_names = ["f1", "f2", "f3", "f4", "f5"]

    result = create_waterfall_data(
        shap_values, base_value, feature_names, None, max_display=2
    )

    # Should have 3 items: top 2 features + "Other"
    assert len(result["features"]) == 3

    # Last item should be "Other"
    other = result["features"][-1]
    assert "Other" in other["name"]
    assert other["shap_value"] == 0.3 + 0.2 + 0.1  # Sum of remaining


def test_get_feature_importance():
    """Test get_feature_importance returns sorted dataframe."""
    # Create mock SHAP values: 3 samples, 4 features
    values = np.array([
        [0.1, 0.5, 0.2, 0.3],
        [0.2, 0.4, 0.3, 0.1],
        [0.15, 0.45, 0.25, 0.2],
    ])
    base_values = np.array([100.0, 100.0, 100.0])

    mock_shap = MockShapExplanation(values, base_values)
    feature_names = ["feat_a", "feat_b", "feat_c", "feat_d"]

    importance_df = get_feature_importance(mock_shap, feature_names)

    # Check columns
    assert "feature" in importance_df.columns
    assert "importance" in importance_df.columns

    # Check sorted by importance (descending)
    importances = importance_df["importance"].values
    assert all(importances[i] >= importances[i + 1] for i in range(len(importances) - 1))

    # feat_b should be most important (highest mean absolute SHAP)
    assert importance_df.iloc[0]["feature"] == "feat_b"
