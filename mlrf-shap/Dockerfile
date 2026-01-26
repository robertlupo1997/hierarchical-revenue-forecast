FROM python:3.11-slim

WORKDIR /app

# Install build dependencies for LightGBM
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy source code and pyproject.toml
COPY pyproject.toml .
COPY src/ src/

# Install the package
RUN pip install --no-cache-dir .

EXPOSE 50051

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:50051/health')" || exit 1

# Default command
CMD ["mlrf-shap", "--port", "50051", "--model", "/models/lightgbm_model.txt"]
