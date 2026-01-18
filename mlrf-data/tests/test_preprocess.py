"""Tests for preprocess module."""

import polars as pl

from mlrf_data.preprocess import merge_external_features


def test_merge_external_features_oil():
    """Test that oil prices are correctly merged and forward-filled."""
    # Create mock training data
    train = pl.DataFrame(
        {
            "date": pl.date_range(
                pl.date(2017, 1, 1), pl.date(2017, 1, 5), eager=True
            ).to_list(),
            "store_nbr": [1] * 5,
            "family": ["GROCERY"] * 5,
            "sales": [100.0, 200.0, 150.0, 300.0, 250.0],
        }
    )

    # Create mock oil data with gaps
    external = {
        "oil": pl.DataFrame(
            {
                "date": ["2017-01-01", "2017-01-03", "2017-01-05"],
                "dcoilwtico": [50.0, 52.0, 55.0],
            }
        )
    }

    result = merge_external_features(train, external)

    assert "oil_price" in result.columns
    # Check that forward fill worked (day 2 should have day 1's value)
    oil_prices = result.sort("date")["oil_price"].to_list()
    assert oil_prices[0] == 50.0  # Jan 1
    assert oil_prices[1] == 50.0  # Jan 2 (forward filled from Jan 1)
    assert oil_prices[2] == 52.0  # Jan 3
    assert oil_prices[3] == 52.0  # Jan 4 (forward filled from Jan 3)
    assert oil_prices[4] == 55.0  # Jan 5


def test_merge_external_features_holidays():
    """Test that holidays are correctly flagged."""
    train = pl.DataFrame(
        {
            "date": pl.date_range(
                pl.date(2017, 1, 1), pl.date(2017, 1, 5), eager=True
            ).to_list(),
            "store_nbr": [1] * 5,
            "family": ["GROCERY"] * 5,
            "sales": [100.0, 200.0, 150.0, 300.0, 250.0],
        }
    )

    external = {
        "holidays": pl.DataFrame(
            {
                "date": ["2017-01-01", "2017-01-02"],
                "type": ["Holiday", "Event"],
                "locale": ["National", "National"],
            }
        )
    }

    result = merge_external_features(train, external)

    assert "is_holiday" in result.columns
    holidays = result.sort("date")["is_holiday"].to_list()
    assert holidays[0] == 1  # Jan 1 is holiday
    assert holidays[1] == 1  # Jan 2 is holiday
    assert holidays[2] == 0  # Jan 3 not holiday
    assert holidays[3] == 0  # Jan 4 not holiday
    assert holidays[4] == 0  # Jan 5 not holiday


def test_merge_external_features_stores():
    """Test that store metadata is correctly joined."""
    train = pl.DataFrame(
        {
            "date": [pl.date(2017, 1, 1)] * 3,
            "store_nbr": [1, 2, 3],
            "family": ["GROCERY"] * 3,
            "sales": [100.0, 200.0, 150.0],
        }
    )

    external = {
        "stores": pl.DataFrame(
            {
                "store_nbr": [1, 2, 3],
                "city": ["Quito", "Guayaquil", "Cuenca"],
                "type": ["A", "B", "C"],
            }
        )
    }

    result = merge_external_features(train, external)

    assert "city" in result.columns
    assert "type" in result.columns
    cities = result.sort("store_nbr")["city"].to_list()
    assert cities == ["Quito", "Guayaquil", "Cuenca"]


def test_merge_external_features_no_data():
    """Test that merge handles empty external data."""
    train = pl.DataFrame(
        {
            "date": [pl.date(2017, 1, 1)],
            "store_nbr": [1],
            "family": ["GROCERY"],
            "sales": [100.0],
        }
    )

    result = merge_external_features(train, {})

    # Should return original data unchanged
    assert result.shape == train.shape
    assert result.columns == train.columns
