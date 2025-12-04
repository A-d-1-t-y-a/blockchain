import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const authLatency = new Trend('authorization_latency');
const healthLatency = new Trend('health_latency');

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 users
    { duration: '1m', target: 50 },    // Stay at 50 users
    { duration: '30s', target: 100 },   // Spike to 100 users
    { duration: '1m', target: 100 },    // Stay at 100 users
    { duration: '30s', target: 50 },   // Scale down to 50
    { duration: '30s', target: 0 },     // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'], // 95% < 1s, 99% < 2s
    http_req_failed: ['rate<0.1'],                    // <10% errors
    errors: ['rate<0.1'],
    authorization_latency: ['p(95)<1000'],            // Authorization < 1s
    health_latency: ['p(95)<100'],                    // Health check < 100ms
  },
};

export default function () {
  // Test 1: Health Check
  const healthStart = Date.now();
  const healthResponse = http.get(`${BASE_URL}/health`);
  const healthDuration = Date.now() - healthStart;
  healthLatency.add(healthDuration);

  const healthCheck = check(healthResponse, {
    'TC-PERF-001: Health check status is 200': (r) => r.status === 200,
    'TC-PERF-002: Health check response time < 500ms': (r) => r.timings.duration < 500,
    'TC-PERF-003: Health check has services status': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.services !== undefined;
      } catch {
        return false;
      }
    },
  });
  errorRate.add(!healthCheck);

  sleep(0.5);

  // Test 2: FROST Config
  const configResponse = http.get(`${BASE_URL}/api/frost/config`);
  check(configResponse, {
    'TC-PERF-004: FROST config status is 200': (r) => r.status === 200,
    'TC-PERF-005: FROST config response time < 100ms': (r) => r.timings.duration < 100,
  });

  sleep(0.5);

  // Test 3: Authorization Request
  const authStart = Date.now();
  const authPayload = JSON.stringify({
    principal: 'arn:aws:iam::123456789012:user/testuser',
    resource: 'arn:aws:s3:::my-bucket/object',
    action: 's3:GetObject',
    signatureShares: [
      { participantId: 'p1', share: 'mock_share_1', commitment: 'mock_commit_1' },
      { participantId: 'p2', share: 'mock_share_2', commitment: 'mock_commit_2' },
      { participantId: 'p3', share: 'mock_share_3', commitment: 'mock_commit_3' },
    ],
  });

  const authResponse = http.post(`${BASE_URL}/api/authorize`, authPayload, {
    headers: { 'Content-Type': 'application/json' },
  });
  const authDuration = Date.now() - authStart;
  authLatency.add(authDuration);

  const authCheck = check(authResponse, {
    'TC-PERF-006: Authorization status is 200': (r) => r.status === 200,
    'TC-PERF-007: Authorization response time < 1s': (r) => r.timings.duration < 1000,
    'TC-PERF-008: Authorization returns requestId': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.requestId !== undefined;
      } catch {
        return false;
      }
    },
    'TC-PERF-009: Authorization returns decision': (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.authorized === 'boolean';
      } catch {
        return false;
      }
    },
  });
  errorRate.add(!authCheck);

  sleep(1);

  // Test 4: Policy Root (if available)
  const policyResponse = http.get(`${BASE_URL}/api/policy/root`);
  check(policyResponse, {
    'TC-PERF-010: Policy root status is 200': (r) => r.status === 200,
  });

  sleep(0.5);
}

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    metrics: {
      http_req_duration: {
        avg: data.metrics.http_req_duration.values.avg,
        p95: data.metrics.http_req_duration.values['p(95)'],
        p99: data.metrics.http_req_duration.values['p(99)'],
      },
      http_req_failed: {
        rate: data.metrics.http_req_failed.values.rate,
      },
      authorization_latency: {
        avg: data.metrics.authorization_latency?.values?.avg || 0,
        p95: data.metrics.authorization_latency?.values?.['p(95)'] || 0,
      },
      health_latency: {
        avg: data.metrics.health_latency?.values?.avg || 0,
        p95: data.metrics.health_latency?.values?.['p(95)'] || 0,
      },
    },
    summary: {
      total_requests: data.metrics.http_reqs.values.count,
      total_duration: data.state.testRunDurationMs,
      requests_per_second: data.metrics.http_reqs.values.rate,
    },
  };

  return {
    'k6/performance-report.json': JSON.stringify(summary, null, 2),
    stdout: `
Performance Test Summary
========================
Total Requests: ${summary.summary.total_requests}
Duration: ${(summary.summary.total_duration / 1000).toFixed(2)}s
Requests/sec: ${summary.summary.requests_per_second.toFixed(2)}

Latency Metrics:
- Average: ${summary.metrics.http_req_duration.avg.toFixed(2)}ms
- P95: ${summary.metrics.http_req_duration.p95.toFixed(2)}ms
- P99: ${summary.metrics.http_req_duration.p99.toFixed(2)}ms

Authorization Latency:
- Average: ${summary.metrics.authorization_latency.avg.toFixed(2)}ms
- P95: ${summary.metrics.authorization_latency.p95.toFixed(2)}ms

Error Rate: ${(summary.metrics.http_req_failed.rate * 100).toFixed(2)}%
`,
  };
}

