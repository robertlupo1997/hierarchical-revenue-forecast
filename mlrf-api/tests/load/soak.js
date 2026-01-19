/**
 * MLRF API Soak Test (k6)
 *
 * Tests API stability over extended period.
 * Looks for memory leaks, connection issues, gradual degradation.
 *
 * Run with: k6 run soak.js
 * Or shorter: k6 run --duration 10m soak.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const errorRate = new Rate('errors');
const latencyTrend = new Trend('latency_over_time', true);
const memoryGrowth = new Counter('potential_memory_issues');

const BASE_URL = __ENV.API_URL || 'http://localhost:8081';
const API_KEY = __ENV.API_KEY || '';

// Valid product families
const FAMILIES = [
    'AUTOMOTIVE', 'BABY CARE', 'BEAUTY', 'BEVERAGES', 'BREAD/BAKERY',
    'CLEANING', 'DAIRY', 'DELI', 'EGGS', 'FROZEN FOODS',
    'GROCERY I', 'GROCERY II', 'HOME CARE', 'MEATS', 'PRODUCE'
];

export const options = {
    // Constant load for extended period
    executor: 'constant-vus',
    vus: 50,                        // Moderate constant load
    duration: __ENV.DURATION || '30m',  // Default 30 minutes

    thresholds: {
        http_req_failed: ['rate<0.005'],  // Very low error rate for soak
        http_req_duration: [
            'p(95)<100',
            'p(99)<200',
            'avg<50',
        ],
        errors: ['rate<0.005'],
        // Alert if latency degrades significantly over time
        'latency_over_time': ['p(95)<150'],
    },
};

function getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (API_KEY) headers['X-API-Key'] = API_KEY;
    return headers;
}

// Baseline latency captured in setup
let baselineP95 = 0;

export default function() {
    // Mix of different request types to simulate real usage
    const requestType = Math.random();

    if (requestType < 0.7) {
        // 70% single predictions
        testSinglePredict();
    } else if (requestType < 0.9) {
        // 20% batch predictions
        testBatchPredict();
    } else {
        // 10% hierarchy requests
        testHierarchy();
    }

    sleep(0.2);  // Moderate pace for sustained load
}

function testSinglePredict() {
    const payload = JSON.stringify({
        store_nbr: Math.floor(Math.random() * 54) + 1,
        family: FAMILIES[Math.floor(Math.random() * FAMILIES.length)],
        date: '2017-08-01',
        horizon: [15, 30, 60, 90][Math.floor(Math.random() * 4)],
    });

    const res = http.post(`${BASE_URL}/predict/simple`, payload, {
        headers: getHeaders(),
    });

    latencyTrend.add(res.timings.duration);

    const success = check(res, {
        'predict: status 200': (r) => r.status === 200,
    });

    if (!success) {
        errorRate.add(1);
    } else {
        errorRate.add(0);
    }

    // Check for latency degradation
    if (baselineP95 > 0 && res.timings.duration > baselineP95 * 3) {
        memoryGrowth.add(1);  // Potential memory issue indicator
    }
}

function testBatchPredict() {
    const predictions = [];
    for (let i = 0; i < 5; i++) {
        predictions.push({
            store_nbr: Math.floor(Math.random() * 54) + 1,
            family: 'GROCERY I',
            date: '2017-08-01',
            horizon: 90,
            features: new Array(27).fill(0),
        });
    }

    const res = http.post(`${BASE_URL}/predict/batch`, JSON.stringify({ predictions }), {
        headers: getHeaders(),
    });

    latencyTrend.add(res.timings.duration);

    const success = check(res, {
        'batch: status 200': (r) => r.status === 200,
    });

    if (!success) errorRate.add(1);
    else errorRate.add(0);
}

function testHierarchy() {
    const res = http.get(`${BASE_URL}/hierarchy`, {
        headers: getHeaders(),
    });

    latencyTrend.add(res.timings.duration);

    const success = check(res, {
        'hierarchy: status 200': (r) => r.status === 200,
    });

    if (!success) errorRate.add(1);
    else errorRate.add(0);
}

export function setup() {
    console.log(`Starting soak test: ${options.duration}`);
    console.log(`VUs: ${options.vus}`);

    // Health check
    const healthRes = http.get(`${BASE_URL}/health`);
    if (healthRes.status !== 200) {
        throw new Error('API not healthy');
    }

    // Capture baseline latency
    const baselineRuns = [];
    for (let i = 0; i < 10; i++) {
        const res = http.post(`${BASE_URL}/predict/simple`, JSON.stringify({
            store_nbr: 1,
            family: 'GROCERY I',
            date: '2017-08-01',
            horizon: 90,
        }), { headers: getHeaders() });
        baselineRuns.push(res.timings.duration);
    }

    baselineRuns.sort((a, b) => a - b);
    const p95Index = Math.floor(baselineRuns.length * 0.95);
    baselineP95 = baselineRuns[p95Index];

    console.log(`Baseline P95: ${baselineP95.toFixed(2)}ms`);

    return {
        startTime: Date.now(),
        baselineP95,
    };
}

export function teardown(data) {
    const duration = (Date.now() - data.startTime) / 1000 / 60;
    console.log(`Soak test completed: ${duration.toFixed(1)} minutes`);
}
