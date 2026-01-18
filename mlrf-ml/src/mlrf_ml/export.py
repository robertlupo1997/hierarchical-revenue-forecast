"""Export models to ONNX format for Go inference."""

from pathlib import Path

import lightgbm as lgb
import numpy as np
import onnx
import onnxmltools
from skl2onnx.common.data_types import FloatTensorType


def export_lightgbm_to_onnx(
    model: lgb.Booster,
    feature_names: list[str],
    output_path: Path,
    target_opset: int = 15,
) -> None:
    """
    Export LightGBM model to ONNX format.

    Parameters
    ----------
    model : lgb.Booster
        Trained LightGBM model
    feature_names : list[str]
        List of feature names (determines input shape)
    output_path : Path
        Output path for ONNX model
    target_opset : int
        ONNX opset version
    """
    # Define input shape: batch_size x num_features
    num_features = len(feature_names)
    initial_types = [("input", FloatTensorType([None, num_features]))]

    # Convert to ONNX
    onnx_model = onnxmltools.convert_lightgbm(
        model,
        initial_types=initial_types,
        target_opset=target_opset,
    )

    # Save model
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    onnxmltools.utils.save_model(onnx_model, str(output_path))

    print(f"Exported ONNX model to {output_path}")
    print(f"  Input shape: (batch_size, {num_features})")
    print(f"  Opset version: {target_opset}")


def validate_onnx_model(
    onnx_path: Path,
    sample_input: np.ndarray,
    expected_output: np.ndarray,
    rtol: float = 1e-3,
    atol: float = 1e-5,
) -> bool:
    """
    Validate ONNX model produces same output as original.

    Parameters
    ----------
    onnx_path : Path
        Path to ONNX model
    sample_input : np.ndarray
        Sample input features, shape (n_samples, n_features)
    expected_output : np.ndarray
        Expected predictions from original model
    rtol : float
        Relative tolerance for comparison
    atol : float
        Absolute tolerance for comparison

    Returns
    -------
    bool
        True if ONNX output matches expected within tolerance
    """
    import onnxruntime as ort

    # Load ONNX model
    session = ort.InferenceSession(str(onnx_path))
    input_name = session.get_inputs()[0].name

    # Run inference
    onnx_output = session.run(None, {input_name: sample_input.astype(np.float32)})[0]

    # Compare outputs
    onnx_flat = onnx_output.flatten()
    expected_flat = expected_output.flatten()

    if len(onnx_flat) != len(expected_flat):
        print(f"Output shape mismatch: ONNX {onnx_flat.shape} vs expected {expected_flat.shape}")
        return False

    # Check if outputs match
    is_close = np.allclose(onnx_flat, expected_flat, rtol=rtol, atol=atol)

    if is_close:
        max_diff = np.max(np.abs(onnx_flat - expected_flat))
        rel_diff = np.max(np.abs(onnx_flat - expected_flat) / (np.abs(expected_flat) + 1e-8))
        print("ONNX validation passed!")
        print(f"  Max absolute diff: {max_diff:.6f}")
        print(f"  Max relative diff: {rel_diff * 100:.4f}%")
    else:
        max_diff = np.max(np.abs(onnx_flat - expected_flat))
        print("ONNX validation FAILED!")
        print(f"  Max absolute diff: {max_diff:.6f}")

    return is_close


def get_onnx_model_info(onnx_path: Path) -> dict:
    """
    Get information about an ONNX model.

    Parameters
    ----------
    onnx_path : Path
        Path to ONNX model

    Returns
    -------
    dict
        Model information including input/output shapes and opset version
    """
    model = onnx.load(str(onnx_path))

    info = {
        "opset_version": model.opset_import[0].version,
        "ir_version": model.ir_version,
        "inputs": [],
        "outputs": [],
    }

    for input_tensor in model.graph.input:
        shape = [dim.dim_value for dim in input_tensor.type.tensor_type.shape.dim]
        info["inputs"].append(
            {
                "name": input_tensor.name,
                "shape": shape,
            }
        )

    for output_tensor in model.graph.output:
        shape = [dim.dim_value for dim in output_tensor.type.tensor_type.shape.dim]
        info["outputs"].append(
            {
                "name": output_tensor.name,
                "shape": shape,
            }
        )

    return info


def benchmark_onnx_inference(
    onnx_path: Path,
    sample_input: np.ndarray,
    n_iterations: int = 1000,
) -> dict:
    """
    Benchmark ONNX inference latency.

    Parameters
    ----------
    onnx_path : Path
        Path to ONNX model
    sample_input : np.ndarray
        Sample input for benchmarking
    n_iterations : int
        Number of inference iterations

    Returns
    -------
    dict
        Benchmark results with mean, median, p95, p99 latencies
    """
    import time

    import onnxruntime as ort

    session = ort.InferenceSession(str(onnx_path))
    input_name = session.get_inputs()[0].name
    input_data = sample_input.astype(np.float32)

    # Warmup
    for _ in range(10):
        session.run(None, {input_name: input_data})

    # Benchmark
    latencies = []
    for _ in range(n_iterations):
        start = time.perf_counter()
        session.run(None, {input_name: input_data})
        latencies.append((time.perf_counter() - start) * 1000)  # Convert to ms

    latencies = np.array(latencies)

    results = {
        "mean_ms": float(np.mean(latencies)),
        "median_ms": float(np.median(latencies)),
        "p95_ms": float(np.percentile(latencies, 95)),
        "p99_ms": float(np.percentile(latencies, 99)),
        "min_ms": float(np.min(latencies)),
        "max_ms": float(np.max(latencies)),
        "n_iterations": n_iterations,
    }

    print(f"ONNX Inference Benchmark ({n_iterations} iterations):")
    print(f"  Mean: {results['mean_ms']:.3f} ms")
    print(f"  Median: {results['median_ms']:.3f} ms")
    print(f"  P95: {results['p95_ms']:.3f} ms")
    print(f"  P99: {results['p99_ms']:.3f} ms")

    return results
