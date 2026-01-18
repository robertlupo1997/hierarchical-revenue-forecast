"""Tests for hierarchy module."""

import numpy as np
import polars as pl

from mlrf_data.hierarchy import (
    build_hierarchy_spec,
    create_summing_matrix,
    validate_summing_matrix,
)


def create_sample_data(n_stores: int = 3, n_families: int = 2) -> pl.DataFrame:
    """Create sample data with specified number of stores and families."""
    rows = []
    for store in range(1, n_stores + 1):
        for family_idx in range(n_families):
            family = f"FAMILY_{family_idx}"
            rows.append({
                "store_nbr": store,
                "family": family,
                "sales": float(100 + store * 10 + family_idx * 5),
            })
    return pl.DataFrame(rows)


def test_build_hierarchy_spec_counts():
    """Test that hierarchy spec has correct counts."""
    df = create_sample_data(n_stores=5, n_families=4)
    spec = build_hierarchy_spec(df)

    assert spec["n_stores"] == 5
    assert spec["n_families"] == 4
    assert spec["n_bottom"] == 20  # 5 stores × 4 families


def test_build_hierarchy_spec_bottom_ids():
    """Test that bottom_ids are correctly formatted."""
    df = create_sample_data(n_stores=2, n_families=2)
    spec = build_hierarchy_spec(df)

    # Check format: "store_family"
    assert len(spec["bottom_ids"]) == 4
    # First two should be store 1
    assert spec["bottom_ids"][0].startswith("1_")
    assert spec["bottom_ids"][1].startswith("1_")
    # Next two should be store 2
    assert spec["bottom_ids"][2].startswith("2_")
    assert spec["bottom_ids"][3].startswith("2_")


def test_build_hierarchy_spec_tags():
    """Test that hierarchy tags are correctly created."""
    df = create_sample_data(n_stores=2, n_families=2)
    spec = build_hierarchy_spec(df)

    # Total tag should all be "Total"
    assert np.all(spec["tags"]["Total"] == "Total")

    # Store tags should be "Store_N"
    store_tags = spec["tags"]["Store"]
    assert store_tags[0] == "Store_1"
    assert store_tags[1] == "Store_1"
    assert store_tags[2] == "Store_2"
    assert store_tags[3] == "Store_2"


def test_create_summing_matrix_shape():
    """Test that summing matrix has correct shape."""
    df = create_sample_data(n_stores=3, n_families=2)
    spec = build_hierarchy_spec(df)
    S = create_summing_matrix(spec)

    # Expected shape: (1 + 3 + 2 + 6, 6) = (12, 6)
    expected_rows = 1 + spec["n_stores"] + spec["n_families"] + spec["n_bottom"]
    expected_cols = spec["n_bottom"]

    assert S.shape == (expected_rows, expected_cols)


def test_create_summing_matrix_total_row():
    """Test that total row sums all bottom series."""
    df = create_sample_data(n_stores=3, n_families=2)
    spec = build_hierarchy_spec(df)
    S = create_summing_matrix(spec)

    # Total row (row 0) should sum all columns
    assert S[0, :].sum() == spec["n_bottom"]
    assert np.all(S[0, :] == 1.0)


def test_create_summing_matrix_store_rows():
    """Test that store rows correctly aggregate families."""
    df = create_sample_data(n_stores=3, n_families=2)
    spec = build_hierarchy_spec(df)
    S = create_summing_matrix(spec)

    # Each store row should have n_families 1s
    for i in range(spec["n_stores"]):
        store_row = S[1 + i, :]
        assert store_row.sum() == spec["n_families"]

        # 1s should be in correct positions (contiguous for each store)
        start = i * spec["n_families"]
        end = start + spec["n_families"]
        assert np.all(store_row[start:end] == 1.0)
        # Rest should be zeros
        assert np.all(store_row[:start] == 0.0)
        assert np.all(store_row[end:] == 0.0)


def test_create_summing_matrix_family_rows():
    """Test that family rows correctly aggregate stores."""
    df = create_sample_data(n_stores=3, n_families=2)
    spec = build_hierarchy_spec(df)
    S = create_summing_matrix(spec)

    # Each family row should have n_stores 1s
    for j in range(spec["n_families"]):
        family_row = S[1 + spec["n_stores"] + j, :]
        assert family_row.sum() == spec["n_stores"]


def test_create_summing_matrix_bottom_identity():
    """Test that bottom level is identity matrix."""
    df = create_sample_data(n_stores=3, n_families=2)
    spec = build_hierarchy_spec(df)
    S = create_summing_matrix(spec)

    # Bottom block should be identity
    bottom_start = 1 + spec["n_stores"] + spec["n_families"]
    bottom_block = S[bottom_start:, :]

    expected = np.eye(spec["n_bottom"], dtype=np.float32)
    assert np.allclose(bottom_block, expected)


def test_validate_summing_matrix_passes():
    """Test that valid matrix passes validation."""
    df = create_sample_data(n_stores=3, n_families=2)
    spec = build_hierarchy_spec(df)
    S = create_summing_matrix(spec)

    # Should not raise
    assert validate_summing_matrix(S, spec) is True


def test_summing_matrix_aggregation():
    """Test that summing matrix correctly aggregates forecasts."""
    df = create_sample_data(n_stores=2, n_families=2)
    spec = build_hierarchy_spec(df)
    S = create_summing_matrix(spec)

    # Create sample bottom-level forecasts
    bottom_forecasts = np.array([100, 200, 300, 400], dtype=np.float32)

    # Apply summing matrix
    all_forecasts = S @ bottom_forecasts

    # Check total (should be sum of all)
    assert all_forecasts[0] == 1000  # 100 + 200 + 300 + 400

    # Check store aggregates
    assert all_forecasts[1] == 300  # Store 1: 100 + 200
    assert all_forecasts[2] == 700  # Store 2: 300 + 400

    # Check family aggregates
    assert all_forecasts[3] == 400  # Family 0: 100 + 300
    assert all_forecasts[4] == 600  # Family 1: 200 + 400

    # Check bottom level (should be unchanged)
    assert np.allclose(all_forecasts[5:], bottom_forecasts)


def test_hierarchy_spec_deterministic_ordering():
    """Test that hierarchy spec produces deterministic ordering."""
    df = create_sample_data(n_stores=3, n_families=2)

    spec1 = build_hierarchy_spec(df)
    spec2 = build_hierarchy_spec(df)

    assert spec1["bottom_ids"] == spec2["bottom_ids"]
    assert np.array_equal(spec1["tags"]["Store"], spec2["tags"]["Store"])
