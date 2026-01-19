/**
 * MLRF API Load Tests (k6)
 *
 * This script tests the MLRF API under load to verify performance requirements:
 * - P95 latency < 100ms
 * - P99 latency < 200ms
 * - Error rate < 1%
 * - Sustained 100+ RPS
 *
 * Run with: k6 run predict.js
 * Run with options: k6 run --vus 50 --duration 1m predict.js
 * Run with API key: API_KEY=your-key k6 run predict.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const cacheHitRate = new Rate('cache_hits');
const predictLatency = new Trend('predict_latency', true);
const batchLatency = new Trend('batch_latency', true);
const hierarchyLatency = new Trend('hierarchy_latency', true);

// Configuration
const BASE_URL = __ENV.API_URL || 'http://localhost:8081';
const API_KEY = __ENV.API_KEY || '';

// Valid product families for the MLRF dataset
const FAMILIES = [
    'AUTOMOTIVE', 'BABY CARE', 'BEAUTY', 'BEVERAGES', 'BOOKS',
    'BREAD/BAKERY', 'CELEBRATION', 'CLEANING', 'DAIRY', 'DELI',
    'EGGS', 'FROZEN FOODS', 'GROCERY I', 'GROCERY II', 'HARDWARE',
    'HOME AND KITCHEN I', 'HOME AND KITCHEN II', 'HOME APPLIANCES',
    'HOME CARE', 'LADIESWEAR', 'LAWN AND GARDEN', 'LINGERIE',
    'LIQUOR,WINE,BEER', 'MAGAZINES', 'MEATS', 'PERSONAL CARE',
    'PET SUPPLIES', 'PLAYERS AND ELECTRONICS', 'POULTRY',
    'PREPARED FOODS', 'PRODUCE', 'SCHOOL AND OFFICE SUPPLIES', 'SEAFOOD'
];

// Valid horizons
const HORIZONS = [15, 30, 60, 90];

// Valid test dates (within dataset range: 2013-01-01 to 2017-08-15)
const TEST_DATES = [
    '2017-01-01', '2017-02-15', '2017-03-01', '2017-04-15',
    '2017-05-01', '2017-06-15', '2017-07-01', '2017-08-01'
];

// Load test scenarios
export const options = {
    scenarios: {
        // Scenario 1: Steady ramp-up to 100 concurrent users
        steady_load: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 25 },   // Ramp to 25 users
                { duration: '30s', target: 50 },   // Ramp to 50 users
                { duration: '1m', target: 100 },   // Ramp to 100 users
                { duration: '2m', target: 100 },   // Stay at 100 users
                { duration: '30s', target: 0 },    // Ramp down
            ],
            gracefulStop: '30s',
        },

        // Scenario 2: Spike test - sudden burst of traffic
        spike_test: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '10s', target: 10 },   // Baseline
                { duration: '5s', target: 200 },   // Spike!
                { duration: '30s', target: 200 },  // Hold spike
                { duration: '10s', target: 10 },   // Back to baseline
                { duration: '20s', target: 0 },    // Ramp down
            ],
            startTime: '5m',  // Start after steady load completes
            gracefulStop: '30s',
        },
    },

    // Performance thresholds
    thresholds: {
        // HTTP request duration thresholds
        http_req_duration: [
            'p(95)<100',    // 95% of requests under 100ms
            'p(99)<200',    // 99% of requests under 200ms
            'avg<50',       // Average under 50ms
        ],

        // Error rate thresholds
        http_req_failed: ['rate<0.01'],  // Less than 1% errors
        errors: ['rate<0.01'],            // Custom error rate

        // Endpoint-specific thresholds
        'predict_latency': ['p(95)<100', 'p(99)<200'],
        'batch_latency': ['p(95)<500', 'p(99)<1000'],
        'hierarchy_latency': ['p(95)<200', 'p(99)<500'],
    },
};

// Helper: Get common headers
function getHeaders() {
    const headers = {
        'Content-Type': 'application/json',
    };
    if (API_KEY) {
        headers['X-API-Key'] = API_KEY;
    }
    return headers;
}

// Helper: Get random element from array
function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// Helper: Get random store number (1-54)
function randomStore() {
    return Math.floor(Math.random() * 54) + 1;
}

// Main test function
export default function() {
    const headers = getHeaders();

    group('Single Prediction', function() {
        const payload = JSON.stringify({
            store_nbr: randomStore(),
            family: randomElement(FAMILIES),
            date: randomElement(TEST_DATES),
            horizon: randomElement(HORIZONS),
        });

        const startTime = Date.now();
        const res = http.post(`${BASE_URL}/predict/simple`, payload, { headers });
        const duration = Date.now() - startTime;

        predictLatency.add(duration);

        const success = check(res, {
            'predict: status is 200': (r) => r.status === 200,
            'predict: has prediction': (r) => {
                try {
                    const body = JSON.parse(r.body);
                    return body.prediction !== undefined;
                } catch (e) {
                    return false;
                }
            },
            'predict: latency < 100ms': (r) => r.timings.duration < 100,
        });

        if (!success) {
            errorRate.add(1);
        } else {
            errorRate.add(0);

            // Check for cache hit indicator (if available in response headers)
            if (res.headers['X-Cache'] === 'HIT') {
                cacheHitRate.add(1);
            } else {
                cacheHitRate.add(0);
            }
        }

        sleep(0.1);  // 100ms between requests per VU
    });

    // Every 10th iteration, test batch endpoint
    if (__ITER % 10 === 0) {
        group('Batch Prediction', function() {
            const predictions = [];
            const batchSize = Math.floor(Math.random() * 10) + 5;  // 5-15 predictions

            for (let i = 0; i < batchSize; i++) {
                predictions.push({
                    store_nbr: randomStore(),
                    family: randomElement(FAMILIES),
                    date: randomElement(TEST_DATES),
                    horizon: randomElement(HORIZONS),
                    features: new Array(27).fill(0),  // Zero features for testing
                });
            }

            const payload = JSON.stringify({ predictions });

            const startTime = Date.now();
            const res = http.post(`${BASE_URL}/predict/batch`, payload, { headers });
            const duration = Date.now() - startTime;

            batchLatency.add(duration);

            const success = check(res, {
                'batch: status is 200': (r) => r.status === 200,
                'batch: has results': (r) => {
                    try {
                        const body = JSON.parse(r.body);
                        return body.results && body.results.length > 0;
                    } catch (e) {
                        return false;
                    }
                },
                'batch: latency < 500ms': (r) => r.timings.duration < 500,
            });

            if (!success) {
                errorRate.add(1);
            } else {
                errorRate.add(0);
            }

            sleep(0.2);
        });
    }

    // Every 20th iteration, test hierarchy endpoint
    if (__ITER % 20 === 0) {
        group('Hierarchy', function() {
            const startTime = Date.now();
            const res = http.get(`${BASE_URL}/hierarchy`, { headers });
            const duration = Date.now() - startTime;

            hierarchyLatency.add(duration);

            const success = check(res, {
                'hierarchy: status is 200': (r) => r.status === 200,
                'hierarchy: has level': (r) => {
                    try {
                        const body = JSON.parse(r.body);
                        return body.level !== undefined;
                    } catch (e) {
                        return false;
                    }
                },
                'hierarchy: latency < 200ms': (r) => r.timings.duration < 200,
            });

            if (!success) {
                errorRate.add(1);
            } else {
                errorRate.add(0);
            }

            sleep(0.1);
        });
    }
}

// Setup function - runs once before tests
export function setup() {
    console.log(`Testing MLRF API at: ${BASE_URL}`);
    console.log(`API Key configured: ${API_KEY ? 'Yes' : 'No'}`);

    // Verify API is reachable
    const healthRes = http.get(`${BASE_URL}/health`);
    if (healthRes.status !== 200) {
        throw new Error(`API health check failed: ${healthRes.status}`);
    }

    console.log('API health check passed, starting load test...');

    return {
        baseUrl: BASE_URL,
        startTime: Date.now(),
    };
}

// Teardown function - runs once after tests
export function teardown(data) {
    const duration = (Date.now() - data.startTime) / 1000;
    console.log(`Load test completed in ${duration.toFixed(1)} seconds`);
}

// Handle summary output
export function handleSummary(data) {
    return {
        'stdout': textSummary(data, { indent: '  ', enableColors: true }),
        'summary.json': JSON.stringify(data, null, 2),
    };
}

// Custom text summary function
function textSummary(data, opts) {
    const lines = [];

    lines.push('\n==============================');
    lines.push('  MLRF API Load Test Summary');
    lines.push('==============================\n');

    // Threshold results
    lines.push('Thresholds:');
    for (const [name, threshold] of Object.entries(data.thresholds || {})) {
        const status = threshold.ok ? '\x1b[32m PASS\x1b[0m' : '\x1b[31m FAIL\x1b[0m';
        lines.push(`  ${name}: ${status}`);
    }

    lines.push('\nKey Metrics:');

    // HTTP duration
    const httpDuration = data.metrics.http_req_duration;
    if (httpDuration) {
        lines.push(`  Request Duration:`);
        lines.push(`    avg: ${httpDuration.values.avg?.toFixed(2) || 'N/A'}ms`);
        lines.push(`    p95: ${httpDuration.values['p(95)']?.toFixed(2) || 'N/A'}ms`);
        lines.push(`    p99: ${httpDuration.values['p(99)']?.toFixed(2) || 'N/A'}ms`);
    }

    // Total requests
    const httpReqs = data.metrics.http_reqs;
    if (httpReqs) {
        lines.push(`  Total Requests: ${httpReqs.values.count}`);
        lines.push(`  Requests/sec: ${httpReqs.values.rate?.toFixed(2)}`);
    }

    // Error rate
    const errors = data.metrics.errors;
    if (errors) {
        const rate = (errors.values.rate * 100).toFixed(2);
        lines.push(`  Error Rate: ${rate}%`);
    }

    lines.push('\n');
    return lines.join('\n');
}
