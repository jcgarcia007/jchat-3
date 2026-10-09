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
 * A client signed in AS the user (so every RLS policy and RPC rule applies exactly as in the apps). Supabase Auth may have
 * hCaptcha on for password sign-ins, which a script cannot solve; so the session comes from a one-time magic-link token
 * minted with the admin API and exchanged with verifyOtp (that exchange is not captcha-gated). If that fails, it falls back
 * to the password. Returns null when no session could be created.
 */
export async function userClient(cfg, admin, user) {
  const client = createClient(cfg.url, cfg.publishable, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: user.email });
    const hash = data?.properties?.hashed_token;
    if (!error && hash) {
      const { data: s, error: e2 } = await client.auth.verifyOtp({ token_hash: hash, type: 'magiclink' });
      if (!e2 && s?.session) return client;
    }
  } catch {
    // fall through to the password
  }
  if (user.password) {
    const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
    if (!error && data?.session) return client;
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

export const slug = (text) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
