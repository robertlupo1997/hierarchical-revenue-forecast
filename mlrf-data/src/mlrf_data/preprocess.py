"""Clean and validate raw data using Polars."""

from pathlib import Path

import polars as pl


def load_and_clean_train(raw_dir: Path) -> pl.DataFrame:
    """
    Load train.csv and perform initial cleaning.

    Parameters
    ----------
    raw_dir : Path
        Directory containing raw CSV files

    Returns
    -------
    pl.DataFrame
        Cleaned training data with proper types
    """
    print(f"Loading train.csv from {raw_dir}...")
    df = pl.read_csv(raw_dir / "train.csv")

    # Convert date column (already in ISO format)
    df = df.with_columns(pl.col("date").str.to_date("%Y-%m-%d"))

    # Validate no nulls in key columns
    null_count = df.select(pl.col("sales").null_count()).item()
    assert null_count == 0, f"Found {null_count} null values in sales column"

    # Ensure sales are non-negative (required for RMSLE)
    negative_count = df.filter(pl.col("sales") < 0).height
    if negative_count > 0:
        print(f"Warning: Found {negative_count} negative sales values, clipping to 0")
        df = df.with_columns(
            pl.when(pl.col("sales") < 0).then(0).otherwise(pl.col("sales")).alias("sales")
        )

    print(f"Loaded {df.height:,} rows, {df.width} columns")
    print(f"Date range: {df['date'].min()} to {df['date'].max()}")

    return df


def load_external_data(raw_dir: Path) -> dict[str, pl.DataFrame]:
    """
    Load supplementary files (oil, holidays, stores, transactions).

    Parameters
    ----------
    raw_dir : Path
        Directory containing raw CSV files

    Returns
    -------
    dict[str, pl.DataFrame]
        Dictionary mapping filename (without .csv) to DataFrame
    """
    external = {}

    # Oil prices
    oil_path = raw_dir / "oil.csv"
    if oil_path.exists():
        external["oil"] = pl.read_csv(oil_path)
        print(f"Loaded oil.csv: {external['oil'].height} rows")

    # Holidays
    holidays_path = raw_dir / "holidays_events.csv"
    if holidays_path.exists():
        external["holidays"] = pl.read_csv(holidays_path)
        print(f"Loaded holidays_events.csv: {external['holidays'].height} rows")

    # Stores
    stores_path = raw_dir / "stores.csv"
    if stores_path.exists():
        external["stores"] = pl.read_csv(stores_path)
        print(f"Loaded stores.csv: {external['stores'].height} rows")

    # Transactions (optional, not always available)
    transactions_path = raw_dir / "transactions.csv"
    if transactions_path.exists():
        external["transactions"] = pl.read_csv(transactions_path)
        print(f"Loaded transactions.csv: {external['transactions'].height} rows")

    return external


def merge_external_features(
    train: pl.DataFrame,
    external: dict[str, pl.DataFrame],
) -> pl.DataFrame:
    """
    Join external data to training set.

    Parameters
    ----------
    train : pl.DataFrame
        Training data with date, store_nbr, family columns
    external : dict[str, pl.DataFrame]
        Dictionary of external data (oil, holidays, stores)

    Returns
    -------
    pl.DataFrame
        Training data with external features merged
    """
    df = train.clone()

    # Oil prices (forward fill missing values)
    if "oil" in external:
        oil = external["oil"].with_columns(pl.col("date").str.to_date("%Y-%m-%d"))
        oil = oil.sort("date").with_columns(
            pl.col("dcoilwtico").forward_fill().alias("oil_price")
        )
        oil = oil.select("date", "oil_price")

        df = df.join(oil, on="date", how="left")
        # Forward fill after join to handle dates not in oil data
        df = df.sort("date").with_columns(pl.col("oil_price").forward_fill())
        # Fill any remaining nulls (at start) with global median
        median_oil = df.select(pl.col("oil_price").median()).item()
        df = df.with_columns(pl.col("oil_price").fill_null(median_oil))
        print(f"Merged oil prices (median fill: {median_oil:.2f})")

    # Store metadata
    if "stores" in external:
        df = df.join(external["stores"], on="store_nbr", how="left")
        print(f"Merged store metadata ({external['stores'].width - 1} columns)")

    # Holidays (national only for simplicity)
    if "holidays" in external:
        holidays = external["holidays"].filter(pl.col("locale") == "National")
        holidays = holidays.with_columns(
            pl.col("date").str.to_date("%Y-%m-%d"),
            pl.lit(1).alias("is_holiday"),
        )
        holidays = holidays.select("date", "is_holiday").unique()

        df = df.join(holidays, on="date", how="left")
        df = df.with_columns(pl.col("is_holiday").fill_null(0))
        print(f"Merged holidays ({holidays.height} national holidays)")

    return df


def preprocess_pipeline(raw_dir: Path, processed_dir: Path) -> pl.DataFrame:
    """
    Run full preprocessing pipeline.

    Parameters
    ----------
    raw_dir : Path
        Directory containing raw CSV files
    processed_dir : Path
        Directory to save processed Parquet files

    Returns
    -------
    pl.DataFrame
        Preprocessed data ready for feature engineering
    """
    processed_dir.mkdir(parents=True, exist_ok=True)

    # Load data
    train = load_and_clean_train(raw_dir)
    external = load_external_data(raw_dir)

    # Merge external features
    df = merge_external_features(train, external)

    # Save to Parquet (much smaller and faster than CSV)
    output_path = processed_dir / "train_preprocessed.parquet"
    df.write_parquet(output_path)
    print(f"Saved preprocessed data to {output_path}")
    print(f"Final shape: {df.height:,} rows, {df.width} columns")

    return df


if __name__ == "__main__":
    project_root = Path(__file__).parent.parent.parent.parent
    raw_dir = project_root / "data" / "raw"
    processed_dir = project_root / "data" / "processed"

    preprocess_pipeline(raw_dir, processed_dir)
