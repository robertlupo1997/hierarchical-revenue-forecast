# Spec: React Dashboard

## Job To Be Done
As an FP&A analyst, I need an interactive dashboard to explore forecasts across the hierarchy and understand model explanations.

## Requirements

### Components

#### SHAP Waterfall Chart
- Custom visx implementation (shapjs lacks waterfall support)
- Base value bar (gray)
- Positive contributions (red bars, right)
- Negative contributions (blue bars, left)
- Final prediction bar (green)
- Tooltip on hover with feature value and SHAP value

#### Hierarchy Drilldown
- Breadcrumb navigation: Total → Store → Family → Bottom
- Grid of cards at each level
- Click to drill down
- Prediction displayed per node
- Level indicator badge (Total/Store/Family/Bottom)

#### Model Comparison
- Horizontal bar chart comparing models
- Metrics: RMSLE, MAPE, RMSE (selectable)
- Sorted by selected metric
- Best model highlighted in green

#### Forecast Chart
- Time series line chart
- Historical data + forecast
- Confidence intervals (80%, 95%)
- Date range selector

### Pages
- `/` - Dashboard with all components
- `/explain/:store/:family` - Detailed SHAP analysis

### API Integration
- React Query for data fetching
- Caching and deduplication
- Loading states
- Error handling

## Constraints
- Bun for package management
- Vite for bundling
- TypeScript strict mode
- Tailwind CSS for styling
- shadcn/ui for UI components
- visx for data visualization (not recharts for waterfall)
- Bundle size < 500KB gzipped

## Verification
- TypeScript compiles without errors
- Lint passes
- Build succeeds
- Dev server responds
- Components render correctly
