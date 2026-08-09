# ADR-001: Polars Over Pandas for Data Processing

## Status

Accepted

## Date

2026-01-15

> **Note on evidence.** This ADR records a decision and its rationale. It previously reported
> speed and memory measurements that no benchmark script, input snapshot, hardware description, or
> timing artifact in this repository substantiates. Those numbers have been removed rather than
> softened. Benchmark against a defined pandas baseline before quoting any ratio.

## Context

The MLRF system processes the Kaggle Store Sales dataset (54 stores × 33 product families over the
competition's date range). Data processing tasks include:

- Loading and joining multiple CSV files (train, oil prices, holidays, stores)
- Creating lag features (1, 7, 14, 28, 90 days) per store-family combination
- Computing rolling statistics (mean, std) over 7, 14, 28, 90-day windows
- Grouping and aggregating across 1,782 time series
- Saving processed data to Parquet format for downstream ML

Pandas is the dominant Python DataFrame library but has known performance limitations with large datasets due to its single-threaded GIL-bound operations and memory-inefficient Python object storage.

### Requirements

1. Process the full multi-year dataset efficiently
2. Handle grouped operations (lag, rolling) across 1,782 series
3. Integrate with Parquet for efficient storage
4. Maintain developer productivity with familiar DataFrame semantics

## Decision

We chose **Polars** over Pandas for all data processing in the `mlrf-data` package.

### Key factors

1. **Performance expectation**: Polars is Rust-backed and uses the Apache Arrow memory format. The
   project's published benchmarks report large speedups on grouped operations relative to Pandas.
   We did not measure this on our own dataset.

2. **Lazy evaluation**: Polars supports lazy query plans that optimize the computation graph before
   execution, enabling optimizations such as predicate pushdown.

3. **Parallel execution**: Polars executes many operations across multiple threads without the GIL.
   We did not measure how our grouped operations scale with core count.

4. **Memory expectation**: the Arrow columnar format is more compact than Pandas' object storage for
   mixed-type DataFrames. We did not profile memory for this pipeline.

5. **Native Parquet support**: Polars reads and writes Parquet directly, which is the exchange
   format with the ML pipeline.

6. **API**: Polars expression syntax (`df.with_columns(pl.col("x").shift(1).over("group"))`)
   expresses the grouped lag and rolling operations this pipeline needs.

## Consequences

### Positive

- **Concise grouped operations**: Polars `.over()` expresses per-series lag and rolling features
  without explicit groupby-transform patterns
- **Active development**: Polars is actively maintained with a growing ecosystem

Speed and memory outcomes are unmeasured for this pipeline and are therefore not listed as
consequences.

### Negative

- **Smaller ecosystem**: Fewer third-party integrations than Pandas. Some ML libraries require Pandas conversion at boundaries.
- **Team learning curve**: Engineers familiar with Pandas need to learn Polars expression syntax
- **Documentation gaps**: Some advanced patterns have less community documentation

### Mitigations

- The Pandas boundary was not avoided: `mlrf-ml` declares pandas as a dependency, and
  `prepare_features` converts Polars data to pandas before LightGBM training. Polars is used in the
  data package; pandas is used at the model boundary.
- Internal documentation covers the Polars idioms used in the codebase

## References

- [Polars User Guide](https://pola-rs.github.io/polars/user-guide/)
- [Polars vs Pandas Benchmark](https://pola-rs.github.io/polars/user-guide/benchmarks/)
- [Apache Arrow Columnar Format](https://arrow.apache.org/docs/format/Columnar.html)
