# MLRF Implementation Prompt

You are implementing the Multi-LOB Revenue Forecasting System (MLRF).

## Instructions

1. Read `IMPLEMENTATION_PLAN.md` to understand the full project
2. Read `CLAUDE.md` for build commands and architecture overview
3. Check `progress.md` to see what's been completed
4. Work on the NEXT incomplete phase
5. After completing a phase, update `progress.md` with what you did
6. Run ALL automated verification commands before marking complete
7. Commit your changes with a descriptive message

## Current Focus: Phase 1.1 - Data Pipeline

### Tasks
1. Create `mlrf-data/` directory structure
2. Create `mlrf-data/pyproject.toml` with dependencies
3. Create `mlrf-data/src/mlrf_data/__init__.py`
4. Implement `mlrf-data/src/mlrf_data/download.py` - Kaggle API download
5. Implement `mlrf-data/src/mlrf_data/preprocess.py` - Polars cleaning
6. Implement `mlrf-data/src/mlrf_data/features.py` - Lag/rolling features
7. Implement `mlrf-data/src/mlrf_data/hierarchy.py` - Summing matrix
8. Create `mlrf-data/tests/` with unit tests
9. Run verification commands

### Verification Commands (ALL must pass)
```bash
cd mlrf-data && pip install -e ".[dev]"
python -m mlrf_data.download
python -m mlrf_data.features
pytest mlrf-data/tests/ -v
ruff check mlrf-data/
```

### Completion Criteria
- All 5 verification commands pass
- Feature matrix exists at `data/features/feature_matrix.parquet`
- Feature matrix has >2M rows (check with: `python -c "import polars as pl; print(pl.read_parquet('data/features/feature_matrix.parquet').shape)"`)
- Tests verify no data leakage (lag values are from prior dates only)
- Tests verify hierarchy sums correctly

### When Complete
Update `progress.md` with:
- Files created
- Verification results
- Any issues encountered

Then output: PHASE_1_1_COMPLETE

---

## Phase Progression

After Phase 1.1, move to Phase 1.2 (ML Pipeline), then 1.3 (Go API), then 1.4 (Dashboard), then 1.5 (Integration).

Each phase has its own verification commands in `IMPLEMENTATION_PLAN.md`.

## Important Notes

- Use Polars, NOT Pandas (see CLAUDE.md for rationale)
- All code must pass `ruff check` before committing
- Write tests as you go - TDD preferred
- Commit after each major component
- If stuck on Kaggle API, check for ~/.kaggle/kaggle.json credentials
