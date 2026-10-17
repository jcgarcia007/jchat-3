// A tiny stand-in for Supabase, for ONE spec: the owner dashboard (a Next server component + the browser client) talks to it
// instead of production, so a failed save can be forced without a real session and without writing anything anywhere.
// Run:  node web/fake-supabase.mjs 4180      (the spec's config starts it; the Next server is pointed at it by env)
//
// It answers: /auth/v1/user (a synthetic owner), is_platform_admin → true (skips the plan gate), `users` (age confirmed),
// `businesses` reads (one synthetic business) and — the point — PATCH /rest/v1/businesses → 403 "permission denied for table
// businesses" (SQLSTATE 42501), exactly what production answered before migration 236. Every other read is empty, every other
// write is acknowledged and dropped. GET /__writes lists what was attempted (method + path), for the spec to assert.

import { createServer } from 'node:http';

const PORT = Number(process.argv[2] ?? 4180);
const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const BUSINESS_ID = '00000000-0000-4000-8000-0000000000b1';
const attempts = [];

const USER = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'owner@example.test',
  app_metadata: { provider: 'email' },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};
const BUSINESS = {
  id: BUSINESS_ID,
  name: 'Negocio sintético',
  slug: 'negocio-sintetico',
  status: 'verified',
  plan: 'business',
  is_verified: true,
  menu_enabled: false,
  menu_mode: null,
  external_menu_url: null,
  logo_url: null,
  description: '',
  category: 'bar',
  address: '',
  phone: '',
  website: '',
  hours: null,
  cover_url: null,
  icon_url: null,
  icon_emoji: null,
  gallery_urls: [],
  tips_enabled: false,
  tip_percentages: [10, 15, 20],
  payout_frequency: 'weekly',
  dashboard_theme_id: 1,
  dashboard_palette_id: null,
  table_subchats_enabled: false,
  pickup_enabled: false,
  kds_settings: {},
  pos_payment_mode: 'pay_at_counter',
};

const send = (res, status, body) => {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*',
    'access-control-expose-headers': '*',
  });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  if (req.method === 'OPTIONS') return send(res, 204);
  if (path === '/__writes') return send(res, 200, attempts);
  if (path === '/auth/v1/user') return send(res, 200, USER);
  if (path.startsWith('/auth/')) return send(res, 200, {});

  const wantsObject = String(req.headers.accept ?? '').includes('application/vnd.pgrst.object+json');
  const rpc = /^\/rest\/v1\/rpc\/([a-z0-9_]+)/.exec(path)?.[1];
  if (rpc) {
    if (req.method !== 'GET') attempts.push(`RPC ${rpc}`);
    return send(res, 200, rpc === 'is_platform_admin' ? true : null);
  }
  const table = /^\/rest\/v1\/([a-z0-9_]+)/.exec(path)?.[1];
  if (!table) return send(res, 404, { message: 'not found' });

  if (req.method === 'GET' || req.method === 'HEAD') {
    const row =
      table === 'users' ? { id: USER_ID, active_business_id: null, age_confirmed_at: '2000-01-01T00:00:00Z', plan: 'business', plan_status: 'active', plan_trial_end: null }
      : table === 'businesses' ? BUSINESS
      : null;
    if (wantsObject) return row ? send(res, 200, row) : send(res, 406, { code: 'PGRST116', message: 'no rows', details: '0 rows', hint: null });
    return send(res, 200, row ? [row] : []);
  }

  attempts.push(`${req.method} ${path}`);
  if (table === 'businesses' && req.method === 'PATCH') {
    return send(res, 403, { code: '42501', message: 'permission denied for table businesses', details: null, hint: null });
  }
  return send(res, req.method === 'POST' ? 201 : 200, []);
}).listen(PORT, '127.0.0.1');
