#!/usr/bin/env python3
"""Generate hierarchy_data.json for the API from feature matrix.

This script creates a hierarchical data structure with all 54 stores
and 33 product families, using actual sales data from the feature matrix
as predictions/baselines.

Usage:
    python scripts/generate_hierarchy_json.py
"""
import json
import sys
from pathlib import Path

import polars as pl


def generate_hierarchy_json(features_path: Path, output_path: Path) -> None:
    """Generate hierarchy JSON with real predictions from feature matrix.

    Args:
        features_path: Path to feature_matrix.parquet
        output_path: Path to write hierarchy_data.json
    """
    print(f"Loading feature matrix from {features_path}...")
    df = pl.read_parquet(features_path)

    # Get unique stores and families
    stores = sorted(df["store_nbr"].unique().to_list())
    families = sorted(df["family"].unique().to_list())

    print(f"Found {len(stores)} stores, {len(families)} families")

    # Calculate aggregated predictions (using mean sales as proxy for prediction)
    # In production, this would use actual model predictions
    store_totals = df.group_by("store_nbr").agg(
        pl.col("sales").mean().alias("prediction")
    ).sort("store_nbr")

    # Store-family level aggregations
    store_family_totals = df.group_by(["store_nbr", "family"]).agg(
        pl.col("sales").mean().alias("prediction")
    ).sort(["store_nbr", "family"])

    # Total prediction across all stores and families
    total_prediction = df["sales"].sum()

    # Build hierarchy tree
    hierarchy = {
        "id": "total",
        "name": "Total",
        "level": "total",
        "prediction": float(total_prediction),
        "trend_percent": 12.3,  # Mock trend for total
        "children": []
    }

    print("Building hierarchy tree...")
    for store_nbr in stores:
        # Get store prediction
        store_pred_row = store_totals.filter(pl.col("store_nbr") == store_nbr)
        store_mean = float(store_pred_row["prediction"][0])

        # Calculate store total (mean * num_families * approximate_days)
        store_prediction = store_mean * len(families) * 30  # 30-day horizon

        # Generate pseudo-random trend based on store number
        store_trend = round((store_nbr % 20) - 10 + 2.3, 1)

        store_node = {
            "id": f"store_{store_nbr}",
            "name": f"Store {store_nbr}",
            "level": "store",
            "prediction": store_prediction,
            "trend_percent": store_trend,
            "children": []
        }

        # Add families for this store
        store_families = store_family_totals.filter(
            pl.col("store_nbr") == store_nbr
        )

        for family in families:
            family_row = store_families.filter(pl.col("family") == family)
            if len(family_row) > 0:
                family_pred = float(family_row["prediction"][0]) * 30  # 30-day
            else:
                family_pred = 0.0

            # Generate pseudo-random trend based on family name hash
            family_trend = round((hash(family) % 21) - 10 + 3.0, 1)

            store_node["children"].append({
                "id": f"{store_nbr}_{family.replace(' ', '_')}",
                "name": family,
                "level": "family",
                "prediction": family_pred,
                "trend_percent": family_trend
            })

        hierarchy["children"].append(store_node)

    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Write JSON with nice formatting
    output_path.write_text(json.dumps(hierarchy, indent=2))

    print(f"Generated {output_path}")
    print(f"  - {len(stores)} stores")
    print(f"  - {len(families)} families per store")
    print(f"  - {len(stores) * len(families)} total leaf nodes")


def main() -> int:
    """Main entry point."""
    project_root = Path(__file__).parent.parent
    features_path = project_root / "data" / "features" / "feature_matrix.parquet"
    output_path = project_root / "models" / "hierarchy_data.json"

    if not features_path.exists():
        print(f"Error: Feature matrix not found at {features_path}")
        print("Run the feature pipeline first: python -m mlrf_data.features")
        return 1

    generate_hierarchy_json(features_path, output_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
