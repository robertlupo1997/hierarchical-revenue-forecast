# MLRF Dashboard Roadmap

## Current State (as of 2026-01-18)

### Working Features
- **API Endpoints**: health, predict, batch predict, explain, hierarchy, model-metrics (port 8081)
- **Dashboard**: React + TypeScript + visx + Tailwind CSS
- **SHAP Waterfall**: Real explanations from API with feature contributions
- **Model Comparison**: 4 models displayed (LightGBM, AutoARIMA, ETS, SeasonalNaive)
- **Hierarchy Drilldown**: Total → Store → Product Family navigation
- **Theme Toggle**: Dark/light mode with CSS variables
- **Live API Connection**: No more "demo data" banner
- **Docker Compose**: API + Dashboard + Redis all running

### Technical Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, visx charts, React Query
- **API**: Go 1.21, Chi router, ONNX Runtime, Redis caching
- **ML**: LightGBM, statsforecast, hierarchicalforecast, SHAP
- **Data**: 54 stores × 33 product families = 1,782 time series

### Test Results
- Integration tests: 7/9 passing (2 latency threshold failures due to WSL2)
- TypeScript: Passing
- ESLint: 1 pre-existing warning

---

## Feature Gaps

### 1. Forecast Chart Uses Mock Data
**Priority**: HIGH
**Current**: `ForecastChart` component displays hardcoded mock data from `mockForecastData` array
**Expected**: Should fetch real predictions from `/predict` endpoint for selected store/family
**Files**: `mlrf-dashboard/src/pages/Dashboard.tsx` (lines 82-95)

### 2. Horizon Selector Missing
**Priority**: HIGH
**Current**: Hardcoded to 90-day forecasts
**Expected**: Dropdown to select 15, 30, 60, or 90 day forecast horizons
**API Support**: Already exists - `horizon` parameter in predict request

### 3. Date Picker Not Functional
**Priority**: HIGH
**Current**: Date picker is visual only, doesn't trigger new API calls
**Expected**: Changing date should refetch hierarchy and predictions for that date
**Files**: `mlrf-dashboard/src/pages/Dashboard.tsx` (line 182, 279-285)

### 4. Trend Badges Hardcoded
**Priority**: MEDIUM
**Current**: "+12%" badges on stat cards are static
**Expected**: Calculate real trends by comparing current vs previous period predictions
**Files**: `mlrf-dashboard/src/pages/Dashboard.tsx` (lines 324-353)

### 5. No Store Search/Filter
**Priority**: MEDIUM
**Current**: Must scroll through all stores in hierarchy
**Expected**: Search box to filter stores by name/number
**Scale**: 54 stores to search through

### 6. No Export Functionality
**Priority**: MEDIUM
**Current**: No way to download data
**Expected**: Export forecasts to CSV/Excel for reporting
**Data**: Store predictions, SHAP values, model metrics

### 7. README Has Wrong Port
**Priority**: LOW
**Current**: Documentation shows port 8080
**Expected**: Should show port 8081
**Files**: `README.md` (lines 54-55, 67-75)

### 8. Forecast Accuracy Visualization Missing
**Priority**: LOW
**Current**: No historical accuracy view
**Expected**: Chart showing predicted vs actual values for past periods
**Data**: Would need historical predictions stored

---

## API Endpoints Available

| Endpoint | Method | Purpose | Used By Dashboard |
|----------|--------|---------|-------------------|
| `/health` | GET | Health check | No |
| `/predict` | POST | Single prediction | No (should be) |
| `/predict/batch` | POST | Batch predictions | No |
| `/explain` | POST | SHAP waterfall | Yes |
| `/hierarchy` | GET | Hierarchy tree | Yes |
| `/model-metrics` | GET | Model comparison | Yes |
| `/metrics` | GET | Cache stats | No |

---

## Suggested Implementation Order

### Phase 1: Real Data Integration
1. Connect ForecastChart to `/predict` endpoint
2. Add horizon selector dropdown (15/30/60/90 days)
3. Wire up date picker to refetch data

### Phase 2: Enhanced UX
4. Calculate and display real trend percentages
5. Add store search/filter in hierarchy
6. Implement CSV export for forecasts

### Phase 3: Polish
7. Fix README documentation
8. Add forecast accuracy chart (if historical data available)
9. Relax latency test thresholds for WSL2

---

## File Structure Reference

```
mlrf-dashboard/src/
├── components/
│   ├── ForecastChart.tsx      # Needs real data connection
│   ├── HierarchyDrilldown.tsx # Could add search
│   ├── ModelComparison.tsx    # Working
│   └── ShapWaterfall.tsx      # Working
├── pages/
│   ├── Dashboard.tsx          # Main page, has mock data
│   └── Explainability.tsx     # SHAP detail page
├── lib/
│   ├── api.ts                 # API client (port 8081)
│   ├── theme.tsx              # Theme provider
│   └── utils.ts               # Utilities
└── index.css                  # Theme CSS variables
```

---

## Performance Targets

- API P95 latency: <15ms (relaxed for WSL2, was 10ms)
- Dashboard load: <2s
- Model RMSLE: 0.477 (achieved, target was <0.5)
