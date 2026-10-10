// Shared helpers for scripts/test-users/*. Nothing here prints a key, a password or a session token.
import { createRequire } from 'node:module';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(new URL('../../web/package.json', import.meta.url));
export const { createClient } = require('@supabase/supabase-js');

export const DOMAIN = 'test.jchat.cloud';
export const OUT_DIR = fileURLToPath(new URL('./out/', import.meta.url));
export const CREDENTIALS_PATH = path.join(OUT_DIR, 'credentials.json');

/** KEY=VALUE pairs of web/.env.local (values are never printed). */
export function readEnvLocal() {
  const out = {};
  try {
    const text = readFileSync(fileURLToPath(new URL('../../web/.env.local', import.meta.url)), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch {
    // no file: the environment must provide the variables
  }
  return out;
}

/** { url, secret, publishable } or exits with a clear message. SB_SECRET_KEY / the publishable key are only read, never printed. */
export function config() {
  const env = { ...readEnvLocal(), ...process.env };
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = env.SB_SECRET_KEY;
  const publishable = env.SB_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !secret || !publishable) {
    console.error('Missing SUPABASE_URL / SB_SECRET_KEY / publishable key (web/.env.local or the environment).');
    process.exit(2);
  }
  return { url, secret, publishable };
}

export function adminClient(cfg) {
  return createClient(cfg.url, cfg.secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const argv = process.argv.slice(2);
export const flag = (name) => argv.includes(`--${name}`);
export const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Only addresses of the test domain are ever touched by these scripts. */
export const isTestEmail = (email) => typeof email === 'string' && email.toLowerCase().endsWith(`@${DOMAIN}`);

export function readCredentials() {
  if (!existsSync(CREDENTIALS_PATH)) return { venue: null, users: [] };
  return JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
}

/** credentials.json holds the generated passwords: out/ is git-ignored and the file is chmod 600. */
export function writeCredentials(data) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
  chmodSync(CREDENTIALS_PATH, 0o600);
}

/** The current TERMS_VERSION of the web (sent to confirm_age like the real apps do). */
export function termsVersion() {
  try {
    const text = readFileSync(fileURLToPath(new URL('../../web/lib/terms.ts', import.meta.url)), 'utf8');
    return text.match(/TERMS_VERSION\s*=\s*"([^"]+)"/)?.[1] ?? '2026-10';
  } catch {
    return '2026-10';
  }
}

/**
 * Keeps a user's latest refresh token in credentials.json (the same git-ignored, chmod 600 file as the password; never printed).
 * Read-modify-write on every call, so several clients renewing at once never overwrite each other's token.
 */
export function saveRefreshToken(userId, token) {
  if (!userId || !token) return;
  const data = readCredentials();
  const entry = data.users.find((u) => u.id === userId);
  if (!entry || entry.refresh_token === token) return;
  entry.refresh_token = token;
  writeCredentials(data);
}

/**
 * A client signed in AS the user (so every RLS policy and RPC rule applies exactly as in the apps). Supabase Auth rate-limits
 * new sign-ins (magic links, passwords) and may have hCaptcha on for password sign-ins, which a script cannot solve, so the
 * order is: (1) the refresh token saved in credentials.json (refreshSession — no new sign-in); only if that fails, (2) a
 * one-time magic-link token minted with the admin API and exchanged with verifyOtp (not captcha-gated); (3) the password.
 * Whatever session results, its refresh token is saved, and every automatic renewal saves the new one (refresh tokens rotate).
 * Returns null when no session could be created.
 */
export async function userClient(cfg, admin, user) {
  const client = createClient(cfg.url, cfg.publishable, { auth: { persistSession: false, autoRefreshToken: true } });
  const remember = (session) => {
    if (!session?.refresh_token) return;
    user.refresh_token = session.refresh_token;
    saveRefreshToken(user.id, session.refresh_token);
  };
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED') remember(session);
  });

  if (user.refresh_token) {
    try {
      const { data, error } = await client.auth.refreshSession({ refresh_token: user.refresh_token });
      if (!error && data?.session) { remember(data.session); return client; }
    } catch {
      // fall through to a new sign-in
    }
  }
  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: user.email });
    const hash = data?.properties?.hashed_token;
    if (!error && hash) {
      const { data: s, error: e2 } = await client.auth.verifyOtp({ token_hash: hash, type: 'magiclink' });
      if (!e2 && s?.session) { remember(s.session); return client; }
    }
  } catch {
    // fall through to the password
  }
  if (user.password) {
    const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
    if (!error && data?.session) { remember(data.session); return client; }
  }
  return null;
}

// ── Names, bios and chat text (neutral, friendly, never about real people) ───────────────────────────────────────────────
export const FIRST_NAMES = [
  'Lucía', 'Mateo', 'Valentina', 'Santiago', 'Camila', 'Sebastián', 'Isabella', 'Diego', 'Sofía', 'Andrés',
  'Daniela', 'Nicolás', 'Mariana', 'Gabriel', 'Paula', 'Emilio', 'Carolina', 'Tomás', 'Renata', 'Javier',
  'Ximena', 'Rafael', 'Julieta', 'Bruno', 'Elena', 'Marcos', 'Noa', 'Iván', 'Alma', 'Leo',
];
export const BIOS = [
  'Cuenta de prueba · me gusta el buen café y la música en vivo.',
  'Cuenta de prueba · fan de los tacos y de las charlas largas.',
  'Cuenta de prueba · fotógrafo aficionado, siempre con cámara.',
  'Cuenta de prueba · busco el mejor mojito de la ciudad.',
  'Cuenta de prueba · jueves de trivia, viernes de baile.',
  'Cuenta de prueba · viajera, lectora y amante de la pizza.',
];
export const CHAT_LINES = [
  '¡Buenas noches a todos!', '¿Alguien probó la hamburguesa de hoy?', 'Qué buena la música esta noche', '¿A qué hora cierran?',
  'Primera vez por aquí, ¡me encanta el ambiente!', 'Recomiendo los tacos al pastor', 'Hola hola 👋', '¿Hay mesas libres afuera?',
  'Gran noche, gracias por la buena onda', 'Hoy hay promo en la cerveza, ¿verdad?', 'Jajaja qué buena esa', 'Nos vemos el viernes',
];
export const DM_LINES = [
  'Hola, ¿cómo vas?', '¡Qué gusto verte por aquí!', '¿Vienes seguido a este lugar?', 'Te recomiendo probar el postre',
  'Gracias por el dato 🙌', 'Ya estoy en la barra, ¿me ves?', 'Jajaja sí, claro', 'Nos vemos luego',
];
export const POST_LINES = [
  'Noche perfecta en el bar', 'Mi plato favorito de la semana', 'Buena compañía y buena música', 'Probando algo nuevo hoy',
  'El mejor lugar del barrio', 'Fin de semana en buena onda',
];

/** DiceBear avatar (a generated cartoon; never a photo of a real person). */
export const avatarUrl = (seed) =>
  `https://api.dicebear.com/9.x/adventurer/png?size=256&seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;

// ── Venue presence, Match check-in and Match photos (shared by simulate.mjs and match-setup.mjs) ─────────────────────────

/** Illustrated DiceBear styles for Match photos (generated drawings; never a photo of a real person). */
export const MATCH_STYLES = ['lorelei', 'notionists', 'adventurer'];

/** A DiceBear illustration as WebP: the format the app itself uploads to the match-photos bucket (≤ 800 px, image/webp). */
export const matchPhotoUrl = (style, seed) =>
  `https://api.dicebear.com/9.x/${style}/webp?size=512&seed=${encodeURIComponent(seed)}`;

/**
 * The coordinates a script sends are SUPPLIED, not read from a GPS sensor, so the honest value of match_check_in's
 * p_mocked is true. With mocked=true the server (migrations 196/197) keeps the Match presence 'pending' until a venue QR is
 * scanned, and the Match deck needs an ACTIVE presence. This is reported, never worked around: do not flip this to false to
 * "make it work" — that would be claiming a real GPS fix the script does not have.
 */
export const SCRIPT_LOCATION_IS_SIMULATED = true;

/** Enter the venue like the app does: the geofence RPC with the venue position (publishes room_geo_presence, TTL 10 min). */
export async function enterVenue(client, room, venue) {
  const { data, error } = await client.rpc('check_geofence_and_join_room', { _room_id: room.id, _lat: venue.lat, _lng: venue.lng });
  const granted = !error && Array.isArray(data) && data[0]?.access_granted === true;
  return { granted, code: granted ? 'ok' : (error?.code ?? data?.[0]?.reason ?? 'refused') };
}

// The printed QR of a venue room encodes `https://jchat.cloud/c/{rooms.qr_token}` (web/services/qr.ts roomQrUrl). Same rule as the
// app's mobile/utils/venueQr.ts: the token is the segment after `/c/`; a bare token is accepted too. Anything else → null.
const QR_URL_TOKEN_RE = /\/c\/([A-Za-z0-9_-]{6,128})(?:[/?#]|$)/;
const QR_BARE_TOKEN_RE = /^[A-Za-z0-9_-]{6,128}$/;

export function parseVenueQrToken(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const fromUrl = QR_URL_TOKEN_RE.exec(value);
  if (fromUrl) return fromUrl[1];
  return QR_BARE_TOKEN_RE.test(value) ? value : null;
}

/**
 * The venue QR token the OWNER hands over, from the JCHAT_QR_TOKEN environment variable only (never a command-line argument, so it
 * does not land in the shell history). Accepts the full QR URL or the bare token. The value is a secret: it is never printed, not
 * even in errors — a malformed value only says so. Returns null when the variable is not set.
 */
export function qrTokenFromEnv() {
  const raw = process.env.JCHAT_QR_TOKEN;
  if (raw == null || raw.trim() === '') return null;
  const token = parseVenueQrToken(raw);
  if (!token) {
    console.error('JCHAT_QR_TOKEN is set but is neither a venue QR URL (https://<host>/c/<token>) nor a bare token. Its value is not shown.');
    process.exit(2);
  }
  return token;
}

/** What may be printed about the token: never the value. */
export const qrTokenStatus = (token) => (token ? 'provided' : 'missing');

/**
 * Match check-in / heartbeat as the user (the server expires the presence after 15 min without one). With the owner's venue QR
 * token the server makes the presence active even though the coordinates are simulated; without it the presence stays 'pending'.
 * Only the server's status/reason come back — never the token.
 */
export async function matchCheckIn(client, venue, qrToken = null) {
  const { data, error } = await client.rpc('match_check_in', {
    p_business_id: venue.id,
    p_lat: venue.lat,
    p_lng: venue.lng,
    p_qr_token: qrToken,
    p_mocked: SCRIPT_LOCATION_IS_SIMULATED,
  });
  if (error) return { status: 'error', reason: error.code ?? 'error' };
  return { status: data?.status ?? 'denied', reason: data?.reason ?? null };
}

/** The presence payload the app tracks (screens/chat/usePresenceChannels.ts), built from the user's own public profile. */
export async function presencePayload(client, userId) {
  const { data } = await client.from('public_profiles').select('display_name, username, avatar_url').eq('id', userId).maybeSingle();
  return {
    user_id: userId,
    display_name: data?.display_name || data?.username || 'Guest',
    avatar_url: data?.avatar_url ?? null,
    is_incognito: false,
    nickname: null,
  };
}

/**
 * Joins the shared `presence:<roomId>` Realtime channel keyed by the user id and tracks the payload, exactly like a phone
 * (mobile usePresenceChannels / web ChatRoom.tsx). That channel is what feeds the horizontal profile bar of the venue chat.
 * Resolves with the channel, or null if it could not subscribe in time. The user stays "present" while the socket lives.
 */
export function joinVenuePresence(client, roomId, payload) {
  const channel = client.channel(`presence:${roomId}`, { config: { presence: { key: payload.user_id } } });
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 12_000);
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track(payload);
        clearTimeout(timer);
        resolve(channel);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        resolve(null);
      }
    });
  });
}

export const slug = (text) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
