"""Entry point for python -m mlrf_ml.

Usage:
    python -m mlrf_ml                    # Run full training pipeline
    python -m mlrf_ml --help             # Show help
    python -m mlrf_ml --skip-shap        # Skip SHAP (faster)
"""

from mlrf_ml.train import main

if __name__ == "__main__":
    main()
