/**
 * Load Testing Script for k6 (run separately via k6 CLI)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.1'],
    errors: ['rate<0.1'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';

export default function () {
  const healthResponse = http.get(`${BASE_URL}/health`);
  const healthCheck = check(healthResponse, {
    'TC-PERF-006: Health check status is 200': (r) => r.status === 200,
    'TC-PERF-006: Health check response time < 500ms': (r) => r.timings.duration < 500,
  });
  errorRate.add(!healthCheck);

  sleep(1);

  const configResponse = http.get(`${BASE_URL}/api/frost/config`);
  const configCheck = check(configResponse, {
    'TC-PERF-002: FROST config status is 200': (r) => r.status === 200,
    'TC-PERF-002: FROST config response time < 100ms': (r) => r.timings.duration < 100,
  });
  errorRate.add(!configCheck);

  sleep(1);
}

export function handleSummary(data) {
  return {
    'k6/load-test-results.json': JSON.stringify(data, null, 2),
  };
}
