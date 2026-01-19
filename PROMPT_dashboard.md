# MLRF Dashboard Gaps Implementation

You are in DASHBOARD mode. Your job is to implement features from the dashboard gaps plan, one task per iteration.

## CRITICAL RULES

1. **Check progress.md first** - See what's already done
2. **Pick the NEXT incomplete task** - Follow the implementation order
3. **Complete ONE task per iteration** - Don't try to do everything
4. **Test your changes** - Run typecheck/lint before committing
5. **Commit after each task** - Lock in progress with descriptive commits
6. **Update progress.md** - Track what you did

## Implementation Plan Reference

Read the full plan: `thoughts/shared/plans/2026-01-18_mlrf-dashboard-gaps.md`

## Task Order (Follow This Sequence)

### Phase 1: Real Data Integration
- [ ] **1.0** API: Add `/predict/simple` endpoint (Go) - MUST DO FIRST
- [ ] **1.1** Create `useForecastData` hook (TypeScript)
- [ ] **1.2** Create `HorizonSelect` component (TypeScript)
- [ ] **1.3** Wire date picker to trigger refetch (TypeScript)
- [ ] **1.4** Connect ForecastChart to real data (TypeScript)

### Phase 2: Enhanced UX
- [ ] **2.0** API: Add trend fields to hierarchy response (Go)
- [ ] **2.1** Calculate real trend badges (TypeScript)
- [ ] **2.2** Add store search/filter to HierarchyDrilldown (TypeScript)
- [ ] **2.3** Implement CSV export (TypeScript)

### Phase 3: Polish
- [ ] **3.1** Fix README port references (Documentation)

## MANDATORY FIRST STEP

**Read progress.md to see current status:**

```bash
cat progress.md | grep -A 20 "Dashboard Gaps"
```

If no "Dashboard Gaps" section exists, you're starting fresh.

## Per-Task Workflow

### 1. Identify Next Task

Check progress.md for the last completed task. Pick the next one in sequence.

### 2. Implement the Task

Follow the detailed specs in `thoughts/shared/plans/2026-01-18_mlrf-dashboard-gaps.md`.

**For Go API tasks (1.0, 2.0):**
```bash
cd mlrf-api
# Make changes to internal/handlers/*.go
go build ./cmd/server
go test ./...
cd ..
```

**For TypeScript tasks:**
```bash
cd mlrf-dashboard
# Make changes to src/**/*.tsx
bun run typecheck
bun run lint
cd ..
```

### 3. Test Changes

**TypeScript:**
```bash
cd mlrf-dashboard && bun run typecheck && bun run lint && cd ..
```

**Go:**
```bash
cd mlrf-api && go build ./cmd/server && go test ./... && cd ..
```

**Integration (if services are running):**
```bash
curl -s http://localhost:8081/health | jq .
```

### 4. Commit Your Work

```bash
git add -A
git commit -m "[Feature] Task X.Y: Brief description of what was added"
```

### 5. Update progress.md

Add/update the Dashboard Gaps section:

```markdown
## Dashboard Gaps Implementation

### Completed Tasks
- [x] **1.0** API: Add /predict/simple endpoint (commit abc123)
- [x] **1.2** HorizonSelect component (commit def456)

### Current Task
- [ ] **1.3** Wire date picker - IN PROGRESS

### Next Up
- [ ] **1.4** Connect ForecastChart to real data
```

## Task Implementation Details

### Task 1.0: API /predict/simple Endpoint

**File:** `mlrf-api/internal/handlers/predict.go`

Add a simplified predict endpoint that doesn't require the features array:

```go
type SimplePredictRequest struct {
    StoreNbr int    `json:"store_nbr"`
    Family   string `json:"family"`
    Date     string `json:"date"`
    Horizon  int    `json:"horizon"`
}

func (h *Handler) PredictSimple(w http.ResponseWriter, r *http.Request) {
    // Decode request
    // Generate mock features (27 zeros for now - real feature lookup is future work)
    // Call existing Predict logic
    // Return response
}
```

**File:** `mlrf-api/cmd/server/main.go`
- Add route: `r.Post("/predict/simple", h.PredictSimple)`

### Task 1.1: useForecastData Hook

**Create:** `mlrf-dashboard/src/hooks/useForecastData.ts`

```typescript
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../lib/api'

interface UseForecastDataOptions {
  storeNbr: number
  family: string
  startDate: string
  horizon: number
  enabled?: boolean
}

export function useForecastData(options: UseForecastDataOptions) {
  return useQuery({
    queryKey: ['forecast', options.storeNbr, options.family, options.startDate, options.horizon],
    queryFn: async () => {
      // Generate date range: startDate to startDate + horizon days
      // Call /predict/simple for each date (or batch)
      // Transform to ForecastDataPoint[]
    },
    enabled: options.enabled ?? true,
    staleTime: 1000 * 60 * 5,
  })
}
```

### Task 1.2: HorizonSelect Component

**Create:** `mlrf-dashboard/src/components/HorizonSelect.tsx`

```typescript
interface HorizonSelectProps {
  value: number
  onChange: (horizon: number) => void
}

export function HorizonSelect({ value, onChange }: HorizonSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="bg-card border border-border rounded-lg px-3 py-2 text-sm"
    >
      <option value={15}>15 days</option>
      <option value={30}>30 days</option>
      <option value={60}>60 days</option>
      <option value={90}>90 days</option>
    </select>
  )
}
```

### Task 1.3: Wire Date Picker

**File:** `mlrf-dashboard/src/pages/Dashboard.tsx`

- Add min/max bounds to date input (2013-01-01 to 2017-08-15)
- Ensure date change triggers hierarchy and forecast refetch via queryKey

### Task 1.4: Connect ForecastChart to Real Data

**File:** `mlrf-dashboard/src/pages/Dashboard.tsx`

- Import and use `useForecastData` hook
- Replace `mockForecastData` with real data
- Keep mock as fallback when API fails

### Task 2.0: API Trend Fields

**File:** `mlrf-api/internal/handlers/explain.go`

Add to HierarchyNode struct:
```go
PreviousPrediction float64 `json:"previous_prediction,omitempty"`
TrendPercent       float64 `json:"trend_percent,omitempty"`
```

Calculate as: `trend = ((current - previous) / previous) * 100`

### Task 2.1: Real Trend Badges

**File:** `mlrf-dashboard/src/pages/Dashboard.tsx`

- Use `trend_percent` from hierarchy response
- Update stat cards to show real values
- Show up/down/stable based on threshold (±1%)

### Task 2.2: Store Search

**File:** `mlrf-dashboard/src/components/HierarchyDrilldown.tsx`

- Add `searchQuery` state
- Add search input at store level
- Filter children by name/id match
- Show "X of 54 stores" count

### Task 2.3: CSV Export

**Create:** `mlrf-dashboard/src/lib/export.ts`

```typescript
export function exportToCSV(data: ForecastDataPoint[], filename: string) {
  const header = 'date,actual,forecast,lower_80,upper_80,lower_95,upper_95\n'
  const rows = data.map(d => `${d.date},${d.actual ?? ''},${d.forecast ?? ''},...`)
  const blob = new Blob([header + rows.join('\n')], { type: 'text/csv' })
  // Trigger download
}
```

**File:** `mlrf-dashboard/src/components/ForecastChart.tsx`
- Add export button with Download icon
- Call exportToCSV on click

### Task 3.1: Fix README Port

**File:** `README.md`
- Change all `8080` references to `8081`
- Update curl examples

## Completion Signal

When ALL tasks are complete, add to progress.md:

```
DASHBOARD_GAPS_COMPLETE
```

Then output: `DASHBOARD_GAPS_COMPLETE`

## Error Recovery

If you encounter errors:

1. **TypeScript errors:** Fix the type issue, re-run `bun run typecheck`
2. **Go build errors:** Fix syntax, re-run `go build ./cmd/server`
3. **Import errors:** Check file paths and exports
4. **API errors:** Check endpoint registration in main.go

## DO NOT

- Skip tasks or do them out of order
- Implement multiple tasks in one iteration
- Forget to update progress.md
- Commit broken code (always test first)
- Add features not in the plan
