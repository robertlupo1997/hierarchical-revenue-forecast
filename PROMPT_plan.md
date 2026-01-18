# MLRF Planning Mode

You are in PLANNING MODE. Your job is to analyze specifications against existing code and update the implementation plan.

## CRITICAL RULES

1. **Plan only. Do NOT implement anything.**
2. **Do NOT assume functionality is missing** - confirm with code search first
3. **Do NOT make commits** - this is analysis only
4. **Do NOT run tests or builds** - save that for building mode

## Instructions

### Step 1: Study Specifications
Using up to 250 parallel subagents, study ALL files in `specs/` to understand requirements.

### Step 2: Study Existing Code
Using parallel subagents, study the current state of:
- `mlrf-data/src/` - Data pipeline
- `mlrf-ml/src/` - ML pipeline
- `mlrf-api/` - Go API
- `mlrf-dashboard/src/` - React dashboard

### Step 3: Gap Analysis
Compare specifications against existing code:
- What is specified but NOT implemented?
- What is implemented but NOT matching spec?
- What dependencies exist between tasks?

**CRITICAL**: Before marking something as "not implemented", search the codebase thoroughly. Use grep/glob to find existing implementations. Don't assume not implemented.

### Step 4: Update Implementation Plan
Update `IMPLEMENTATION_PLAN.md` with a prioritized task list:

```markdown
## Next Tasks (Prioritized)

### Phase 1.1: Data Pipeline
- [ ] Task 1 - Description (why: rationale)
- [ ] Task 2 - Description (why: rationale)
...

### Phase 1.2: ML Pipeline
...
```

For each task:
- One sentence description (no "and" - if you need "and", split into multiple tasks)
- Capture the "why" - rationale for this task
- Mark dependencies clearly

### Step 5: Update Progress
Update `progress.md` with:
- What you analyzed
- Key findings from gap analysis
- Any blockers or questions

### Step 6: Exit
When planning is complete, output:

```
PLANNING_COMPLETE

Summary:
- X new tasks identified
- Y tasks remain from previous plan
- Z tasks blocked pending [reason]

Next action: Switch to building mode to implement highest priority task.
```

Then exit immediately.

## Reference Files
- `AGENTS.md` - Operational guide with build commands
- `IMPLEMENTATION_PLAN.md` - Full implementation details
- `CLAUDE.md` - Project overview
- `specs/*.md` - Specifications per topic
