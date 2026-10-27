/**
 * JChat 3.0 — harness for the HERMETIC specs (e2e/local, run with e2e/local.config.ts against mobile/dist-web-local).
 *
 * Nothing in here can reach production:
 *   - the app under test is the web export built with EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 (no production URL inside);
 *   - every request / WebSocket whose host is not localhost or 127.0.0.1 is ABORTED and recorded in `blocked` (specs assert it is empty
 *     of anything but harmless noise: see `forbidden`);
 *   - the session is SYNTHETIC (an invented JWT of an invented user: no real account, no saved session file);
 *   - everything the app asks of the local API address (127.0.0.1:54321) is answered here — REST reads from `tables`, RPCs from `rpcs`,
 *     writes acknowledged and recorded in `writes`, the auth endpoints with the synthetic user, and the Realtime socket by a tiny
 *     Phoenix-protocol stand-in — whether or not a Supabase is actually running there.
 */

import type { Page, Route } from '@playwright/test';

export const API = 'http://127.0.0.1:54321';
export const USER_ID = '00000000-0000-4000-8000-0000000000f1';
export const OTHER_ID = '00000000-0000-4000-8000-0000000000f2';
export const BUSINESS_ID = '00000000-0000-4000-8000-0000000000b1';
export const ROOM_ID = '00000000-0000-4000-8000-0000000000e1';
export const VENUE = 'bar-sintetico';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** True for localhost / 127.0.0.1 (and for non-network schemes such as data: / blob: / about:). */
export function isLocalUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return true;
    return LOCAL_HOSTS.has(url.hostname);
  } catch {
    return true;
  }
}

/** Hosts that must NEVER be reached tonight: the specs fail if the app even tried. */
export const FORBIDDEN_HOST = /(supabase\.co|jchat\.cloud|vercel\.(app|com)|stripe\.(com|network)|sentry\.io)/i;

const b64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** An invented JWT (never verified by the client) for the synthetic user. */
export function syntheticToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: 'authenticated', role: 'authenticated', sub: USER_ID, email: 'sintetico@example.test', iat: now, exp: now + 10 * 365 * 24 * 3600 };
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.${Buffer.from('synthetic-signature').toString('base64url')}`;
}

export const SYNTHETIC_USER = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'sintetico@example.test',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};

export function syntheticSession() {
  const now = Math.floor(Date.now() / 1000);
  return { access_token: syntheticToken(), token_type: 'bearer', expires_in: 10 * 365 * 24 * 3600, expires_at: now + 10 * 365 * 24 * 3600, refresh_token: 'synthetic-refresh', user: SYNTHETIC_USER };
}

/** The key supabase-js uses for `http://127.0.0.1:54321`: sb-<first label of the host>-auth-token. */
export const SESSION_KEY = 'sb-127-auth-token';

/** Signs the synthetic user in before the app loads. Call it BEFORE page.goto. */
export async function signInSynthetic(page: Page) {
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [SESSION_KEY, JSON.stringify(syntheticSession())] as const);
}

type Json = unknown;

export interface HermeticOptions {
  /** REST reads: table name → rows (or a function of the request URL). Unlisted tables answer []. */
  tables?: Record<string, Json | ((url: URL) => Json)>;
  /** RPCs: function name → result (or a function of the JSON body). Unlisted RPCs answer null and are listed in `unknownRpcs`. */
  rpcs?: Record<string, Json | ((body: Record<string, unknown>) => Json | { status: number; body: Json })>;
  /** Called for every REST write the app attempts (after it is recorded): lets a spec flip its own fixtures, e.g. "onboarding done". */
  onWrite?: (method: string, table: string, body: unknown) => void;
}

export interface Hermetic {
  /** Every request / socket the page tried to make to a non-local host (all aborted). */
  blocked: string[];
  rpcCalls: { name: string; body: Record<string, unknown> }[];
  unknownRpcs: string[];
  /** REST writes (POST / PATCH / PUT / DELETE under /rest/v1, other than RPC) the app attempted, e.g. "POST /rest/v1/messages". */
  writes: string[];
  /** Realtime topics joined. */
  topics: string[];
  /** Sends a Realtime `postgres_changes` event to the channel joined for `table` (or any channel when omitted). */
  inject: (table: string, event: 'INSERT' | 'UPDATE' | 'DELETE', record: Record<string, unknown>) => boolean;
  /** Replaces the people the room's presence channel reports (and tells the page). */
  setPresence: (people: { id: string; name: string; avatar?: string | null; incognito?: boolean }[]) => void;
  /** The blocked requests that went to a host that must never be reached (production, Stripe, Vercel, Sentry). */
  forbidden: () => string[];
  options: HermeticOptions;
}

const json = (route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) =>
  route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(body) });

export async function hermetic(page: Page, options: HermeticOptions = {}): Promise<Hermetic> {
  const state: Hermetic = {
    blocked: [],
    rpcCalls: [],
    unknownRpcs: [],
    writes: [],
    topics: [],
    inject: () => false,
    setPresence: () => undefined,
    forbidden: () => state.blocked.filter((u) => FORBIDDEN_HOST.test(u)),
    options,
  };

  // 1) Lowest priority (registered first): anything that is not local is aborted.
  await page.route((url) => !isLocalUrl(url.toString()), (route) => {
    state.blocked.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  await page.routeWebSocket((url) => !isLocalUrl(url.toString()), (ws) => {
    state.blocked.push(ws.url());
    ws.close();
  });

  // 2) The local API address: auth.
  await page.route(`${API}/auth/v1/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (path.endsWith('/user')) return json(route, SYNTHETIC_USER);
    if (path.endsWith('/token')) return json(route, syntheticSession());
    if (path.endsWith('/logout')) return route.fulfill({ status: 204 });
    return json(route, {});
  });

  // 3) REST: reads from `tables`, writes acknowledged.
  await page.route(`${API}/rest/v1/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const rpc = /\/rest\/v1\/rpc\/([a-z0-9_]+)/.exec(url.pathname);
    if (rpc) {
      const name = rpc[1];
      let body: Record<string, unknown> = {};
      try { body = req.postDataJSON() ?? {}; } catch { /* no body */ }
      state.rpcCalls.push({ name, body });
      const answer = options.rpcs?.[name];
      if (answer === undefined) {
        state.unknownRpcs.push(name);
        return json(route, null);
      }
      const value = typeof answer === 'function' ? (answer as (b: Record<string, unknown>) => Json)(body) : answer;
      if (value && typeof value === 'object' && 'status' in (value as object) && 'body' in (value as object) && Object.keys(value as object).length === 2) {
        const reply = value as { status: number; body: Json };
        return json(route, reply.body, reply.status);
      }
      return json(route, value);
    }
    if (req.method() === 'GET' || req.method() === 'HEAD') {
      const table = url.pathname.replace('/rest/v1/', '');
      const source = options.tables?.[table];
      const rows = source === undefined ? [] : typeof source === 'function' ? (source as (u: URL) => Json)(url) : source;
      const wantsObject = /vnd\.pgrst\.object/.test(req.headers()['accept'] ?? '');
      if (wantsObject) {
        const list = Array.isArray(rows) ? rows : rows == null ? [] : [rows];
        if (list.length === 0) return json(route, { code: 'PGRST116', details: 'The result contains 0 rows', hint: null, message: 'JSON object requested, multiple (or no) rows returned' }, 406);
        return json(route, list[0]);
      }
      return json(route, rows, 200, { 'content-range': `0-${Array.isArray(rows) ? Math.max(rows.length - 1, 0) : 0}/*` });
    }
    state.writes.push(`${req.method()} ${url.pathname}`);
    let sent: unknown = null;
    try { sent = req.postDataJSON(); } catch { /* no body */ }
    options.onWrite?.(req.method(), url.pathname.replace('/rest/v1/', ''), sent);
    return json(route, [], req.method() === 'POST' ? 201 : 200);
  });

  await page.route(`${API}/storage/v1/**`, (route) => json(route, [], 200));
  await page.route(`${API}/functions/v1/**`, (route) => json(route, {}, 200));

  // 4) Realtime: a Phoenix-protocol stand-in. It accepts every join, answers heartbeats and can push events.
  const joins = new Map<string, { joinRef: string; ids: { id: number; event: string; table: string }[] }>();
  let presencePeople: { id: string; name: string; avatar?: string | null; incognito?: boolean }[] = [];
  let toPage: ((data: string) => void) | null = null;
  let nextId = 1000;

  const presenceState = () =>
    Object.fromEntries(
      presencePeople.map((p) => [
        p.id,
        { metas: [{ phx_ref: `ref-${p.id}`, user_id: p.id, display_name: p.name, avatar_url: p.avatar ?? null, is_incognito: p.incognito ?? false, nickname: p.incognito ? 'Anónimo' : null }] },
      ]),
    );
  const sendPresence = () => {
    for (const [topic, join] of joins) {
      if (/presence:/.test(topic)) toPage?.(JSON.stringify([join.joinRef, null, topic, 'presence_state', presenceState()]));
    }
  };

  await page.routeWebSocket(/127\.0\.0\.1:54321\/realtime\/v1\/websocket/, (ws) => {
    toPage = (data) => ws.send(data);
    ws.onMessage((raw) => {
      let frame: [string | null, string | null, string, string, Record<string, unknown>];
      try { frame = JSON.parse(String(raw)); } catch { return; }
      const [joinRef, ref, topic, event, payload] = frame;
      if (event === 'heartbeat') return ws.send(JSON.stringify([null, ref, 'phoenix', 'phx_reply', { status: 'ok', response: {} }]));
      if (event === 'phx_join') {
        const config = (payload?.config as { postgres_changes?: { event: string; table: string }[] } | undefined) ?? {};
        const ids = (config.postgres_changes ?? []).map((c) => ({ id: nextId++, event: c.event, table: c.table, schema: 'public' }));
        joins.set(topic, { joinRef: joinRef ?? '1', ids });
        state.topics.push(topic);
        ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: ids } }]));
        if (/presence:/.test(topic)) setTimeout(sendPresence, 20);
        return;
      }
      if (event === 'phx_leave') {
        joins.delete(topic);
        return ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
      }
      if (event === 'presence' || event === 'access_token') return; // track / token refresh: nothing to answer
    });
  });

  state.setPresence = (people) => {
    presencePeople = people;
    sendPresence();
  };
  state.inject = (table, event, record) => {
    if (!toPage) return false;
    for (const [topic, join] of joins) {
      const hit = join.ids.find((c) => c.table === table && (c.event === event || c.event === '*'));
      if (!hit) continue;
      toPage(JSON.stringify([join.joinRef, null, topic, 'postgres_changes', { ids: [hit.id], data: { schema: 'public', table, commit_timestamp: new Date().toISOString(), type: event, record, old_record: {}, columns: [], errors: null } }]));
      return true;
    }
    return false;
  };

  return state;
}
