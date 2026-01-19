#!/bin/bash
# Ralph Wiggum Loop for MLRF
# Based on Geoffrey Huntley's methodology: https://github.com/ghuntley/how-to-ralph-wiggum
#
# Usage:
#   ./loop.sh plan [max_iterations]    # Planning mode - analyze specs, update plan
#   ./loop.sh build [max_iterations]   # Building mode - implement one task per iteration
#
# Each iteration spawns a FRESH Claude process (no context accumulation).
# State persists through files: IMPLEMENTATION_PLAN.md, progress.md, git history.

set -e

MODE=${1:-build}
MAX_ITERATIONS=${2:-50}
ITERATION=0

# Validate mode
if [[ "$MODE" != "plan" && "$MODE" != "build" && "$MODE" != "fix" && "$MODE" != "redesign" && "$MODE" != "dashboard" && "$MODE" != "nextsteps" && "$MODE" != "production" ]]; then
    echo "Usage: ./loop.sh [plan|build|fix|redesign|dashboard|nextsteps|production] [max_iterations]"
    echo ""
    echo "Modes:"
    echo "  plan       - Analyze specs vs code, update IMPLEMENTATION_PLAN.md (no implementation)"
    echo "  build      - Implement one task per iteration, run tests, commit"
    echo "  fix        - Run pipeline, diagnose and fix errors until success"
    echo "  redesign   - Redesign frontend UI with polished, professional look"
    echo "  dashboard  - Implement dashboard feature gaps (real data, horizon selector, etc.)"
    echo "  nextsteps  - Implement next steps (CI/CD, feature store, tests, export formats)"
    echo "  production - Production readiness (security, observability, testing, UX, docs)"
    exit 1
fi

# Select prompt file
if [[ "$MODE" == "plan" ]]; then
    PROMPT_FILE="PROMPT_plan.md"
elif [[ "$MODE" == "fix" ]]; then
    PROMPT_FILE="PROMPT_fix.md"
elif [[ "$MODE" == "redesign" ]]; then
    PROMPT_FILE="PROMPT_redesign.md"
elif [[ "$MODE" == "dashboard" ]]; then
    PROMPT_FILE="PROMPT_dashboard.md"
elif [[ "$MODE" == "nextsteps" ]]; then
    PROMPT_FILE="PROMPT_nextsteps.md"
elif [[ "$MODE" == "production" ]]; then
    PROMPT_FILE="PROMPT_production.md"
else
    PROMPT_FILE="PROMPT_build.md"
fi

# Verify prompt file exists
if [[ ! -f "$PROMPT_FILE" ]]; then
    echo "Error: $PROMPT_FILE not found"
    exit 1
fi

echo "========================================"
echo "  Ralph Wiggum Loop - MLRF"
echo "========================================"
echo "Mode: $MODE"
echo "Prompt: $PROMPT_FILE"
echo "Max iterations: $MAX_ITERATIONS"
echo "Press Ctrl+C to stop"
echo "========================================"
echo ""

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
    ITERATION=$((ITERATION + 1))
    echo ""
    echo "=== Iteration $ITERATION of $MAX_ITERATIONS ($MODE mode) ==="
    echo "Started: $(date)"
    echo ""

    # Feed prompt to Claude with fresh context each time
    # --dangerously-skip-permissions: Required for autonomous operation
    # Pass prompt as argument (piping can cause "No messages returned" error)
    PROMPT_CONTENT=$(cat "$PROMPT_FILE")
    claude --dangerously-skip-permissions -p "$PROMPT_CONTENT"

    EXIT_CODE=$?

    echo ""
    echo "Finished: $(date)"
    echo "Exit code: $EXIT_CODE"

    # Check for completion signals in progress.md
    if grep -q "PLANNING_COMPLETE" progress.md 2>/dev/null && [[ "$MODE" == "plan" ]]; then
        echo ""
        echo "=== Planning Complete ==="
        echo "Review IMPLEMENTATION_PLAN.md, then run: ./loop.sh build"
        exit 0
    fi

    if grep -q "ALL_PHASES_COMPLETE" progress.md 2>/dev/null; then
        echo ""
        echo "=== ALL PHASES COMPLETE ==="
        echo "Project implementation finished!"
        exit 0
    fi

    if grep -q "PHASE_1_5_COMPLETE" progress.md 2>/dev/null; then
        echo ""
        echo "=== Phase 1.5 Complete - Integration Done ==="
        exit 0
    fi

    if grep -q "PIPELINE_COMPLETE" progress.md 2>/dev/null && [[ "$MODE" == "fix" ]]; then
        echo ""
        echo "=== Pipeline Complete - All Issues Fixed ==="
        exit 0
    fi

    if grep -q "REDESIGN_COMPLETE" progress.md 2>/dev/null && [[ "$MODE" == "redesign" ]]; then
        echo ""
        echo "=== Redesign Complete - UI Polished ==="
        exit 0
    fi

    if grep -q "DASHBOARD_GAPS_COMPLETE" progress.md 2>/dev/null && [[ "$MODE" == "dashboard" ]]; then
        echo ""
        echo "=== Dashboard Gaps Complete - All Features Implemented ==="
        exit 0
    fi

    if grep -q "NEXTSTEPS_COMPLETE" progress.md 2>/dev/null && [[ "$MODE" == "nextsteps" ]]; then
        echo ""
        echo "=== Next Steps Complete - All Enhancements Implemented ==="
        exit 0
    fi

    if grep -q "PRODUCTION_COMPLETE" progress.md 2>/dev/null && [[ "$MODE" == "production" ]]; then
        echo ""
        echo "=== Production Readiness Complete - All Tasks Implemented ==="
        exit 0
    fi

    # Brief pause between iterations
    echo ""
    echo "Sleeping 3s before next iteration..."
    sleep 3
done

echo ""
echo "=== Max iterations reached ($MAX_ITERATIONS) ==="
echo "Check progress.md for current status."
echo "Run again to continue: ./loop.sh $MODE $MAX_ITERATIONS"
