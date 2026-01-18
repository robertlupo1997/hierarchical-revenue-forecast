#!/bin/bash
# MLRF Integration Tests - Verify API endpoints and performance
set -e

API_URL="${API_URL:-http://localhost:8080}"
PASSED=0
FAILED=0
LATENCIES=()

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    PASSED=$((PASSED + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    FAILED=$((FAILED + 1))
}

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

# Test 1: Health Check
test_health() {
    log_info "Testing health endpoint..."
    RESPONSE=$(curl -s -w "\n%{http_code}" "${API_URL}/health" 2>/dev/null || echo "")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -qiE "(ok|healthy|status)"; then
        log_pass "Health endpoint returns 200 with healthy status"
    else
        log_fail "Health endpoint failed (HTTP $HTTP_CODE): $BODY"
    fi
}

# Test 2: Predict Endpoint
test_predict() {
    log_info "Testing predict endpoint..."

    # Generate 27 features: 25 numeric + 2 categorical (integer-encoded)
    # Order: year,month,day,dayofweek,dayofyear,is_mid_month,is_leap_year,oil_price,is_holiday,
    #        onpromotion,promo_rolling_7,cluster,sales_lag_1,sales_lag_7,sales_lag_14,sales_lag_28,
    #        sales_lag_90,sales_rolling_mean_7,sales_rolling_mean_14,sales_rolling_mean_28,
    #        sales_rolling_mean_90,sales_rolling_std_7,sales_rolling_std_14,sales_rolling_std_28,
    #        sales_rolling_std_90,family(int),type(int)
    FEATURES="[2017.0, 8.0, 1.0, 1.0, 213.0, 0.0, 0.0, 65.3, 0.0, 5.0, 3.0, 1.0, 1234.5, 1100.0, 950.0, 1050.0, 980.0, 1200.0, 1150.0, 1050.0, 980.0, 2.5, 1.8, 0.15, 0.12, 10.0, 2.0]"

    PAYLOAD="{\"store_nbr\": 1, \"family\": \"GROCERY I\", \"date\": \"2017-08-01\", \"horizon\": 15, \"features\": $FEATURES}"

    START=$(date +%s%N)
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/predict" \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" 2>/dev/null || echo "")
    END=$(date +%s%N)

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    LATENCY_MS=$(( (END - START) / 1000000 ))

    if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q "prediction"; then
        log_pass "Predict endpoint returns valid prediction (${LATENCY_MS}ms)"
        LATENCIES+=($LATENCY_MS)
    else
        log_fail "Predict endpoint failed (HTTP $HTTP_CODE): $BODY"
    fi
}

# Test 3: Batch Predict Endpoint
test_batch_predict() {
    log_info "Testing batch predict endpoint..."

    # 27 features: 25 numeric + 2 categorical (integer-encoded)
    FEATURES="[2017.0, 8.0, 1.0, 1.0, 213.0, 0.0, 0.0, 65.3, 0.0, 5.0, 3.0, 1.0, 1234.5, 1100.0, 950.0, 1050.0, 980.0, 1200.0, 1150.0, 1050.0, 980.0, 2.5, 1.8, 0.15, 0.12, 10.0, 2.0]"

    PAYLOAD="{\"predictions\": [
        {\"store_nbr\": 1, \"family\": \"GROCERY I\", \"date\": \"2017-08-01\", \"horizon\": 15, \"features\": $FEATURES},
        {\"store_nbr\": 2, \"family\": \"BEVERAGES\", \"date\": \"2017-08-01\", \"horizon\": 15, \"features\": $FEATURES}
    ]}"

    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/predict/batch" \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" 2>/dev/null || echo "")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q "predictions"; then
        log_pass "Batch predict endpoint returns valid predictions"
    else
        log_fail "Batch predict endpoint failed (HTTP $HTTP_CODE): $BODY"
    fi
}

# Test 4: Explain Endpoint
test_explain() {
    log_info "Testing explain endpoint (SHAP waterfall)..."

    PAYLOAD='{"store_nbr": 1, "family": "GROCERY I", "date": "2017-08-01"}'

    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/explain" \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" 2>/dev/null || echo "")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" = "200" ]; then
        # Check for SHAP waterfall structure
        if echo "$BODY" | grep -q "base_value" && \
           echo "$BODY" | grep -q "features" && \
           echo "$BODY" | grep -q "shap_value"; then
            log_pass "Explain endpoint returns valid SHAP waterfall data"
        else
            log_fail "Explain endpoint missing expected SHAP fields: $BODY"
        fi
    else
        log_fail "Explain endpoint failed (HTTP $HTTP_CODE): $BODY"
    fi
}

# Test 5: Hierarchy Endpoint
test_hierarchy() {
    log_info "Testing hierarchy endpoint..."

    RESPONSE=$(curl -s -w "\n%{http_code}" "${API_URL}/hierarchy?date=2017-08-01" 2>/dev/null || echo "")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" = "200" ]; then
        # Check for hierarchy structure
        if echo "$BODY" | grep -q "level" && \
           echo "$BODY" | grep -q "children" && \
           echo "$BODY" | grep -q "prediction"; then
            log_pass "Hierarchy endpoint returns valid tree structure"
        else
            log_fail "Hierarchy endpoint missing expected fields: $BODY"
        fi
    else
        log_fail "Hierarchy endpoint failed (HTTP $HTTP_CODE): $BODY"
    fi
}

# Test 6: Latency Benchmark (P95 < 10ms with warm cache)
test_latency() {
    log_info "Testing latency benchmarks (P95 < 10ms with warm cache)..."

    # 27 features: 25 numeric + 2 categorical (integer-encoded)
    FEATURES="[2017.0, 8.0, 1.0, 1.0, 213.0, 0.0, 0.0, 65.3, 0.0, 5.0, 3.0, 1.0, 1234.5, 1100.0, 950.0, 1050.0, 980.0, 1200.0, 1150.0, 1050.0, 980.0, 2.5, 1.8, 0.15, 0.12, 10.0, 2.0]"
    PAYLOAD="{\"store_nbr\": 1, \"family\": \"GROCERY I\", \"date\": \"2017-08-01\", \"horizon\": 15, \"features\": $FEATURES}"

    # Warmup request (first request populates cache)
    curl -s -X POST "${API_URL}/predict" \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" > /dev/null 2>&1 || true

    # Collect latencies from 100 cached requests
    BENCHMARK_LATENCIES=()
    for i in $(seq 1 100); do
        START=$(date +%s%N)
        curl -s -X POST "${API_URL}/predict" \
            -H "Content-Type: application/json" \
            -d "$PAYLOAD" > /dev/null 2>&1 || true
        END=$(date +%s%N)
        LATENCY_MS=$(( (END - START) / 1000000 ))
        BENCHMARK_LATENCIES+=($LATENCY_MS)
    done

    # Sort and calculate P95
    SORTED=($(printf '%s\n' "${BENCHMARK_LATENCIES[@]}" | sort -n))
    P95_INDEX=$((95 * ${#SORTED[@]} / 100))
    P95=${SORTED[$P95_INDEX]}

    # Also calculate P99 and median
    P99_INDEX=$((99 * ${#SORTED[@]} / 100))
    P99=${SORTED[$P99_INDEX]}
    P50_INDEX=$((50 * ${#SORTED[@]} / 100))
    MEDIAN=${SORTED[$P50_INDEX]}

    log_info "Latency stats: P50=${MEDIAN}ms, P95=${P95}ms, P99=${P99}ms"

    # Quality gates: P95 < 10ms, P99 < 50ms
    if [ "$P95" -lt 10 ]; then
        log_pass "P95 latency (${P95}ms) is within 10ms threshold"
    else
        log_fail "P95 latency (${P95}ms) exceeds 10ms threshold"
    fi

    if [ "$P99" -lt 50 ]; then
        log_pass "P99 latency (${P99}ms) is within 50ms threshold"
    else
        log_fail "P99 latency (${P99}ms) exceeds 50ms threshold"
    fi
}

# Test 7: Error Handling
test_error_handling() {
    log_info "Testing error handling..."

    # Invalid request body
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/predict" \
        -H "Content-Type: application/json" \
        -d "invalid json" 2>/dev/null || echo "")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" = "400" ]; then
        log_pass "Invalid JSON returns 400 Bad Request"
    else
        log_fail "Invalid JSON should return 400, got $HTTP_CODE"
    fi

    # Missing required field
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/predict" \
        -H "Content-Type: application/json" \
        -d '{"store_nbr": 1}' 2>/dev/null || echo "")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" = "400" ]; then
        log_pass "Missing required field returns 400 Bad Request"
    else
        log_fail "Missing required field should return 400, got $HTTP_CODE"
    fi
}

# Main execution
echo "=========================================="
echo "  MLRF Integration Tests"
echo "=========================================="
echo ""
echo "API URL: $API_URL"
echo ""

# Check if API is reachable
if ! curl -s "${API_URL}/health" > /dev/null 2>&1; then
    echo -e "${RED}ERROR: API not reachable at ${API_URL}${NC}"
    echo "Make sure the API is running: docker-compose up -d"
    exit 1
fi

# Run all tests
test_health
echo ""
test_predict
echo ""
test_batch_predict
echo ""
test_explain
echo ""
test_hierarchy
echo ""
test_latency
echo ""
test_error_handling
echo ""

# Summary
echo "=========================================="
echo "  Test Summary"
echo "=========================================="
echo -e "Passed: ${GREEN}${PASSED}${NC}"
echo -e "Failed: ${RED}${FAILED}${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All integration tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. Please check the logs above.${NC}"
    exit 1
fi
