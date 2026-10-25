/**
 * JChat 3.0 — shared harness for the web games specs (Match, Truth or Dare): the WHOLE games network is simulated.
 *
 * Nothing that could write reaches Supabase: every REST write (POST / PATCH / PUT / DELETE under /rest/v1) and EVERY RPC
 * is answered here with synthetic rows (an RPC this file does not know answers `null` and is listed in `unknownRpcs`), and
 * every storage call is answered empty. The only things that still go out are REST reads (GET) of the saved session's own
 * data, the auth session refresh and the Realtime socket. `assertNothingLeaked` fails the spec if a game RPC was answered
 * by anything but a mock, or if a write slipped past the routes.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Page, Route } from '@playwright/test';

export const SESSION = path.resolve(__dirname, '..', '.auth', 'web-session.json');
export const hasSession = existsSync(SESSION);
export const VENUE = 'bar-xzx-omd2';
export const BUSINESS_ID = '00000000-0000-4000-8000-0000000000b1'; // synthetic: only used when a mock needs an id
export const ROUND_ID = '00000000-0000-4000-8000-0000000000c1';
export const DRAW_ID = '00000000-0000-4000-8000-0000000000d1';
const PEOPLE = ['a2', 'a3', 'a4'].map((s, i) => ({
  id: `00000000-0000-4000-8000-0000000000${s}`,
  username: `prueba_${i + 1}`,
  display_name: `Prueba ${i + 1}`,
  avatar_url: null,
  bio: `Persona sintética ${i + 1}`,
  is_verified: false,
  photos: [],
  interests: [],
  common_interests: [],
  super_liked_me: false,
}));

export interface Leak {
  method: string;
  url: string;
}

export interface GamesMock {
  rpcCalls: string[];
  unknownRpcs: string[];
  writes: string[];
  leaks: Leak[];
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const RPC_ANSWERS: Record<string, unknown> = {
  check_geofence_and_join_room: [{ access_granted: true, is_owner: false, distance_m: 5, reason: 'granted' }],
  match_enabled_for_business: true,
  tod_enabled_for_business: true,
  match_check_in: { status: 'active', reason: null, active_since: '2026-01-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', readings: 2, method: 'geo' },
  match_leave_venue: null,
  match_get_deck: PEOPLE,
  match_swipe: { swiped: true, is_match: false, match_id: null, conversation_id: null, super_left: 5 },
  match_undo_last: { undone: false, target_id: null, action: null },
  match_get_passed: [],
  match_get_activity: { super_left: 5, likes: [], liked_me: [], matches: [] },
  tod_accept_terms: { status: 'ok' },
  tod_draw: { status: 'ok', draw_id: DRAW_ID, kind: 'truth', is_random: false, concept_id: 'synthetic-1', applause: 0, expires_at: '2099-01-01T00:00:00Z' },
  my_block_relations: [],
  is_banned_from_room: false,
  tod_decide: { status: 'ok', published: false },
  // The venue session asks the server whether a confirmed exit was still pending when the person comes back: nothing pending.
  venue_session_resume: false,
};

/** Read-only RPCs (declared `stable` in their migration): the entry link lookup and the order banner. They pass through. */
const READ_ONLY_RPCS = new Set(['resolve_venue_entry', 'my_active_orders']);

const GET_ANSWERS: Array<[RegExp, unknown]> = [
  [/\/rest\/v1\/games\b/, [
    { key: 'match', name_es: 'Match', name_en: 'Match', is_active: true, sort: 1 },
    { key: 'truth_or_dare', name_es: 'Verdad o Reto', name_en: 'Truth or Dare', is_active: true, sort: 2 },
  ]],
  [/\/rest\/v1\/tod_terms\b/, [{ user_id: '00000000-0000-4000-8000-000000000001' }]],
  [/\/rest\/v1\/tod_settings\b/, []],
  [/\/rest\/v1\/tod_cards\b/, [{ concept_id: 'synthetic-1', category: 'classic', kind: 'truth', body: 'Pregunta sintética de prueba para el giro de la carta', updated_at: '2026-01-01T00:00:00Z' }]],
  [/\/rest\/v1\/match_photos\b/, [{ id: '00000000-0000-4000-8000-0000000000e1', user_id: '00000000-0000-4000-8000-000000000001', path: 'synthetic/me.jpg', sort: 0, status: 'approved', rejection_reason: null, needs_review: false, created_at: '2026-01-01T00:00:00Z' }]],
  [/\/rest\/v1\/match_/, []],
];

/** Installs the simulation. Call before the first navigation. */
export async function mockGamesNetwork(page: Page, overrides: Record<string, unknown> = {}): Promise<GamesMock> {
  const state: GamesMock = { rpcCalls: [], unknownRpcs: [], writes: [], leaks: [] };

  // Last resort (registered first = lowest priority): any Supabase write that no mock below answered is a leak. It is recorded
  // and ABORTED, so even a failing spec never writes. Reads, the auth session refresh and CORS preflights go through.
  await page.route(/\.supabase\.co\//, (route) => {
    const req = route.request();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method()) || /\/auth\/v1\//.test(req.url())) return route.continue();
    state.leaks.push({ method: req.method(), url: req.url() });
    return route.abort();
  });

  await page.route(/\/rest\/v1\/rpc\/([a-z0-9_]+)/, async (route) => {
    const name = /\/rpc\/([a-z0-9_]+)/.exec(route.request().url())![1];
    state.rpcCalls.push(name);
    if (READ_ONLY_RPCS.has(name)) return route.continue();
    if (name in overrides) return json(route, overrides[name]);
    if (name in RPC_ANSWERS) return json(route, RPC_ANSWERS[name]);
    state.unknownRpcs.push(name);
    return json(route, null);
  });

  await page.route(/\/rest\/v1\/(?!rpc\/)/, async (route) => {
    const req = route.request();
    if (req.method() === 'GET' || req.method() === 'HEAD') {
      const hit = GET_ANSWERS.find(([re]) => re.test(req.url()));
      if (hit) return json(route, hit[1]);
      return route.continue(); // a plain read of the saved session's own data
    }
    state.writes.push(`${req.method()} ${new URL(req.url()).pathname}`);
    return json(route, [], req.method() === 'POST' ? 201 : 200);
  });

  await page.route(/\/storage\/v1\//, (route) => json(route, [], 200));

  return state;
}

export function assertNothingLeaked(state: GamesMock): string[] {
  const problems: string[] = [];
  if (state.leaks.length) problems.push(`requests that reached Supabase: ${JSON.stringify(state.leaks)}`);
  return problems;
}

export interface Injector {
  topic: string;
  send: (record: Record<string, unknown>) => void;
}

/** Proxies the Realtime socket so a spec can push a postgres_changes INSERT to the room-messages channel (read path only). */
export async function watchRealtime(page: Page): Promise<() => Injector | null> {
  let toPage: ((data: string) => void) | null = null;
  let topic = '';
  let joinRef: string | null = null;
  let insertId = 0;
  await page.routeWebSocket(/realtime\/v1\/websocket/, (ws) => {
    const server = ws.connectToServer();
    toPage = (data) => ws.send(data);
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      ws.send(message);
      try {
        const [ref, , t, event, payload] = JSON.parse(String(message));
        const changes = payload?.response?.postgres_changes as { id: number; event: string }[] | undefined;
        if (event === 'phx_reply' && typeof t === 'string' && t.includes('room-messages:') && changes) {
          topic = t;
          joinRef = ref;
          insertId = changes.find((c) => c.event === 'INSERT')?.id ?? 0;
        }
      } catch {
        /* not a JSON frame */
      }
    });
  });
  return () =>
    topic && insertId && toPage
      ? {
          topic,
          send: (record) =>
            toPage!(JSON.stringify([joinRef, null, topic, 'postgres_changes', { ids: [insertId], data: { schema: 'public', table: 'messages', commit_timestamp: new Date().toISOString(), type: 'INSERT', record, columns: [], errors: null } }])),
        }
      : null;
}

/** A synthetic `messages` row. */
export function messageRecord(roomId: string, userId: string, extra: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    room_id: roomId,
    user_id: userId,
    body: '',
    type: 'text',
    media_url: null,
    metadata: {},
    is_system: false,
    created_at: new Date().toISOString(),
    ...extra,
  };
}

export const PERSON_ID = PEOPLE[0].id;
