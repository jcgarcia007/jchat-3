/**
 * JChat 3.0 — Sign in with Apple: token exchange and revocation (App Review 5.1.1(v), D3).
 *
 * The native iOS login (services/appleSignIn.ios.ts) hands Apple's one-time authorizationCode to the `apple-token` function, which
 * trades it for a refresh_token and stores it ENCRYPTED in public.apple_tokens (migration 264). When the account is deleted,
 * `revokeAppleOnDelete` revokes that token with Apple's REST API. A failure never blocks the deletion: it is logged and the delete goes on.
 *
 * Encryption: AES-256-GCM done HERE with Web Crypto, key in the secret APPLE_TOKEN_KEY (base64 of 32 bytes). The key never reaches
 * the database, so a dump of apple_tokens alone is useless (pgcrypto would send the key to Postgres as a SQL parameter, and Vault
 * would put a decryptable secret next to the data).
 *
 * Secrets (Edge Functions): APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (the .p8, PKCS#8 PEM), APPLE_CLIENT_ID (the bundle id
 * com.otunitylabs.jchat: the native flow uses it, not the Services ID), APPLE_TOKEN_KEY.
 *
 * Nothing sensitive is ever logged or returned: no token, no code, no client_secret JWT, no key.
 */

export const APPLE_AUDIENCE = "https://appleid.apple.com";
export const APPLE_TOKEN_URL = `${APPLE_AUDIENCE}/auth/token`;
export const APPLE_REVOKE_URL = `${APPLE_AUDIENCE}/auth/revoke`;

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface AppleConfig {
  teamId: string;
  keyId: string;
  privateKey: string;
  clientId: string;
  tokenKey: string;
}

/** Reads the five secrets; returns the NAMES of the missing ones instead of values. */
export function readAppleConfig(get: (name: string) => string | undefined): { config: AppleConfig | null; missing: string[] } {
  const names = ["APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY", "APPLE_CLIENT_ID", "APPLE_TOKEN_KEY"] as const;
  const values = names.map((n) => (get(n) ?? "").trim());
  const missing = names.filter((_, i) => !values[i]);
  if (missing.length > 0) return { config: null, missing };
  return { config: { teamId: values[0], keyId: values[1], privateKey: values[2], clientId: values[3], tokenKey: values[4] }, missing: [] };
}

// ── base64 helpers ──────────────────────────────────────────────────────────────────────────────

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  return fromBase64(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

// ── client_secret (JWT ES256) ───────────────────────────────────────────────────────────────────

/** The .p8 from developer.apple.com, tolerating `\n` pasted literally into the secret. */
export function pemToPkcs8(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [A-Z ]+-----/, "")
    .replace(/-----END [A-Z ]+-----/, "")
    .replace(/\s+/g, "");
  return fromBase64(body);
}

/** Apple's client_secret: ES256 JWT, iss=team, sub=client, aud=appleid, exp ≤ 5 min (Apple allows up to 6 months; we use 5 minutes). */
export async function buildClientSecret(
  cfg: Pick<AppleConfig, "teamId" | "keyId" | "clientId" | "privateKey">,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const header = { alg: "ES256", kid: cfg.keyId, typ: "JWT" };
  const claims = { iss: cfg.teamId, iat: nowSeconds, exp: nowSeconds + 300, aud: APPLE_AUDIENCE, sub: cfg.clientId };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(cfg.privateKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  // Web Crypto returns the raw r||s (IEEE P1363) form, which is what JWS ES256 wants.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(signingInput)));
  return `${signingInput}.${base64url(sig)}`;
}

// ── encryption of the refresh_token (AES-256-GCM) ───────────────────────────────────────────────

async function aesKey(tokenKeyB64: string): Promise<CryptoKey> {
  const raw = fromBase64(tokenKeyB64.trim());
  if (raw.length !== 32) throw new Error("apple_token_key_invalid");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** iv (12 bytes) || ciphertext+tag. The user id is bound as additional data so a row cannot be replayed under another user. */
export async function encryptToken(plain: string, tokenKeyB64: string, userId: string): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) }, await aesKey(tokenKeyB64), new TextEncoder().encode(plain)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return out;
}

export async function decryptToken(blob: Uint8Array, tokenKeyB64: string, userId: string): Promise<string> {
  if (blob.length < 12 + 16) throw new Error("apple_token_blob_invalid");
  const iv = blob.slice(0, 12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) }, await aesKey(tokenKeyB64), blob.slice(12));
  return new TextDecoder().decode(pt);
}

/** bytea <-> PostgREST: written as '\x…' hex, read back the same way. */
export function bytesToPgBytea(b: Uint8Array): string {
  return "\\x" + [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function pgByteaToBytes(v: string): Uint8Array<ArrayBuffer> {
  const hex = v.startsWith("\\x") ? v.slice(2) : v;
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// ── Apple REST calls ────────────────────────────────────────────────────────────────────────────

export type ExchangeResult =
  | { ok: true; refreshToken: string; appleSub: string | null }
  | { ok: false; status: number; reason: string };

/** authorizationCode → refresh_token. Native codes take no redirect_uri. Apple's error body is read only for its `error` code. */
export async function exchangeAuthorizationCode(cfg: AppleConfig, code: string, fetchFn: FetchFn = fetch): Promise<ExchangeResult> {
  const clientSecret = await buildClientSecret(cfg);
  const res = await fetchFn(APPLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: clientSecret, code, grant_type: "authorization_code" }),
  });
  const body = await res.json().catch(() => null) as { refresh_token?: string; id_token?: string; error?: string } | null;
  if (!res.ok || !body?.refresh_token) {
    return { ok: false, status: res.status, reason: typeof body?.error === "string" ? body.error.slice(0, 40) : "no_refresh_token" };
  }
  return { ok: true, refreshToken: body.refresh_token, appleSub: subFromIdToken(body.id_token) };
}

/** `sub` of Apple's id_token (received straight from Apple over TLS, so it is not re-verified). */
export function subFromIdToken(idToken: string | undefined): string | null {
  try {
    if (!idToken) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(idToken.split(".")[1]))) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function revokeRefreshToken(cfg: AppleConfig, refreshToken: string, fetchFn: FetchFn = fetch): Promise<{ ok: boolean; status: number }> {
  const clientSecret = await buildClientSecret(cfg);
  const res = await fetchFn(APPLE_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: clientSecret, token: refreshToken, token_type_hint: "refresh_token" }),
  });
  return { ok: res.ok, status: res.status };
}

// ── used by delete-account ──────────────────────────────────────────────────────────────────────

export interface RevokeAdmin {
  from(table: string): {
    select(cols: string): { eq(col: string, v: string): { maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }> } };
    insert(row: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
  };
}

export type RevokeOutcome = "not_apple" | "revoked" | "skipped_no_token" | "failed";

/**
 * Tries to revoke the person's Apple token before the account is deleted. NEVER throws and never blocks the delete.
 * Logged in security_logs (actor null, target = the user; detail carries only a status/code, never a token):
 *   apple_revoked · *   apple_revoke_skipped_no_token · apple_revoke_failed (detail: not_configured:<NAMES> | apple_<status> | decrypt | lookup | network)
 */
export async function revokeAppleOnDelete(args: {
  admin: RevokeAdmin;
  userId: string;
  hasAppleIdentity: boolean;
  getEnv: (name: string) => string | undefined;
  fetchFn?: FetchFn;
}): Promise<RevokeOutcome> {
  const { admin, userId, hasAppleIdentity, getEnv } = args;
  if (!hasAppleIdentity) return "not_apple";

  const log = async (action: string, detail: string | null) => {
    try {
      const { error } = await admin.from("security_logs").insert({ actor_id: null, action, target_type: "user", target_id: userId, detail });
      if (error) console.error(`[delete-account] security_logs insert failed (${action})`);
    } catch {
      console.error(`[delete-account] security_logs insert threw (${action})`);
    }
  };

  try {
    const { data, error } = await admin.from("apple_tokens").select("refresh_token_enc, client_id").eq("user_id", userId).maybeSingle();
    if (error) {
      await log("apple_revoke_failed", "lookup");
      return "failed";
    }
    const row = data as { refresh_token_enc: string; client_id: string } | null;
    if (!row) {
      await log("apple_revoke_skipped_no_token", null);
      return "skipped_no_token";
    }
    const { config, missing } = readAppleConfig(getEnv);
    if (!config) {
      await log("apple_revoke_failed", `not_configured:${missing.join(",")}`);
      return "failed";
    }
    let token: string;
    try {
      token = await decryptToken(pgByteaToBytes(row.refresh_token_enc), config.tokenKey, userId);
    } catch {
      await log("apple_revoke_failed", "decrypt");
      return "failed";
    }
    // The token belongs to the client it was issued for (stored with it); the secret must use that same client.
    const res = await revokeRefreshToken({ ...config, clientId: row.client_id || config.clientId }, token, args.fetchFn ?? fetch);
    if (!res.ok) {
      await log("apple_revoke_failed", `apple_${res.status}`);
      return "failed";
    }
    await log("apple_revoked", null);
    return "revoked";
  } catch {
    await log("apple_revoke_failed", "network");
    return "failed";
  }
}
