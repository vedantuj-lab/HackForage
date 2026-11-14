import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * HackForge Load Testing Script (k6)
 * Proposed Scale Target: 10,000 users / 2,000 teams / p95 < 200ms
 * Note: Run this script against a dedicated staging/production deployment
 * provisioned with autoscaling Node instances and connection pooling.
 */
export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '1m', target: 500 },
    { duration: '1m', target: 1000 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: 'participant1@hackforge.demo',
      password: 'HackForge@2026',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(loginRes, { 'login status is 200': (r) => r.status === 200 });
  const token = loginRes.json('accessToken');
  const authHeaders = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };

  const teamsRes = http.get(`${BASE_URL}/api/teams`, authHeaders);
  check(teamsRes, { 'teams discovery status is 200': (r) => r.status === 200 });

  const profileRes = http.get(`${BASE_URL}/api/users/profile`, authHeaders);
  check(profileRes, { 'profile status is 200': (r) => r.status === 200 });

  sleep(1);
}
