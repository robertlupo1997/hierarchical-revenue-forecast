/**
 * MLRF API Stress Test (k6)
 *
 * Pushes the API to find its breaking point.
 * Tests increasingly higher load until failures occur.
 *
 * Run with: k6 run stress.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';

const errorRate = new Rate('errors');
const requestCount = new Counter('requests');

const BASE_URL = __ENV.API_URL || 'http://localhost:8081';
const API_KEY = __ENV.API_KEY || '';

export const options = {
    stages: [
        { duration: '1m', target: 50 },    // Below normal load
        { duration: '2m', target: 100 },   // Normal load
        { duration: '2m', target: 200 },   // Around breaking point
        { duration: '2m', target: 300 },   // Beyond breaking point
        { duration: '2m', target: 400 },   // Far beyond
        { duration: '1m', target: 0 },     // Recovery
    ],
    thresholds: {
        // More lenient thresholds - we're testing limits
        http_req_failed: ['rate<0.10'],   // Allow up to 10% errors
        http_req_duration: ['p(90)<500'], // 90% under 500ms
    },
};

function getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (API_KEY) headers['X-API-Key'] = API_KEY;
    return headers;
}

export default function() {
    const payload = JSON.stringify({
        store_nbr: Math.floor(Math.random() * 54) + 1,
        family: 'GROCERY I',
        date: '2017-08-01',
        horizon: 90,
    });

    const res = http.post(`${BASE_URL}/predict/simple`, payload, {
        headers: getHeaders(),
        timeout: '10s',
    });

    requestCount.add(1);

    const success = check(res, {
        'status is 200': (r) => r.status === 200,
        'not rate limited': (r) => r.status !== 429,
    });

    if (!success) {
        errorRate.add(1);
        if (res.status === 429) {
            // Back off when rate limited
            sleep(1);
        }
    } else {
        errorRate.add(0);
    }

    sleep(0.05);  // Minimal delay for stress testing
}

export function setup() {
    console.log('Starting stress test - finding API breaking point');
    const res = http.get(`${BASE_URL}/health`);
    if (res.status !== 200) {
        throw new Error('API not healthy');
    }
    return { startTime: Date.now() };
}

export function teardown(data) {
    console.log(`Stress test completed in ${((Date.now() - data.startTime) / 1000).toFixed(1)}s`);
}
