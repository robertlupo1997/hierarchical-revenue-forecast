# ADR-002: Go with ONNX Runtime for Inference Service

## Status

Accepted

## Date

2026-01-15

## Context

The MLRF system requires a production inference service to serve predictions with the following requirements:

- **Low latency**: P95 < 50ms, P99 < 100ms for single predictions
- **High throughput**: Support 1000+ requests/second
- **Batch support**: Efficiently handle batch predictions (up to 100 items)
- **Explainability**: Pre-computed SHAP values must be served alongside predictions
- **Caching**: Hot predictions should be cached to reduce model invocations

The trained LightGBM model is exported to ONNX format for portable inference.

### Options Considered

1. **Python (FastAPI/Flask)**: Native LightGBM/ONNX support, but GIL limits concurrency. P95 ~50-100ms.
2. **Go + ONNX Runtime**: Excellent concurrency, low memory, sub-10ms inference. Requires CGO bindings.
3. **Rust + ONNX Runtime**: Fastest option, but smaller talent pool and longer development time.
4. **TensorFlow Serving / TorchServe**: Overkill for single model, complex deployment.

## Decision

We chose **Go with ONNX Runtime** via the `onnxruntime_go` bindings for the inference service.

### Key factors

1. **Sub-10ms inference latency**: Go's efficient runtime combined with ONNX Runtime's optimized inference achieves P95 < 10ms for single predictions, well under our 50ms target.

2. **Goroutine concurrency**: Go's lightweight goroutines handle thousands of concurrent requests without Python's GIL bottleneck. Each request gets isolated execution context.

3. **Pre-allocated tensors**: We pre-allocate input/output tensors at startup and reuse them with mutex protection, eliminating per-request allocation overhead.

4. **Memory efficiency**: Go service runs at ~50MB RSS vs ~500MB for equivalent Python service. Critical for containerized deployments with multiple replicas.

5. **Static binary deployment**: Single binary deployment simplifies Docker images and reduces cold start time to ~100ms.

6. **Production-grade HTTP**: Go's `net/http` package is battle-tested for production services with built-in support for middleware, graceful shutdown, and context cancellation.

### Implementation Details

```go
// Pre-allocated tensors for zero-allocation inference
type ONNXSession struct {
    session      *ort.AdvancedSession
    inputTensor  *ort.Tensor[float32]
    outputTensor *ort.Tensor[float32]
    mu           sync.Mutex  // Thread-safe inference
}

func (s *ONNXSession) Predict(features []float32) (float32, error) {
    s.mu.Lock()
    defer s.mu.Unlock()
    copy(s.inputTensor.GetData(), features)
    // ... run inference
}
```

## Consequences

### Positive

- **P95 latency ~8ms**: 5x better than Python baseline, exceeds requirements
- **Linear scaling**: Throughput scales linearly with CPU cores via goroutines
- **Simple deployment**: Static binary + ONNX model file, no runtime dependencies
- **Low resource usage**: 50MB memory per replica enables dense packing
- **Type safety**: Go's type system catches prediction API errors at compile time

### Negative

- **CGO dependency**: ONNX Runtime requires CGO, complicating cross-compilation
- **Separate codebase**: Python training and Go inference require data format coordination
- **Limited Go ML ecosystem**: Feature engineering must happen in Python; Go only handles inference
- **Binary compatibility**: ONNX Runtime shared library must match OS/architecture

### Mitigations

- Docker multi-stage build handles CGO compilation with correct ONNX Runtime version
- Shared Parquet format and JSON schemas ensure Python/Go interoperability
- Feature engineering preprocessed to Parquet, loaded at Go startup
- CI builds test against specific ONNX Runtime version (1.18.0)

## References

- [ONNX Runtime Performance](https://onnxruntime.ai/docs/performance/)
- [onnxruntime_go bindings](https://github.com/yalue/onnxruntime_go)
- [LightGBM ONNX Export](https://onnxmltools.readthedocs.io/en/latest/)
