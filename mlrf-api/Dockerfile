# Build stage
FROM golang:1.22-bookworm AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build with CGO enabled (required for ONNX Runtime)
RUN CGO_ENABLED=1 GOOS=linux go build -o server ./cmd/server

# Runtime stage
FROM debian:bookworm-slim

# Install ONNX Runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Download and install ONNX Runtime
ARG ONNX_VERSION=1.18.0
RUN wget -q https://github.com/microsoft/onnxruntime/releases/download/v${ONNX_VERSION}/onnxruntime-linux-x64-${ONNX_VERSION}.tgz \
    && tar -xzf onnxruntime-linux-x64-${ONNX_VERSION}.tgz \
    && cp onnxruntime-linux-x64-${ONNX_VERSION}/lib/* /usr/lib/ \
    && ldconfig \
    && rm -rf onnxruntime-linux-x64-${ONNX_VERSION}* \
    && apt-get update && apt-get install -y --no-install-recommends curl \
    && apt-get purge -y wget \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/server .

# Copy models directory (will be mounted in docker-compose)
# COPY models/ ./models/

# Environment variables
ENV PORT=8081
ENV MODEL_PATH=/app/models/lightgbm_model.onnx
ENV FEATURE_PATH=/app/data/features/feature_matrix.parquet
ENV ONNX_LIB_PATH=/usr/lib/libonnxruntime.so

EXPOSE 8081

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -sf http://localhost:8081/health || exit 1

CMD ["./server"]
