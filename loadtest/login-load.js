/* eslint-disable */
/**
 * k6 load test for Gestionale GG — finds the REAL concurrency ceiling of the live
 * Supabase stack (Auth + PostgREST/RPC), per compute tier.
 *
 * Two scenarios (pick with -e SCENARIO=burst|steady):
 *
 *   burst  — open model (ramping-arrival-rate): N *fresh logins* per second,
 *            ramping up. Each iteration = signInWithPassword + the calls the app
 *            fires right after login (notification feed + a few KPI RPCs). This is
 *            the thundering-herd "everyone logs in at once" test. It stresses Auth
 *            (GoTrue) AND the DB. NOTE: from a single machine you'll likely hit
 *            Supabase Auth's per-IP rate limit before the DB ceiling — read the
 *            README (run k6 Cloud / raise Auth limits for the test window).
 *
 *   steady — closed model (ramping-vus): N concurrent users that log in ONCE then
 *            loop typical activity with think-time. Reuses tokens, so it isolates
 *            the DB/RPC throughput ceiling (your "concurrent users doing things").
 *
 * Usage:
 *   k6 run -e SUPABASE_URL=https://xxxx.supabase.co -e ANON_KEY=eyJ... \
 *          -e SCENARIO=steady -e PEAK_VUS=500 login-load.js
 *
 *   k6 run -e SCENARIO=burst -e PEAK_RATE=200 login-load.js
 *
 * Requires loadtest/users.json (array of {email,password}) — run seed-test-users.mjs first.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import encoding from 'k6/encoding';
import { Trend, Rate, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// ── Config (all via -e ENV) ──────────────────────────────────────────────────
const SUPABASE_URL = (__ENV.SUPABASE_URL || '').replace(/\/$/, '');
const ANON_KEY = __ENV.ANON_KEY || '';
const SCENARIO = __ENV.SCENARIO || 'steady';
const THINK = Number(__ENV.THINK || 3); // seconds of think-time between actions (steady)

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error('Set -e SUPABASE_URL=... -e ANON_KEY=...');
}

// Test users (email/password) created by seed-test-users.mjs.
const USERS = new SharedArray('users', () => JSON.parse(open('./users.json')));

// ── Custom metrics ───────────────────────────────────────────────────────────
const loginDuration = new Trend('login_duration', true);
const loginErrors = new Rate('login_errors');
const rpcDuration = new Trend('rpc_duration', true);
const rpcErrors = new Rate('rpc_errors');
const logins = new Counter('logins_total');

// ── Scenario selection ───────────────────────────────────────────────────────
const burst = {
  executor: 'ramping-arrival-rate',
  startRate: Number(__ENV.START_RATE || 10),
  timeUnit: '1s',
  preAllocatedVUs: Number(__ENV.PREALLOC_VUS || 500),
  maxVUs: Number(__ENV.MAX_VUS || 3000),
  stages: [
    { target: Number(__ENV.PEAK_RATE || 200), duration: __ENV.RAMP || '2m' },
    { target: Number(__ENV.PEAK_RATE || 200), duration: __ENV.HOLD || '1m' },
  ],
  exec: 'loginBurst',
};

const steady = {
  executor: 'ramping-vus',
  startVUs: 0,
  stages: [
    { target: Number(__ENV.PEAK_VUS || 500), duration: __ENV.RAMP || '2m' },
    { target: Number(__ENV.PEAK_VUS || 500), duration: __ENV.HOLD || '3m' },
    { target: 0, duration: '30s' },
  ],
  exec: 'steadyUser',
};

export const options = {
  setupTimeout: '600s', // token pre-harvest (steady) can take a couple of minutes
  scenarios: SCENARIO === 'burst' ? { burst } : { steady },
  thresholds: {
    // The run "passes" while these hold — when they break you've found the ceiling.
    login_errors: ['rate<0.01'],
    rpc_errors: ['rate<0.01'],
    login_duration: ['p(95)<2500'],
    rpc_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.02'],
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function pickUser() {
  return USERS[Math.floor(Math.random() * USERS.length)];
}

function claimsFromJwt(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(encoding.b64decode(payload, 'rawurl', 's'));
  } catch {
    return {};
  }
}

/** signInWithPassword against GoTrue. Returns { token, marketerId, expires } | null. */
function doLogin(u) {
  u = u || pickUser();
  const res = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: u.email, password: u.password }),
    {
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      tags: { name: 'auth_login' },
    },
  );
  loginDuration.add(res.timings.duration);
  logins.add(1);
  const ok = check(res, { 'login 200': (r) => r.status === 200 });
  loginErrors.add(!ok);
  if (!ok) return null;
  const token = res.json('access_token');
  const claims = claimsFromJwt(token);
  return {
    token,
    marketerId: claims.marketer_id || null,
    // refresh a bit before the 1h expiry
    expires: Date.now() + 50 * 60 * 1000,
  };
}

function rpc(name, body, token) {
  const res = http.post(`${SUPABASE_URL}/rest/v1/rpc/${name}`, JSON.stringify(body), {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    tags: { name: `rpc_${name}` },
  });
  rpcDuration.add(res.timings.duration);
  const ok = check(res, { [`${name} ok`]: (r) => r.status >= 200 && r.status < 300 });
  rpcErrors.add(!ok);
  return res;
}

/** The calls the app fires for a logged-in user (layout + a typical screen). */
function activity(token, marketerId) {
  // Layout notification bell (runs on every full page load).
  rpc('team_notification_feed', { p_new_days: 7 }, token);
  // Statistiche: roster page + org totals.
  rpc('team_summary', {}, token);
  rpc('roster_page', { p_search: '', p_offset: 0, p_limit: 50 }, token);
  if (marketerId) {
    // Tree window + personal KPIs (RLS-scoped to this user's subtree).
    rpc('get_subtree', { node_id: marketerId, max_depth: 4 }, token);
    rpc('funnel_counts', { p_ids: [marketerId] }, token);
  }
}

// ── Scenario entrypoints ─────────────────────────────────────────────────────
export function loginBurst() {
  const s = doLogin();
  if (s) activity(s.token, s.marketerId);
}

// STEADY uses pre-harvested tokens (setup) so the load phase is pure RPC — the
// single-IP Auth rate limit can't pollute the DB-ceiling measurement.
export function setup() {
  if (SCENARIO !== 'steady') return { tokens: [] };
  const want = Math.min(USERS.length, Number(__ENV.HARVEST || USERS.length));
  const delay = Number(__ENV.HARVEST_DELAY || 0.3); // pace logins to dodge rate limits
  const tokens = [];
  for (let i = 0; i < want; i++) {
    const s = doLogin(USERS[i]);
    if (s && s.token) tokens.push({ token: s.token, marketerId: s.marketerId });
    sleep(delay);
  }
  console.log(`Harvested ${tokens.length}/${want} tokens for the load phase`);
  return { tokens };
}

// Per-VU session cache (fallback path only, when no pre-harvested tokens exist).
const sessions = {};
export function steadyUser(data) {
  const pool = (data && data.tokens) || [];
  let s;
  if (pool.length) {
    s = pool[Math.floor(Math.random() * pool.length)]; // reuse a harvested token
  } else {
    const vu = exec.vu.idInTest;
    s = sessions[vu];
    if (!s || s.expires < Date.now()) {
      s = doLogin();
      if (s) sessions[vu] = s;
    }
  }
  if (s) activity(s.token, s.marketerId);
  // Randomized think-time so requests aren't perfectly synchronized.
  sleep(THINK * (0.5 + Math.random()));
}
