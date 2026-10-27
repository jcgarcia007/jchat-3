// JChat 3.0 load test — shared helpers. LOCAL ONLY.
//
// The guard below runs when the script is LOADED (k6's init stage): if API_URL is not localhost / 127.0.0.1 / [::1] k6 stops with an
// error before a single request is made. The tokens are minted here with the LOCAL stack's JWT secret (never a cloud project's).
import { hmac } from 'k6/crypto';
import encoding from 'k6/encoding';

export function assertLocal(url) {
  if (!/^(https?|wss?):\/\/(\[::1\]|localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url)) {
    throw new Error(`REFUSING to run: ${url} is not localhost / 127.0.0.1. The load tests only run against the local Supabase.`);
  }
}

export const API = __ENV.API_URL || 'http://127.0.0.1:54321';
assertLocal(API);
export const WS = API.replace(/^http/, 'ws');
export const ANON_KEY = __ENV.ANON_KEY || '';
const JWT_SECRET = __ENV.JWT_SECRET || '';
if (!ANON_KEY || !JWT_SECRET) throw new Error('ANON_KEY / JWT_SECRET missing: start through loadtest/run.sh (it reads them from the local stack).');

export const USERS = 1000;
export const BUSINESS_ID = 'b0000000-0000-4000-8000-000000000001';
export const ROOM_ID = 'c0000000-0000-4000-8000-000000000001';
export const userId = (i) => `a0000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
/** The virtual user's own account (1..USERS), stable across iterations. */
export const myIndex = () => ((__VU - 1) % USERS) + 1;
export const peerIndex = (i) => (i % USERS) + 1;

const b64 = (s) => encoding.b64encode(s, 'rawurl');
export function mintToken(sub) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ sub, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 7200 }));
  const sig = encoding.b64encode(hmac('sha256', JWT_SECRET, `${head}.${body}`, 'binary'), 'rawurl');
  return `${head}.${body}.${sig}`;
}

let cached = null;
/** Headers of the calling VU's own session (token minted once per VU). */
export function headers() {
  if (!cached) {
    const token = mintToken(userId(myIndex()));
    cached = { token, h: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
  }
  return cached.h;
}
export const token = () => { headers(); return cached.token; };

/** 1 min ramp, then hold (defaults 3 min), as asked. LOADTEST_RAMP / LOADTEST_HOLD override for quick checks. */
export function loadOptions(vus, extra = {}) {
  return {
    scenarios: {
      load: {
        executor: 'ramping-vus',
        startVUs: 0,
        stages: [
          { duration: __ENV.LOADTEST_RAMP || '1m', target: vus },
          { duration: __ENV.LOADTEST_HOLD || '3m', target: vus },
        ],
        gracefulRampDown: '10s',
        gracefulStop: '30s',
      },
    },
    summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
    ...extra,
  };
}

export const VUS = parseInt(__ENV.VUS || '10', 10);
