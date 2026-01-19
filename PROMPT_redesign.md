# MLRF Frontend Redesign Mode

You are in REDESIGN MODE. Your job is to transform the basic dashboard into a polished, production-grade UI.

## CRITICAL RULES

1. **Use the frontend-design skill** - Invoke it for all UI work
2. **Preserve functionality** - All existing features must still work
3. **One component at a time** - Redesign incrementally
4. **Test after each change** - Run `bun run build` to verify
5. **Commit working changes** - Lock in progress

## Current Dashboard State

The dashboard is functional but basic:
- Generic Tailwind CSS (gray/blue)
- ~1,500 lines across 8 components
- Works with mock data when API unavailable
- Components: ShapWaterfall, HierarchyDrilldown, ModelComparison, ForecastChart

## Design Goals

Transform into a **distinctive, polished UI** with:

1. **Modern dark/light theme** - Professional color palette, not generic
2. **Smooth animations** - Transitions, hover effects, loading states
3. **Better data visualization** - Enhanced charts with visx
4. **Responsive design** - Works on mobile and desktop
5. **Micro-interactions** - Feedback on clicks, selections
6. **Professional typography** - Hierarchy, spacing, readability

## Instructions

### Step 1: Invoke Frontend Design Skill

Use the Skill tool to invoke `frontend-design` for each component redesign.

### Step 2: Redesign Priority Order

1. **Layout & Theme** - App.tsx, global styles, color system
2. **Dashboard page** - Main layout, cards, spacing
3. **ForecastChart** - Enhanced visx visualization
4. **ShapWaterfall** - Better SHAP visualization
5. **HierarchyDrilldown** - Tree navigation UX
6. **ModelComparison** - Comparison cards/table

### Step 3: For Each Component

```
1. Read the current component code
2. Invoke frontend-design skill with specific requirements
3. Replace the component with the redesigned version
4. Run: cd mlrf-dashboard && bun run build
5. If build passes, commit
6. Move to next component
```

### Step 4: Verify

After all components:
```bash
cd mlrf-dashboard
bun run typecheck
bun run lint
bun run build
```

### Step 5: Update Progress

Write to progress.md:
```
## Current Iteration
Task: Redesign [component name]
Status: Complete
Changes: [what was improved]
Verification: Build PASS
```

### Step 6: Completion

When all components are redesigned:
- Add `REDESIGN_COMPLETE` to progress.md
- Commit all changes

## Design Specifications

### Color Palette (Dark Theme)
- Background: slate-900, slate-800
- Cards: slate-800/50 with subtle borders
- Accent: emerald-500 (positive), rose-500 (negative)
- Text: slate-100, slate-400

### Color Palette (Light Theme)
- Background: slate-50, white
- Cards: white with shadow-sm
- Accent: emerald-600, rose-600
- Text: slate-900, slate-600

### Typography
- Headings: font-semibold, tracking-tight
- Body: font-normal, leading-relaxed
- Numbers: font-mono for data

### Spacing
- Cards: p-6, gap-6
- Sections: py-8
- Consistent 4px grid (Tailwind spacing scale)

### Animations
- Transitions: duration-200, ease-out
- Hover: scale-[1.02], shadow-lg
- Loading: pulse or skeleton

## Success Criteria

Redesign is complete when:
1. All components have been redesigned
2. Dark/light theme toggle works
3. All builds pass (typecheck, lint, build)
4. Dashboard looks professional and distinctive
5. `REDESIGN_COMPLETE` is in progress.md
