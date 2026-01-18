"""Download Kaggle Store Sales dataset."""

import zipfile
from pathlib import Path

from kaggle.api.kaggle_api_extended import KaggleApi


def download_competition_data(data_dir: Path) -> None:
    """
    Download and extract Kaggle Store Sales competition files.

    Requires ~/.kaggle/kaggle.json with valid API credentials.

    Parameters
    ----------
    data_dir : Path
        Base directory where data will be stored (creates data_dir/raw/)
    """
    api = KaggleApi()
    api.authenticate()

    raw_dir = data_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    competition = "store-sales-time-series-forecasting"
    print(f"Downloading {competition} data to {raw_dir}...")

    api.competition_download_files(competition, path=raw_dir)

    # Extract zip
    zip_path = raw_dir / f"{competition}.zip"
    if zip_path.exists():
        print(f"Extracting {zip_path}...")
        with zipfile.ZipFile(zip_path, "r") as zip_ref:
            zip_ref.extractall(raw_dir)
        zip_path.unlink()
        print("Extraction complete.")

    # Verify expected files exist
    expected_files = ["train.csv", "test.csv", "oil.csv", "holidays_events.csv", "stores.csv"]
    for fname in expected_files:
        fpath = raw_dir / fname
        if fpath.exists():
            print(f"  {fname}: OK ({fpath.stat().st_size / 1e6:.1f} MB)")
        else:
            print(f"  {fname}: MISSING")


if __name__ == "__main__":
    # Default data directory is project root/data
    project_root = Path(__file__).parent.parent.parent.parent.parent
    data_dir = project_root / "data"
    download_competition_data(data_dir)
