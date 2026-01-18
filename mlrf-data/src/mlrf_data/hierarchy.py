"""Build summing matrix for hierarchical forecasting.

Hierarchy structure:
- Level 0: Total (1 series) - sum of all sales
- Level 1: Store (54 series) - sum by store
- Level 2: Family (33 series) - sum by product family
- Level 3: Store × Family (1,782 series) - bottom level, individual series
"""

from pathlib import Path

import numpy as np
import polars as pl


def build_hierarchy_spec(df: pl.DataFrame) -> dict:
    """
    Create hierarchy specification for hierarchicalforecast.

    Parameters
    ----------
    df : pl.DataFrame
        Feature matrix with store_nbr and family columns

    Returns
    -------
    dict
        Hierarchy specification containing:
        - bottom_ids: list of unique_id strings for bottom level
        - tags: dict mapping level names to arrays of tags
        - n_stores: number of stores
        - n_families: number of product families
        - n_bottom: number of bottom-level series
    """
    # Get unique stores and families, sorted for consistent ordering
    stores = sorted(df.select("store_nbr").unique()["store_nbr"].to_list())
    families = sorted(df.select("family").unique()["family"].to_list())

    n_stores = len(stores)
    n_families = len(families)

    # Create unique_id for each bottom-level series (store × family)
    # Order matters: iterate stores first, then families within each store
    bottom_ids = []
    for store in stores:
        for family in families:
            bottom_ids.append(f"{store}_{family}")

    # Build tags dictionary for hierarchicalforecast
    # Each tag maps bottom-level series to their parent at each level
    tags = {
        "Total": np.array(["Total"] * len(bottom_ids)),
        "Store": np.array([f"Store_{uid.split('_')[0]}" for uid in bottom_ids]),
        "Family": np.array([f"Family_{'_'.join(uid.split('_')[1:])}" for uid in bottom_ids]),
    }

    return {
        "bottom_ids": bottom_ids,
        "tags": tags,
        "n_stores": n_stores,
        "n_families": n_families,
        "n_bottom": len(bottom_ids),
    }


def create_summing_matrix(hierarchy_spec: dict) -> np.ndarray:
    """
    Create summing matrix S for reconciliation.

    The summing matrix S relates bottom-level forecasts to all levels:
    S @ bottom_forecasts = all_level_forecasts

    Matrix structure:
    - Row 0: Total (sums all bottom series)
    - Rows 1 to n_stores: Store aggregates
    - Rows n_stores+1 to n_stores+n_families: Family aggregates
    - Rows n_stores+n_families+1 to end: Identity for bottom level

    Parameters
    ----------
    hierarchy_spec : dict
        Output from build_hierarchy_spec()

    Returns
    -------
    np.ndarray
        Summing matrix S with shape (n_total, n_bottom)
        where n_total = 1 + n_stores + n_families + n_bottom
    """
    n_bottom = hierarchy_spec["n_bottom"]
    n_stores = hierarchy_spec["n_stores"]
    n_families = hierarchy_spec["n_families"]

    # Total aggregation levels:
    # 1 (Total) + 54 (Stores) + 33 (Families) + 1782 (Bottom) = 1870
    n_total = 1 + n_stores + n_families + n_bottom

    S = np.zeros((n_total, n_bottom), dtype=np.float32)

    # Row 0: Total row (sums all bottom-level series)
    S[0, :] = 1.0

    # Rows 1 to n_stores: Store aggregates
    # Each store's row sums all families within that store
    for store_idx in range(n_stores):
        start = store_idx * n_families
        end = start + n_families
        S[1 + store_idx, start:end] = 1.0

    # Rows n_stores+1 to n_stores+n_families: Family aggregates
    # Each family's row sums that family across all stores
    for family_idx in range(n_families):
        for store_idx in range(n_stores):
            S[1 + n_stores + family_idx, store_idx * n_families + family_idx] = 1.0

    # Bottom level: identity matrix
    S[1 + n_stores + n_families :, :] = np.eye(n_bottom, dtype=np.float32)

    return S


def validate_summing_matrix(S: np.ndarray, hierarchy_spec: dict) -> bool:
    """
    Validate the summing matrix has correct properties.

    Checks:
    1. Total row sums to n_bottom
    2. Each store row sums to n_families
    3. Each family row sums to n_stores
    4. Bottom rows are identity

    Parameters
    ----------
    S : np.ndarray
        Summing matrix
    hierarchy_spec : dict
        Hierarchy specification

    Returns
    -------
    bool
        True if all validations pass
    """
    n_stores = hierarchy_spec["n_stores"]
    n_families = hierarchy_spec["n_families"]
    n_bottom = hierarchy_spec["n_bottom"]

    # Check total row
    total_sum = S[0, :].sum()
    assert total_sum == n_bottom, f"Total row sums to {total_sum}, expected {n_bottom}"

    # Check store rows
    for i in range(n_stores):
        store_sum = S[1 + i, :].sum()
        assert store_sum == n_families, f"Store row {i} sums to {store_sum}, expected {n_families}"

    # Check family rows
    for j in range(n_families):
        family_sum = S[1 + n_stores + j, :].sum()
        assert family_sum == n_stores, f"Family row {j} sums to {family_sum}, expected {n_stores}"

    # Check bottom rows form identity
    bottom_start = 1 + n_stores + n_families
    bottom_block = S[bottom_start:, :]
    expected_identity = np.eye(n_bottom, dtype=np.float32)
    assert np.allclose(bottom_block, expected_identity), "Bottom rows don't form identity"

    print("Summing matrix validation passed!")
    return True


def hierarchy_pipeline(features_dir: Path, models_dir: Path) -> dict:
    """
    Build and save hierarchy specification and summing matrix.

    Parameters
    ----------
    features_dir : Path
        Directory containing feature matrix
    models_dir : Path
        Directory to save hierarchy artifacts

    Returns
    -------
    dict
        Hierarchy specification
    """
    models_dir.mkdir(parents=True, exist_ok=True)

    # Load feature matrix to get unique stores and families
    input_path = features_dir / "feature_matrix.parquet"
    print(f"Loading feature matrix from {input_path}...")
    df = pl.read_parquet(input_path)

    # Build hierarchy spec
    print("Building hierarchy specification...")
    hierarchy_spec = build_hierarchy_spec(df)
    print(f"  Stores: {hierarchy_spec['n_stores']}")
    print(f"  Families: {hierarchy_spec['n_families']}")
    print(f"  Bottom series: {hierarchy_spec['n_bottom']}")

    # Create summing matrix
    print("Creating summing matrix...")
    S = create_summing_matrix(hierarchy_spec)
    print(f"  Shape: {S.shape}")

    # Validate
    validate_summing_matrix(S, hierarchy_spec)

    # Save artifacts
    # Save summing matrix as numpy array
    np.save(models_dir / "summing_matrix.npy", S)
    print(f"Saved summing matrix to {models_dir / 'summing_matrix.npy'}")

    # Save hierarchy spec (excluding numpy arrays for JSON compatibility)
    import json

    spec_for_json = {
        "bottom_ids": hierarchy_spec["bottom_ids"],
        "n_stores": hierarchy_spec["n_stores"],
        "n_families": hierarchy_spec["n_families"],
        "n_bottom": hierarchy_spec["n_bottom"],
    }
    with open(models_dir / "hierarchy_spec.json", "w") as f:
        json.dump(spec_for_json, f, indent=2)
    print(f"Saved hierarchy spec to {models_dir / 'hierarchy_spec.json'}")

    # Save tags as separate numpy arrays
    for level_name, tags_array in hierarchy_spec["tags"].items():
        np.save(models_dir / f"tags_{level_name.lower()}.npy", tags_array)

    return hierarchy_spec


if __name__ == "__main__":
    project_root = Path(__file__).parent.parent.parent.parent.parent
    features_dir = project_root / "data" / "features"
    models_dir = project_root / "models"

    hierarchy_pipeline(features_dir, models_dir)
