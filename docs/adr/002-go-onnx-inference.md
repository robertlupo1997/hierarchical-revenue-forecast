# ADR-002: Go with ONNX Runtime for Inference Service

## Status

Accepted

## Date

2026-01-15

> **Note on evidence.** The latency, memory, and startup figures previously reported here were not
> measured: no Go-versus-Python benchmark, memory profile, or startup timing artifact exists in this
> repository. They have been removed. The requirements below are targets, not achievements.

## Context

The MLRF system requires an inference service to serve predictions against the following targets:

- **Low latency**: P95 < 50ms, P99 < 100ms for single predictions
- **High throughput**: Support 1000+ requests/second
- **Batch support**: Efficiently handle batch predictions (up to 100 items)
- **Explainability**: Pre-computed SHAP values must be served alongside predictions
- **Caching**: Hot predictions should be cached to reduce model invocations

The trained LightGBM model is exported to ONNX format for portable inference.

### Options Considered

1. **Python (FastAPI/Flask)**: Native LightGBM/ONNX support, but the GIL limits concurrency.
2. **Go + ONNX Runtime**: Good concurrency and low memory footprint. Requires CGO bindings.
3. **Rust + ONNX Runtime**: Likely the fastest option, but a smaller talent pool and longer
   development time.
4. **TensorFlow Serving / TorchServe**: Overkill for single model, complex deployment.

## Decision

We chose **Go with ONNX Runtime** via the `onnxruntime_go` bindings for the inference service.

### Key factors

1. **Inference latency**: ONNX Runtime provides optimized inference and Go adds little runtime
   overhead. Actual latency for this model has not been measured.

2. **Goroutine concurrency**: Go handles many concurrent HTTP requests without Python's GIL
   bottleneck. Note that ONNX inference itself is **not** concurrent here: every prediction takes
   the same session-wide mutex for the duration of the call, so inference is serialized through one
   session.

3. **Pre-allocated tensors**: We pre-allocate input/output tensors at startup and reuse them under
   that mutex, avoiding per-request allocation.

4. **Memory footprint**: a Go service is expected to use less resident memory than an equivalent
   Python service. This has not been profiled here.

5. **Deployment shape**: a Go binary plus the ONNX model file and a matching ONNX Runtime shared
   library. This is not a static binary: the build enables CGO and the runtime image installs
   `libonnxruntime.so`, which the server loads explicitly.

6. **Standard-library HTTP**: Go's `net/http` supports middleware, graceful shutdown, and context
   cancellation, all of which this server uses.

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

- **Type safety**: Go's type system catches prediction API errors at compile time
- **Simple deployment unit**: one binary, the ONNX model, and the ONNX Runtime shared library

Latency, throughput scaling, and memory consequences are unmeasured and so are not claimed. Note
also that request throughput cannot scale linearly with cores while inference is serialized by the
session mutex, and that `PredictBatch` is a loop over that same serialized single-prediction call.

### Negative

- **CGO dependency**: ONNX Runtime requires CGO, complicating cross-compilation
- **Separate codebase**: Python training and Go inference require data format coordination
- **Limited Go ML ecosystem**: Feature engineering must happen in Python; Go only handles inference
- **Binary compatibility**: ONNX Runtime shared library must match OS/architecture

### Mitigations

- Docker multi-stage build handles CGO compilation with correct ONNX Runtime version
- Shared Parquet format and JSON schemas ensure Python/Go interoperability
- Feature engineering preprocessed to Parquet, loaded at Go startup
- The Docker image installs ONNX Runtime 1.18.0. The Go CI job builds and tests without installing
  or selecting that runtime library, so version compatibility is not covered by CI.

## References

- [ONNX Runtime Performance](https://onnxruntime.ai/docs/performance/)
- [onnxruntime_go bindings](https://github.com/yalue/onnxruntime_go)
- [LightGBM ONNX Export](https://onnxmltools.readthedocs.io/en/latest/)
