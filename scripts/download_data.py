"""Download the dataset's parquet files from Hugging Face into ./data/.

Usage:
    python scripts/download_data.py            # theses + reviews + word_freq_totals (small, ~fast)
    python scripts/download_data.py --all      # also the large word tables (word_counts, word_freq_by_year)
"""
import argparse
from pathlib import Path

from huggingface_hub import hf_hub_download

REPO_ID = "honza03210/cuni-bachelor-theses-style"
CORE = ["theses", "reviews", "word_freq_totals"]
LARGE = ["word_freq_by_year", "word_counts"]
DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="also download the large word tables")
    args = parser.parse_args()

    tables = CORE + (LARGE if args.all else [])
    DATA_DIR.mkdir(exist_ok=True)
    for name in tables:
        path = hf_hub_download(
            repo_id=REPO_ID,
            repo_type="dataset",
            filename=f"data/{name}.parquet",
            local_dir=DATA_DIR.parent,
        )
        print(f"{name}: {path}")


if __name__ == "__main__":
    main()
