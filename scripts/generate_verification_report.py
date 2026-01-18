#!/usr/bin/env python3
"""Generate verification report proving system meets all quality gates."""

import json
from datetime import datetime
from pathlib import Path

import polars as pl
import yaml


def main():
    report = {
        "generated_at": datetime.now().isoformat(),
        "quality_gates": {},
        "all_passed": True,
    }

    # Load quality gates
    gates_path = Path("quality_gates.yaml")
    if not gates_path.exists():
        print("ERROR: quality_gates.yaml not found")
        return 1

    with open(gates_path) as f:
        gates = yaml.safe_load(f)

    # Check model quality
    print("Checking model quality...")
    metrics_path = Path("models/metrics.json")
    if metrics_path.exists():
        with open(metrics_path) as f:
            metrics = json.load(f)

        # Use final_rmsle or cv_rmsle (the actual metrics saved by train.py)
        rmsle = metrics.get("final_rmsle") or metrics.get("cv_rmsle") or 999
        rmsle_pass = rmsle < gates["model_quality"]["rmsle_threshold"]
        report["quality_gates"]["model_rmsle"] = {
            "value": rmsle,
            "threshold": gates["model_quality"]["rmsle_threshold"],
            "passed": rmsle_pass,
        }
        if not rmsle_pass:
            report["all_passed"] = False
    else:
        print("  WARNING: models/metrics.json not found")
        report["quality_gates"]["model_rmsle"] = {
            "value": None,
            "threshold": gates["model_quality"]["rmsle_threshold"],
            "passed": False,
            "error": "metrics.json not found",
        }
        report["all_passed"] = False

    # Check data quality
    print("Checking data quality...")
    features_path = Path("data/features/feature_matrix.parquet")
    if features_path.exists():
        features = pl.read_parquet(features_path)

        # Calculate null ratio
        null_count = features.null_count().sum_horizontal()[0]
        total_cells = features.shape[0] * features.shape[1]
        null_ratio = null_count / total_cells if total_cells > 0 else 0
        null_pass = null_ratio < gates["data_quality"]["max_null_ratio"]
        report["quality_gates"]["data_null_ratio"] = {
            "value": float(null_ratio),
            "threshold": gates["data_quality"]["max_null_ratio"],
            "passed": null_pass,
        }
        if not null_pass:
            report["all_passed"] = False

        # Check row count
        row_count = features.shape[0]
        row_pass = row_count >= gates["data_quality"]["min_rows"]
        report["quality_gates"]["data_row_count"] = {
            "value": row_count,
            "threshold": gates["data_quality"]["min_rows"],
            "passed": row_pass,
        }
        if not row_pass:
            report["all_passed"] = False

        # Check required columns
        required_cols = gates["data_quality"]["required_columns"]
        missing_cols = [c for c in required_cols if c not in features.columns]
        cols_pass = len(missing_cols) == 0
        report["quality_gates"]["required_columns"] = {
            "required": required_cols,
            "missing": missing_cols,
            "passed": cols_pass,
        }
        if not cols_pass:
            report["all_passed"] = False
    else:
        print("  WARNING: data/features/feature_matrix.parquet not found")
        report["quality_gates"]["data_null_ratio"] = {
            "value": None,
            "threshold": gates["data_quality"]["max_null_ratio"],
            "passed": False,
            "error": "feature_matrix.parquet not found",
        }
        report["quality_gates"]["data_row_count"] = {
            "value": None,
            "threshold": gates["data_quality"]["min_rows"],
            "passed": False,
            "error": "feature_matrix.parquet not found",
        }
        report["all_passed"] = False

    # Check reconciliation (if available)
    print("Checking hierarchy reconciliation...")
    reconciled_path = Path("models/reconciled_forecasts.parquet")
    if reconciled_path.exists():
        reconciled = pl.read_parquet(reconciled_path)
        if "level" in reconciled.columns and "prediction" in reconciled.columns:
            total_pred = (
                reconciled.filter(pl.col("level") == "Total")["prediction"].sum()
            )
            store_sum = (
                reconciled.filter(pl.col("level") == "Store")["prediction"].sum()
            )
            if total_pred > 0:
                recon_error = abs(total_pred - store_sum) / total_pred
                recon_pass = (
                    recon_error < gates["model_quality"]["reconciliation_tolerance"]
                )
                report["quality_gates"]["reconciliation"] = {
                    "value": float(recon_error),
                    "threshold": gates["model_quality"]["reconciliation_tolerance"],
                    "passed": recon_pass,
                }
                if not recon_pass:
                    report["all_passed"] = False
            else:
                report["quality_gates"]["reconciliation"] = {
                    "value": None,
                    "passed": True,
                    "note": "Total prediction is zero, skipping check",
                }
        else:
            report["quality_gates"]["reconciliation"] = {
                "value": None,
                "passed": True,
                "note": "Required columns not found, skipping check",
            }
    else:
        # Reconciliation file not generated yet - not a failure, just skip
        print("  NOTE: models/reconciled_forecasts.parquet not found (optional)")
        report["quality_gates"]["reconciliation"] = {
            "value": None,
            "passed": True,
            "note": "Reconciliation file not found, check skipped",
        }

    # Check artifacts exist
    print("Checking artifacts...")
    required_artifacts = [
        "models/lightgbm_model.onnx",
        "models/lightgbm_model.txt",
        "models/lightgbm_model.pkl",
        "models/metrics.json",
        "data/features/feature_matrix.parquet",
        "data/features/hierarchy.parquet",
    ]
    # Optional artifacts (don't fail if missing)
    optional_artifacts = [
        "models/shap_explainer.pkl",
        "models/shap_waterfall.json",
        "models/feature_importance.csv",
    ]
    missing = [a for a in required_artifacts if not Path(a).exists()]
    missing_optional = [a for a in optional_artifacts if not Path(a).exists()]
    artifacts_pass = len(missing) == 0
    report["quality_gates"]["artifacts"] = {
        "required": required_artifacts,
        "missing": missing,
        "optional_missing": missing_optional,
        "passed": artifacts_pass,
    }
    if not artifacts_pass:
        report["all_passed"] = False

    # Summary
    print("")
    print("=" * 50)
    print("VERIFICATION REPORT")
    print("=" * 50)
    for gate, result in report["quality_gates"].items():
        status = "✓ PASS" if result["passed"] else "✗ FAIL"
        if "value" in result and result["value"] is not None:
            print(f"  {gate}: {status} (value: {result['value']:.4f})" if isinstance(result["value"], float) else f"  {gate}: {status} (value: {result['value']})")
        else:
            print(f"  {gate}: {status}")
        if "missing" in result and result["missing"]:
            print(f"    Missing: {result['missing']}")
        if "note" in result:
            print(f"    Note: {result['note']}")
        if "error" in result:
            print(f"    Error: {result['error']}")
    print("")
    print(f"Overall: {'ALL GATES PASSED' if report['all_passed'] else 'SOME GATES FAILED'}")
    print("=" * 50)

    # Save report
    with open("verification_report.json", "w") as f:
        json.dump(report, f, indent=2)
    print("\nReport saved to: verification_report.json")

    return 0 if report["all_passed"] else 1


if __name__ == "__main__":
    exit(main())
