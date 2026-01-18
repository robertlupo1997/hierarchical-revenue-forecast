"""Training orchestration - ties all ML components together.

This module provides the main training pipeline that:
1. Loads preprocessed data or runs preprocessing
2. Builds feature matrix
3. Builds hierarchy specification
4. Trains LightGBM model with walk-forward validation
5. Computes SHAP values for explainability
6. Exports model to ONNX format
7. Validates and saves all artifacts
"""

import argparse
import logging
import pickle
from pathlib import Path

import numpy as np
import polars as pl

from mlrf_ml.explainability import (
    compute_shap_values,
    create_tree_explainer,
    export_waterfall_data,
    get_feature_importance,
)
from mlrf_ml.export import export_lightgbm_to_onnx, validate_onnx_model
from mlrf_ml.models.lightgbm_model import (
    CATEGORICAL_COLS,
    FEATURE_COLS,
    create_train_valid_split,
    predict_lightgbm,
    prepare_features,
    save_lightgbm_model,
    train_lightgbm,
)
from mlrf_ml.validation import (
    compute_all_metrics,
    evaluate_model_cv,
    save_metrics,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def load_feature_matrix(features_dir: Path) -> pl.DataFrame:
    """
    Load feature matrix from disk.

    Parameters
    ----------
    features_dir : Path
        Directory containing feature_matrix.parquet

    Returns
    -------
    pl.DataFrame
        Feature matrix
    """
    input_path = features_dir / "feature_matrix.parquet"
    if not input_path.exists():
        raise FileNotFoundError(
            f"Feature matrix not found at {input_path}. "
            "Run 'python -m mlrf_data.features' first."
        )
    logger.info(f"Loading feature matrix from {input_path}...")
    df = pl.read_parquet(input_path)
    logger.info(f"  Loaded {df.height:,} rows, {df.width} columns")
    return df


def lightgbm_cv_model_fn(train_df: pl.DataFrame, valid_df: pl.DataFrame) -> np.ndarray:
    """
    Model function for cross-validation.

    Parameters
    ----------
    train_df : pl.DataFrame
        Training data
    valid_df : pl.DataFrame
        Validation data

    Returns
    -------
    np.ndarray
        Predictions on validation set
    """
    model, _ = train_lightgbm(train_df, valid_df)
    return predict_lightgbm(model, valid_df)


def train_pipeline(
    features_dir: Path = Path("data/features"),
    models_dir: Path = Path("models"),
    horizons: list[int] | None = None,
    rmsle_threshold: float = 0.5,
    n_cv_splits: int = 3,
    skip_statistical: bool = True,
    skip_shap: bool = False,
) -> dict:
    """
    Run full training pipeline.

    Steps:
    1. Load feature matrix
    2. Build hierarchy specification
    3. Train LightGBM model with walk-forward validation
    4. Compute SHAP values (optional)
    5. Export to ONNX
    6. Validate outputs

    Parameters
    ----------
    features_dir : Path
        Directory containing feature_matrix.parquet
    models_dir : Path
        Directory to save model artifacts
    horizons : list[int], optional
        Forecast horizons to evaluate. Defaults to [15, 30, 60, 90]
    rmsle_threshold : float
        RMSLE threshold for quality gate (warning if exceeded)
    n_cv_splits : int
        Number of cross-validation splits
    skip_statistical : bool
        Skip statistical model training (faster, useful for testing)
    skip_shap : bool
        Skip SHAP computation (faster, useful for testing)

    Returns
    -------
    dict
        Training metrics and artifact paths
    """
    if horizons is None:
        horizons = [15, 30, 60, 90]

    # Create output directory
    models_dir = Path(models_dir)
    models_dir.mkdir(parents=True, exist_ok=True)

    metrics = {"horizons": horizons}
    max_horizon = max(horizons)

    # Step 1: Load feature matrix
    logger.info("=" * 60)
    logger.info("Step 1/6: Loading feature matrix...")
    logger.info("=" * 60)
    features_df = load_feature_matrix(features_dir)

    # Verify required columns exist
    available_features = [col for col in FEATURE_COLS if col in features_df.columns]
    missing_features = [col for col in FEATURE_COLS if col not in features_df.columns]
    if missing_features:
        logger.warning(f"Missing features: {missing_features}")
    logger.info(f"  Available features: {len(available_features)}/{len(FEATURE_COLS)}")

    # Step 2: Build hierarchy specification
    logger.info("=" * 60)
    logger.info("Step 2/6: Building hierarchy specification...")
    logger.info("=" * 60)
    stores = sorted(features_df.select("store_nbr").unique()["store_nbr"].to_list())
    families = sorted(features_df.select("family").unique()["family"].to_list())
    n_series = len(stores) * len(families)
    logger.info(f"  Stores: {len(stores)}")
    logger.info(f"  Families: {len(families)}")
    logger.info(f"  Bottom-level series: {n_series}")

    metrics["n_stores"] = len(stores)
    metrics["n_families"] = len(families)
    metrics["n_series"] = n_series

    # Step 3: Walk-forward cross-validation
    logger.info("=" * 60)
    logger.info("Step 3/6: Walk-forward cross-validation...")
    logger.info("=" * 60)
    cv_results = evaluate_model_cv(
        lightgbm_cv_model_fn,
        features_df,
        target_col="sales",
        n_splits=n_cv_splits,
        train_days=365,
        valid_days=max_horizon,
        gap_days=0,
        step_days=30,
    )
    metrics["cv_rmsle"] = cv_results["mean_rmsle"]
    metrics["cv_rmsle_std"] = cv_results["std_rmsle"]
    metrics["cv_fold_metrics"] = cv_results["fold_metrics"]
    logger.info(f"  CV RMSLE: {metrics['cv_rmsle']:.4f} (+/- {metrics['cv_rmsle_std']:.4f})")

    # Step 4: Train final model
    logger.info("=" * 60)
    logger.info("Step 4/6: Training final model...")
    logger.info("=" * 60)
    train_df, valid_df = create_train_valid_split(features_df, valid_days=max_horizon)
    model, feature_names = train_lightgbm(train_df, valid_df)

    # Evaluate final model
    predictions = predict_lightgbm(model, valid_df)
    y_true = valid_df.select("sales").to_numpy().ravel()
    final_metrics = compute_all_metrics(y_true, predictions)
    metrics["final_rmsle"] = final_metrics["rmsle"]
    metrics["final_rmse"] = final_metrics["rmse"]
    metrics["final_mae"] = final_metrics["mae"]
    logger.info(f"  Final RMSLE: {metrics['final_rmsle']:.4f}")
    logger.info(f"  Final RMSE: {metrics['final_rmse']:.2f}")

    # Quality gate
    if metrics["final_rmsle"] >= rmsle_threshold:
        logger.warning(
            f"  RMSLE {metrics['final_rmsle']:.4f} >= threshold {rmsle_threshold}"
        )
    else:
        logger.info(f"  RMSLE below threshold {rmsle_threshold}")

    # Save LightGBM model
    lgb_path = models_dir / "lightgbm_model.pkl"
    save_lightgbm_model(model, lgb_path)
    model.save_model(str(models_dir / "lightgbm_model.txt"))
    metrics["model_path"] = str(lgb_path)

    # Step 5: SHAP explainability
    if not skip_shap:
        logger.info("=" * 60)
        logger.info("Step 5/6: Computing SHAP values...")
        logger.info("=" * 60)
        try:
            explainer = create_tree_explainer(model)

            # Compute SHAP for a sample (full dataset too expensive)
            sample_size = min(1000, valid_df.height)
            sample_df = valid_df.sample(n=sample_size, seed=42)
            X_sample, _, _ = prepare_features(sample_df)

            shap_values = compute_shap_values(explainer, X_sample)

            # Get feature importance
            importance_df = get_feature_importance(shap_values, feature_names)
            importance_df.to_csv(models_dir / "feature_importance.csv", index=False)
            logger.info("  Top 5 features by SHAP importance:")
            for _, row in importance_df.head(5).iterrows():
                logger.info(f"    {row['feature']}: {row['importance']:.4f}")

            # Export waterfall data for API
            export_waterfall_data(
                shap_values,
                feature_names,
                models_dir / "shap_waterfall.json",
                max_display=10,
            )

            # Save explainer
            with open(models_dir / "shap_explainer.pkl", "wb") as f:
                pickle.dump(explainer, f)
            logger.info("  Saved SHAP explainer")
        except Exception as e:
            logger.error(f"  SHAP computation failed: {e}")
            logger.info("  Continuing without SHAP...")
    else:
        logger.info("=" * 60)
        logger.info("Step 5/6: Skipping SHAP computation...")
        logger.info("=" * 60)

    # Step 6: Export to ONNX
    logger.info("=" * 60)
    logger.info("Step 6/6: Exporting to ONNX...")
    logger.info("=" * 60)
    onnx_path = models_dir / "lightgbm_model.onnx"

    # Export with all features including categoricals (they're integer-encoded)
    # The model was trained with these features so ONNX needs them all
    logger.info(f"  Exporting with {len(feature_names)} features (including categoricals)")

    try:
        export_lightgbm_to_onnx(model, feature_names, onnx_path)

        # Validate ONNX model - use all features
        sample_df = valid_df.head(10).select(feature_names).to_pandas()
        # Encode categoricals as integers for ONNX input
        for cat_col in CATEGORICAL_COLS:
            if cat_col in sample_df.columns:
                sample_df[cat_col] = sample_df[cat_col].astype('category').cat.codes
        sample_input = sample_df.to_numpy().astype('float32')
        expected_output = model.predict(
            valid_df.head(10).select(feature_names).to_pandas()
        )
        onnx_valid = validate_onnx_model(onnx_path, sample_input, expected_output)

        if not onnx_valid:
            logger.warning("  ONNX validation failed - outputs don't match exactly")
        else:
            logger.info("  ONNX validation passed")
        metrics["onnx_path"] = str(onnx_path)
        metrics["onnx_valid"] = onnx_valid
    except Exception as e:
        logger.error(f"  ONNX export failed: {e}")
        metrics["onnx_valid"] = False

    # Save metrics
    save_metrics(metrics, models_dir / "metrics.json")

    # Summary
    logger.info("=" * 60)
    logger.info("Training complete!")
    logger.info("=" * 60)
    logger.info(f"  CV RMSLE: {metrics['cv_rmsle']:.4f} (+/- {metrics['cv_rmsle_std']:.4f})")
    logger.info(f"  Final RMSLE: {metrics['final_rmsle']:.4f}")
    logger.info(f"  Artifacts saved to: {models_dir}")
    logger.info("=" * 60)

    return metrics


def main() -> None:
    """CLI entry point for training."""
    parser = argparse.ArgumentParser(
        description="Train MLRF models",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--features-dir",
        type=Path,
        default=Path("data/features"),
        help="Directory containing feature_matrix.parquet",
    )
    parser.add_argument(
        "--models-dir",
        type=Path,
        default=Path("models"),
        help="Directory to save model artifacts",
    )
    parser.add_argument(
        "--rmsle-threshold",
        type=float,
        default=0.5,
        help="RMSLE threshold for quality gate",
    )
    parser.add_argument(
        "--cv-splits",
        type=int,
        default=3,
        help="Number of cross-validation splits",
    )
    parser.add_argument(
        "--skip-shap",
        action="store_true",
        help="Skip SHAP computation (faster)",
    )

    args = parser.parse_args()

    train_pipeline(
        features_dir=args.features_dir,
        models_dir=args.models_dir,
        rmsle_threshold=args.rmsle_threshold,
        n_cv_splits=args.cv_splits,
        skip_shap=args.skip_shap,
    )


if __name__ == "__main__":
    main()
