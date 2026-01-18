#!/bin/bash
# Ralph Wiggum Loop for MLRF
# Usage: ./loop.sh [max_iterations]
#
# This runs Claude in a loop, feeding PROMPT.md each iteration.
# State persists through files (git, progress.md).
# Each iteration starts with fresh context.

MAX_ITERATIONS=${1:-50}
ITERATION=0

echo "Starting Ralph loop (max $MAX_ITERATIONS iterations)"
echo "Press Ctrl+C to stop"
echo ""

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
    ITERATION=$((ITERATION + 1))
    echo "=== Iteration $ITERATION of $MAX_ITERATIONS ==="
    echo ""

    # Feed prompt to Claude
    # Using 'claude' CLI - adjust if your command is different
    cat PROMPT.md | claude

    EXIT_CODE=$?

    # Check if Claude indicated completion
    if grep -q "PHASE_1_1_COMPLETE" progress.md 2>/dev/null; then
        echo ""
        echo "=== Phase 1.1 Complete! ==="
        echo "Update PROMPT.md for Phase 1.2 and restart loop."
        exit 0
    fi

    if grep -q "PHASE_1_2_COMPLETE" progress.md 2>/dev/null; then
        echo ""
        echo "=== Phase 1.2 Complete! ==="
        echo "Update PROMPT.md for Phase 1.3 and restart loop."
        exit 0
    fi

    if grep -q "ALL_PHASES_COMPLETE" progress.md 2>/dev/null; then
        echo ""
        echo "=== All Phases Complete! ==="
        exit 0
    fi

    echo ""
    echo "Iteration $ITERATION complete. Sleeping 2s before next..."
    sleep 2
done

echo ""
echo "=== Max iterations reached ($MAX_ITERATIONS) ==="
echo "Check progress.md for current status."
