# ADR-003: visx for Custom SHAP Waterfall Visualization

## Status

Accepted

## Date

2026-01-15

## Context

The MLRF dashboard requires SHAP (SHapley Additive exPlanations) visualizations to explain model predictions. The primary visualization is a **waterfall chart** showing how individual features contribute to moving the prediction from the base value to the final prediction.

### Requirements

1. **Waterfall chart**: Display cumulative feature contributions with connecting lines (the
   connecting lines were never implemented; see Consequences)
2. **Interactive tooltips**: Show feature name, value, and SHAP contribution on hover
3. **Theme awareness**: Support light/dark mode with CSS variable integration
4. **Responsive sizing**: Adapt to container width and mobile screens
5. **Sorted features**: Top contributing features should be prominent

### Options Considered

1. **shap.js (official SHAP JavaScript library)**
   - Pros: Official library, familiar API
   - Cons: **No waterfall chart support**, only force plots and summary plots

2. **Recharts**
   - Pros: Simple declarative API, React-native
   - Cons: No built-in waterfall chart, bar chart workarounds are hacky

3. **D3.js**
   - Pros: Complete control, any visualization possible
   - Cons: Imperative API, significant boilerplate, manual React integration

4. **visx (Airbnb)**
   - Pros: D3 power with React primitives, excellent TypeScript support, composable
   - Cons: Lower-level than Recharts, requires more code

## Decision

We chose **visx** to implement a custom SHAP waterfall chart.

### Key factors

1. **Full control over waterfall rendering**: visx provides primitive components (`Bar`, `Group`, `Scale`) that allow precise positioning of waterfall bars with cumulative starts/ends.

2. **React-first architecture**: visx components are pure React, enabling proper state management, hooks integration, and React DevTools debugging.

3. **TypeScript-native**: Comprehensive type definitions ensure compile-time safety for chart data structures.

4. **CSS variable integration**: visx components accept any CSS color value, enabling seamless theme switching via CSS custom properties:

```typescript
const colors = {
  positive: 'hsl(var(--destructive))',  // Theme-aware red
  negative: 'hsl(var(--accent))',       // Theme-aware cyan
  base: 'hsl(var(--muted-foreground))',
};
```

5. **Tooltip system**: Built-in `useTooltip` hook provides positioning, portal rendering, and mouse tracking out of the box.

### Implementation Overview

```typescript
// Transform SHAP features to waterfall chart data
const chartData = useMemo(() => {
  const data: ChartDataItem[] = [];

  // Base value bar
  data.push({ name: 'Base Value', start: 0, end: baseValue, ... });

  // Cumulative feature contributions
  let cumulative = baseValue;
  for (const feature of sortedFeatures) {
    data.push({
      name: feature.name,
      start: cumulative,
      end: cumulative + feature.shap_value,
      direction: feature.shap_value >= 0 ? 'positive' : 'negative',
    });
    cumulative += feature.shap_value;
  }

  // Final prediction bar
  data.push({ name: 'Prediction', start: 0, end: prediction, ... });

  return data;
}, [baseValue, features, prediction]);
```

## Consequences

### Positive

- **Full control over rendering**: bar positioning and labels are defined directly by the component.
  Note that connecting lines between adjacent cumulative bars are **not** implemented; the chart
  renders bars, a zero reference line, and axes.
- **Theme-aware**: light/dark mode via CSS variables, no JS theme switching needed
- **Testable**: React Testing Library can query chart elements

### Negative

- **More initial code**: the component is about 300 lines of typed React
- **Maintenance burden**: bug fixes and enhancements are our responsibility
- **Learning curve**: team must understand visx primitives and D3 scale concepts
- **Not keyboard accessible**: the interactive bars have only mouse-enter and mouse-leave handlers.
  They carry no roles, ARIA labels, `tabIndex`, or keyboard handlers, so the chart is usable with a
  pointer only. This is a known gap, not a resolved concern.

### Mitigations

- Documented chart data transformation logic with inline comments
- visx has an active community and Airbnb maintenance

Scale setup is defined inline in `ShapWaterfall`; no reusable chart-scale utility was extracted.

## Alternatives Reconsidered

If shap.js adds waterfall support in the future, its data structures look compatible with ours, but
no migration prototype or compatibility test has been attempted, so the effort is unknown.

## References

- [visx Documentation](https://airbnb.io/visx/)
- [SHAP Waterfall Plots Explained](https://shap.readthedocs.io/en/latest/example_notebooks/api_examples/plots/waterfall.html)
- [shap.js GitHub (lacks waterfall)](https://github.com/slundberg/shap.js)
