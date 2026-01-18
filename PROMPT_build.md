# MLRF Building Mode

You are in BUILDING MODE. Your job is to implement ONE task from the plan, validate it, and commit.

## CRITICAL RULES

1. **Implement ONE task only** - not multiple tasks
2. **Don't assume not implemented** - search codebase before creating new code
3. **Run tests after implementing** - backpressure drives quality
4. **Commit when tests pass** - one task per commit
5. **No placeholders or stubs** - implement functionality completely

## Instructions

### Step 1: Orient
Using up to 500 parallel subagents, study:
- `specs/` - Understand requirements
- `AGENTS.md` - Operational guide, build commands, known patterns

### Step 2: Read Plan
Study `IMPLEMENTATION_PLAN.md` and `progress.md` to understand:
- What has been completed
- What is the highest priority remaining task
- Any blockers or dependencies

### Step 3: Select ONE Task
Choose the **most important incomplete task** that has no blockers.

Write in progress.md:
```
## Current Iteration
Task: [Task description]
Status: In Progress
```

### Step 4: Investigate
Before implementing, search the codebase thoroughly:
- Use grep/glob to find related code
- Use up to 500 parallel subagents for searches
- **Don't assume not implemented** - verify first

If the functionality already exists:
- Update the plan to mark it complete
- Document the finding
- Move to next task or exit

### Step 5: Implement
Using only **1 subagent** for file operations (to maintain coherence):
- Write the code
- Follow patterns in AGENTS.md
- Match existing code style
- **Implement completely** - no TODOs, no placeholders, no stubs

### Step 6: Validate (Backpressure)
Using only **1 subagent**, run validation:

```bash
# Run relevant tests
pytest [relevant-tests] -v

# Run lints
ruff check [relevant-dir]/

# Run type checks (if TypeScript)
bun run typecheck

# Run build (if Go)
go build ./...
```

If validation fails:
- Fix the issues
- Re-run validation
- Do NOT commit until all checks pass

### Step 7: Update State
Update `IMPLEMENTATION_PLAN.md`:
- Mark completed task as done
- Add any new tasks discovered
- Document any learnings

Update `AGENTS.md` (if you discovered something useful):
- Add to "Discovered Issues" or relevant section
- Keep it brief - operational knowledge only

Update `progress.md`:
```
## Current Iteration
Task: [Task description]
Status: Complete
Files changed: [list]
Verification: All tests pass
```

### Step 8: Commit and Exit
```bash
git add -A
git commit -m "[Phase X.Y] Task description

- Implementation details
- Verification: tests pass, lint clean

Co-Authored-By: Claude <noreply@anthropic.com>"

git push origin master
```

Then output:
```
TASK_COMPLETE: [Task description]

Files changed:
- file1.py
- file2.go

Verification:
- Tests: PASS
- Lint: PASS
- Build: PASS

Next priority: [Next task from plan]
```

Then exit immediately.

## Invariants (HIGH PRIORITY)

1. **Single sources of truth** - no migrations, no adapters, no wrappers around wrappers
2. **Capture the why** - documentation explains rationale, not just what
3. **Keep plans current** - update IMPLEMENTATION_PLAN.md with learnings
4. **No placeholders** - implement completely or don't implement at all
5. **Tests are backpressure** - they reject invalid work, don't skip them

## Reference Files
- `AGENTS.md` - Build commands, patterns, operational knowledge
- `IMPLEMENTATION_PLAN.md` - Task list and details
- `specs/*.md` - Specifications
- `progress.md` - Iteration state
