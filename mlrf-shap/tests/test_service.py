"""Tests for SHAP service."""

import numpy as np
import pytest
from unittest.mock import MagicMock, patch


class TestShapService:
    """Tests for ShapService class."""

    def test_feature_names_count(self):
        """Feature names should match expected model input."""
        from mlrf_shap.service import ShapService
        assert len(ShapService.FEATURE_NAMES) == 27

    def test_feature_names_content(self):
        """Feature names should include key features."""
        from mlrf_shap.service import ShapService
        names = ShapService.FEATURE_NAMES

        # Date features
        assert "year" in names
        assert "month" in names
        assert "dayofweek" in names

        # Lag features
        assert "sales_lag_1" in names
        assert "sales_lag_7" in names
        assert "sales_lag_90" in names

        # Rolling features
        assert "sales_rolling_mean_7" in names
        assert "sales_rolling_std_7" in names

        # External features
        assert "oil_price" in names
        assert "onpromotion" in names

        # Categorical
        assert "family_encoded" in names
        assert "type_encoded" in names

    @patch('mlrf_shap.service.lgb.Booster')
    @patch('mlrf_shap.service.shap.TreeExplainer')
    @patch('mlrf_shap.service.Path.exists', return_value=True)
    def test_explain_validates_feature_count(self, mock_exists, mock_explainer, mock_booster):
        """Explain should reject wrong feature count."""
        from mlrf_shap.service import ShapService

        service = ShapService("/fake/model.txt")

        # Wrong feature count should raise
        with pytest.raises(ValueError, match="Expected 27 features"):
            service.explain(
                store_nbr=1,
                family="GROCERY I",
                date="2017-08-01",
                features=[1.0] * 10  # Wrong count
            )

    @patch('mlrf_shap.service.lgb.Booster')
    @patch('mlrf_shap.service.shap.TreeExplainer')
    @patch('mlrf_shap.service.Path.exists', return_value=True)
    def test_explain_returns_waterfall_structure(self, mock_exists, mock_explainer_cls, mock_booster):
        """Explain should return proper waterfall structure."""
        from mlrf_shap.service import ShapService

        # Mock SHAP values
        mock_explainer = MagicMock()
        mock_explainer.shap_values.return_value = np.array([
            0.5, -0.3, 0.1, 0.0, 0.0, 0.0, 0.0,
            1.2, 0.0, 0.0, 0.0, 0.0,
            2.5, -1.0, 0.5, 0.3, 0.1,
            0.8, 0.4, 0.2, 0.1,
            -0.5, -0.3, -0.2, -0.1,
            0.3, 0.1
        ])
        mock_explainer.expected_value = 100.0
        mock_explainer_cls.return_value = mock_explainer

        service = ShapService("/fake/model.txt", max_display=5)

        result = service.explain(
            store_nbr=1,
            family="GROCERY I",
            date="2017-08-01",
            features=[1.0] * 27
        )

        assert "base_value" in result
        assert "features" in result
        assert "prediction" in result
        assert result["base_value"] == 100.0

        # Should have max_display features + potentially "Other"
        assert len(result["features"]) <= 6  # 5 + "Other"

        # Each feature should have required fields
        for feature in result["features"]:
            assert "name" in feature
            assert "value" in feature
            assert "shap_value" in feature
            assert "cumulative" in feature
            assert "direction" in feature
            assert feature["direction"] in ["positive", "negative"]

    @patch('mlrf_shap.service.lgb.Booster')
    @patch('mlrf_shap.service.shap.TreeExplainer')
    @patch('mlrf_shap.service.Path.exists', return_value=True)
    def test_health_returns_status(self, mock_exists, mock_explainer, mock_booster):
        """Health check should return service status."""
        from mlrf_shap.service import ShapService

        service = ShapService("/fake/model.txt")
        health = service.health()

        assert "healthy" in health
        assert "model_path" in health
        assert "requests_served" in health
        assert health["model_path"] == "/fake/model.txt"
        assert health["requests_served"] == 0

    @patch('mlrf_shap.service.lgb.Booster')
    @patch('mlrf_shap.service.shap.TreeExplainer')
    @patch('mlrf_shap.service.Path.exists', return_value=True)
    def test_requests_served_increments(self, mock_exists, mock_explainer_cls, mock_booster):
        """Request counter should increment on each explain call."""
        from mlrf_shap.service import ShapService

        mock_explainer = MagicMock()
        mock_explainer.shap_values.return_value = np.zeros(27)
        mock_explainer.expected_value = 100.0
        mock_explainer_cls.return_value = mock_explainer

        service = ShapService("/fake/model.txt")

        assert service.health()["requests_served"] == 0

        service.explain(1, "GROCERY I", "2017-08-01", [0.0] * 27)
        assert service.health()["requests_served"] == 1

        service.explain(1, "GROCERY I", "2017-08-01", [0.0] * 27)
        assert service.health()["requests_served"] == 2

    def test_model_not_found_raises(self):
        """Should raise FileNotFoundError for missing model."""
        from mlrf_shap.service import ShapService

        with pytest.raises(FileNotFoundError, match="Model file not found"):
            ShapService("/nonexistent/path/model.txt")


class TestWaterfallSorting:
    """Tests for SHAP waterfall feature sorting."""

    @patch('mlrf_shap.service.lgb.Booster')
    @patch('mlrf_shap.service.shap.TreeExplainer')
    @patch('mlrf_shap.service.Path.exists', return_value=True)
    def test_features_sorted_by_abs_shap(self, mock_exists, mock_explainer_cls, mock_booster):
        """Features should be sorted by absolute SHAP value."""
        from mlrf_shap.service import ShapService

        # Create SHAP values with known ordering
        shap_values = np.zeros(27)
        shap_values[0] = 0.1   # year - small
        shap_values[12] = 5.0  # sales_lag_1 - largest
        shap_values[7] = -3.0  # oil_price - second largest (abs)

        mock_explainer = MagicMock()
        mock_explainer.shap_values.return_value = shap_values
        mock_explainer.expected_value = 100.0
        mock_explainer_cls.return_value = mock_explainer

        service = ShapService("/fake/model.txt", max_display=3)
        result = service.explain(1, "GROCERY I", "2017-08-01", [0.0] * 27)

        # First feature should be sales_lag_1 (largest abs SHAP)
        assert result["features"][0]["name"] == "sales_lag_1"
        assert result["features"][0]["shap_value"] == 5.0

        # Second should be oil_price (second largest abs)
        assert result["features"][1]["name"] == "oil_price"
        assert result["features"][1]["shap_value"] == -3.0

    @patch('mlrf_shap.service.lgb.Booster')
    @patch('mlrf_shap.service.shap.TreeExplainer')
    @patch('mlrf_shap.service.Path.exists', return_value=True)
    def test_cumulative_calculation(self, mock_exists, mock_explainer_cls, mock_booster):
        """Cumulative values should track running sum."""
        from mlrf_shap.service import ShapService

        shap_values = np.zeros(27)
        shap_values[0] = 10.0
        shap_values[1] = -5.0
        shap_values[2] = 3.0

        mock_explainer = MagicMock()
        mock_explainer.shap_values.return_value = shap_values
        mock_explainer.expected_value = 100.0
        mock_explainer_cls.return_value = mock_explainer

        service = ShapService("/fake/model.txt", max_display=3)
        result = service.explain(1, "GROCERY I", "2017-08-01", [0.0] * 27)

        # Verify cumulative progression
        base = 100.0
        running = base
        for feat in result["features"]:
            if "Other" not in feat["name"]:
                running += feat["shap_value"]
                assert abs(feat["cumulative"] - running) < 0.01
