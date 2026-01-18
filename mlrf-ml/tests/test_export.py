"""Tests for ONNX export module."""

import tempfile
from pathlib import Path

import lightgbm as lgb
import numpy as np

from mlrf_ml.export import (
    benchmark_onnx_inference,
    export_lightgbm_to_onnx,
    get_onnx_model_info,
    validate_onnx_model,
)


def create_simple_lgb_model(n_features: int = 10) -> tuple[lgb.Booster, list[str]]:
    """Create a simple LightGBM model for testing."""
    np.random.seed(42)

    X = np.random.randn(1000, n_features).astype(np.float32)
    y = np.sum(X[:, :3], axis=1) + np.random.randn(1000) * 0.1

    feature_names = [f"feature_{i}" for i in range(n_features)]

    train_data = lgb.Dataset(X, label=y, feature_name=feature_names)

    params = {
        "objective": "regression",
        "metric": "rmse",
        "num_leaves": 15,
        "learning_rate": 0.1,
        "verbose": -1,
    }

    model = lgb.train(params, train_data, num_boost_round=10)

    return model, feature_names


def test_export_lightgbm_to_onnx():
    """Test export_lightgbm_to_onnx creates valid ONNX file."""
    model, feature_names = create_simple_lgb_model(n_features=5)

    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "model.onnx"

        export_lightgbm_to_onnx(model, feature_names, output_path)

        # Check file was created
        assert output_path.exists()
        assert output_path.stat().st_size > 0


def test_validate_onnx_model():
    """Test validate_onnx_model correctly validates exported model."""
    model, feature_names = create_simple_lgb_model(n_features=5)

    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "model.onnx"
        export_lightgbm_to_onnx(model, feature_names, output_path)

        # Generate sample input and expected output
        sample_input = np.random.randn(10, 5).astype(np.float32)
        expected_output = model.predict(sample_input)

        # Validate
        is_valid = validate_onnx_model(
            output_path, sample_input, expected_output, rtol=1e-3
        )

        assert is_valid


def test_get_onnx_model_info():
    """Test get_onnx_model_info returns correct information."""
    model, feature_names = create_simple_lgb_model(n_features=5)

    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "model.onnx"
        export_lightgbm_to_onnx(model, feature_names, output_path)

        info = get_onnx_model_info(output_path)

        # Check structure
        assert "opset_version" in info
        assert "inputs" in info
        assert "outputs" in info

        # Check input info
        assert len(info["inputs"]) > 0
        assert info["inputs"][0]["name"] == "input"


def test_benchmark_onnx_inference():
    """Test benchmark_onnx_inference returns timing statistics."""
    model, feature_names = create_simple_lgb_model(n_features=5)

    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "model.onnx"
        export_lightgbm_to_onnx(model, feature_names, output_path)

        sample_input = np.random.randn(1, 5).astype(np.float32)

        results = benchmark_onnx_inference(output_path, sample_input, n_iterations=100)

        # Check all expected keys
        assert "mean_ms" in results
        assert "median_ms" in results
        assert "p95_ms" in results
        assert "p99_ms" in results
        assert "n_iterations" in results

        # Check values are positive
        assert results["mean_ms"] > 0
        assert results["median_ms"] > 0

        # Check ordering (min <= median <= mean should generally hold for this)
        assert results["min_ms"] <= results["median_ms"]


def test_onnx_model_batch_inference():
    """Test ONNX model handles batch inference correctly."""
    model, feature_names = create_simple_lgb_model(n_features=5)

    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "model.onnx"
        export_lightgbm_to_onnx(model, feature_names, output_path)

        # Test various batch sizes
        for batch_size in [1, 10, 100]:
            sample_input = np.random.randn(batch_size, 5).astype(np.float32)
            expected_output = model.predict(sample_input)

            is_valid = validate_onnx_model(
                output_path, sample_input, expected_output, rtol=1e-3
            )
            assert is_valid, f"Validation failed for batch_size={batch_size}"
