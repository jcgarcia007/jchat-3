import { assert, assertEquals, assertNotEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  base64urlDecode, buildClientSecret, bytesToPgBytea, decryptToken, encryptToken, exchangeAuthorizationCode, pgByteaToBytes,
  readAppleConfig, revokeAppleOnDelete, subFromIdToken, type AppleConfig, type FetchFn, type RevokeAdmin,
} from "./appleRevoke.ts";

const UID = "3ddf4a2e-1111-4222-8333-444455556666";
const dec = (s: string) => JSON.parse(new TextDecoder().decode(base64urlDecode(s)));

async function makeConfig(): Promise<{ cfg: AppleConfig; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8)).match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
  const tokenKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  return { cfg: { teamId: "TEAM123456", keyId: "KEY1234567", privateKey: pem, clientId: "com.otunitylabs.jchat", tokenKey }, publicKey: pair.publicKey };
}

Deno.test("client_secret: ES256 header, claims, exp <= 5 min, signature verifies with the public key", async () => {
  const { cfg, publicKey } = await makeConfig();
  const jwt = await buildClientSecret(cfg, 1_800_000_000);
  const [h, c, s] = jwt.split(".");
  assertEquals(dec(h), { alg: "ES256", kid: "KEY1234567", typ: "JWT" });
  assertEquals(dec(c), { iss: "TEAM123456", iat: 1_800_000_000, exp: 1_800_000_300, aud: "https://appleid.apple.com", sub: "com.otunitylabs.jchat" });
  assert(dec(c).exp - dec(c).iat <= 300);
  const sig = base64urlDecode(s);
  assertEquals(sig.length, 64); // raw r||s, not DER
  assert(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, sig, new TextEncoder().encode(`${h}.${c}`)));
});

Deno.test("client_secret: accepts a .p8 pasted with literal \\n", async () => {
  const { cfg } = await makeConfig();
  const jwt = await buildClientSecret({ ...cfg, privateKey: cfg.privateKey.replaceAll("\n", "\\n") });
  assertEquals(jwt.split(".").length, 3);
});

Deno.test("encryption: round trip, bound to the user, random iv, wrong key fails", async () => {
  const { cfg } = await makeConfig();
  const a = await encryptToken("r.refresh.token", cfg.tokenKey, UID);
  const b = await encryptToken("r.refresh.token", cfg.tokenKey, UID);
  assertNotEquals(bytesToPgBytea(a), bytesToPgBytea(b));
  assertEquals(await decryptToken(pgByteaToBytes(bytesToPgBytea(a)), cfg.tokenKey, UID), "r.refresh.token");
  await assertRejects(() => decryptToken(a, cfg.tokenKey, "other-user"));
  const other = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  await assertRejects(() => decryptToken(a, other, UID));
  await assertRejects(() => encryptToken("x", btoa("short"), UID));
});

Deno.test("readAppleConfig lists the NAMES of missing secrets", () => {
  const r = readAppleConfig((n) => (n === "APPLE_TEAM_ID" ? "T" : undefined));
  assertEquals(r.config, null);
  assertEquals(r.missing, ["APPLE_KEY_ID", "APPLE_PRIVATE_KEY", "APPLE_CLIENT_ID", "APPLE_TOKEN_KEY"]);
});

// ── exchange ──
const fakeIdToken = (sub: string) => `x.${btoa(JSON.stringify({ sub })).replace(/=+$/, "")}.y`;

Deno.test("exchange: OK returns the refresh token and the sub; sends code, client_id, no redirect_uri", async () => {
  const { cfg } = await makeConfig();
  let sent: URLSearchParams | undefined;
  const f: FetchFn = (url, init) => {
    assertEquals(url, "https://appleid.apple.com/auth/token");
    sent = init!.body as URLSearchParams;
    return Promise.resolve(new Response(JSON.stringify({ refresh_token: "RT", id_token: fakeIdToken("001.abc") }), { status: 200 }));
  };
  const r = await exchangeAuthorizationCode(cfg, "CODE", f);
  assertEquals(r, { ok: true, refreshToken: "RT", appleSub: "001.abc" });
  assertEquals(sent!.get("grant_type"), "authorization_code");
  assertEquals(sent!.get("client_id"), "com.otunitylabs.jchat");
  assertEquals(sent!.get("code"), "CODE");
  assertEquals(sent!.has("redirect_uri"), false);
});

Deno.test("exchange: Apple 400 invalid_grant -> not ok, only the error code is kept", async () => {
  const { cfg } = await makeConfig();
  const f: FetchFn = () => Promise.resolve(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
  assertEquals(await exchangeAuthorizationCode(cfg, "CODE", f), { ok: false, status: 400, reason: "invalid_grant" });
});

Deno.test("subFromIdToken tolerates garbage", () => {
  assertEquals(subFromIdToken(undefined), null);
  assertEquals(subFromIdToken("nope"), null);
});

// ── revokeAppleOnDelete ──
function fakeAdmin(opts: { row?: { refresh_token_enc: string; client_id: string } | null; lookupError?: boolean; logFails?: boolean }) {
  const logs: Record<string, unknown>[] = [];
  const admin: RevokeAdmin = {
    from(table: string) {
      return {
        select: () => ({
          eq: (col: string, v: string) => {
            assertEquals(table, "apple_tokens");
            assertEquals([col, v], ["user_id", UID]);
            return { maybeSingle: () => Promise.resolve({ data: opts.row ?? null, error: opts.lookupError ? { message: "boom" } : null }) };
          },
        }),
        insert: (row: Record<string, unknown>) => {
          assertEquals(table, "security_logs");
          logs.push(row);
          return Promise.resolve({ error: opts.logFails ? { message: "x" } : null });
        },
      };
    },
  };
  return { admin, logs };
}

async function stored(cfg: AppleConfig) {
  return { refresh_token_enc: bytesToPgBytea(await encryptToken("RT-secret", cfg.tokenKey, UID)), client_id: cfg.clientId };
}
const envOf = (cfg: AppleConfig) => (n: string) =>
  ({ APPLE_TEAM_ID: cfg.teamId, APPLE_KEY_ID: cfg.keyId, APPLE_PRIVATE_KEY: cfg.privateKey, APPLE_CLIENT_ID: cfg.clientId, APPLE_TOKEN_KEY: cfg.tokenKey } as Record<string, string>)[n];

Deno.test("delete: revocation OK -> revoked, token sent as refresh_token, logged apple_revoked, nothing sensitive in logs", async () => {
  const { cfg } = await makeConfig();
  const { admin, logs } = fakeAdmin({ row: await stored(cfg) });
  let body: URLSearchParams | undefined;
  const f: FetchFn = (url, init) => {
    assertEquals(url, "https://appleid.apple.com/auth/revoke");
    body = init!.body as URLSearchParams;
    return Promise.resolve(new Response("", { status: 200 }));
  };
  assertEquals(await revokeAppleOnDelete({ admin, userId: UID, hasAppleIdentity: true, getEnv: envOf(cfg), fetchFn: f }), "revoked");
  assertEquals(body!.get("token"), "RT-secret");
  assertEquals(body!.get("token_type_hint"), "refresh_token");
  assertEquals(logs.map((l) => l.action), ["apple_revoked"]);
  assertEquals(JSON.stringify(logs).includes("RT-secret"), false);
});

Deno.test("delete: Apple answers 400 -> failed, logged apple_revoke_failed apple_400, does not throw", async () => {
  const { cfg } = await makeConfig();
  const { admin, logs } = fakeAdmin({ row: await stored(cfg) });
  const f: FetchFn = () => Promise.resolve(new Response('{"error":"invalid_request"}', { status: 400 }));
  assertEquals(await revokeAppleOnDelete({ admin, userId: UID, hasAppleIdentity: true, getEnv: envOf(cfg), fetchFn: f }), "failed");
  assertEquals(logs[0].action, "apple_revoke_failed");
  assertEquals(logs[0].detail, "apple_400");
  assertEquals(logs[0].target_id, UID);
  assertEquals(logs[0].actor_id, null);
});

Deno.test("delete: network error -> failed (network), does not throw", async () => {
  const { cfg } = await makeConfig();
  const { admin, logs } = fakeAdmin({ row: await stored(cfg) });
  const f: FetchFn = () => Promise.reject(new Error("offline"));
  assertEquals(await revokeAppleOnDelete({ admin, userId: UID, hasAppleIdentity: true, getEnv: envOf(cfg), fetchFn: f }), "failed");
  assertEquals(logs[0].detail, "network");
});

Deno.test("delete: Apple identity but no stored token -> skipped_no_token, Apple not called", async () => {
  const { cfg } = await makeConfig();
  const { admin, logs } = fakeAdmin({ row: null });
  const f: FetchFn = () => { throw new Error("must not call Apple"); };
  assertEquals(await revokeAppleOnDelete({ admin, userId: UID, hasAppleIdentity: true, getEnv: envOf(cfg), fetchFn: f }), "skipped_no_token");
  assertEquals(logs.map((l) => l.action), ["apple_revoke_skipped_no_token"]);
});

Deno.test("delete: no Apple identity -> not_apple, no query, no log", async () => {
  const { admin, logs } = fakeAdmin({ row: null });
  const f: FetchFn = () => { throw new Error("must not call Apple"); };
  assertEquals(await revokeAppleOnDelete({ admin, userId: UID, hasAppleIdentity: false, getEnv: () => undefined, fetchFn: f }), "not_apple");
  assertEquals(logs.length, 0);
});

Deno.test("delete: secrets missing -> failed not_configured:<NAMES>, wrong key -> failed decrypt, lookup error -> failed lookup", async () => {
  const { cfg } = await makeConfig();
  const row = await stored(cfg);
  const a = fakeAdmin({ row });
  assertEquals(await revokeAppleOnDelete({ admin: a.admin, userId: UID, hasAppleIdentity: true, getEnv: () => undefined }), "failed");
  assertEquals(a.logs[0].detail, "not_configured:APPLE_TEAM_ID,APPLE_KEY_ID,APPLE_PRIVATE_KEY,APPLE_CLIENT_ID,APPLE_TOKEN_KEY");

  const b = fakeAdmin({ row });
  const wrong = { ...cfg, tokenKey: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))) };
  assertEquals(await revokeAppleOnDelete({ admin: b.admin, userId: UID, hasAppleIdentity: true, getEnv: envOf(wrong) }), "failed");
  assertEquals(b.logs[0].detail, "decrypt");

  const c = fakeAdmin({ lookupError: true });
  assertEquals(await revokeAppleOnDelete({ admin: c.admin, userId: UID, hasAppleIdentity: true, getEnv: envOf(cfg) }), "failed");
  assertEquals(c.logs[0].detail, "lookup");
});

Deno.test("delete: even if security_logs fails the function still returns (never blocks)", async () => {
  const { cfg } = await makeConfig();
  const { admin } = fakeAdmin({ row: null, logFails: true });
  assertEquals(await revokeAppleOnDelete({ admin, userId: UID, hasAppleIdentity: true, getEnv: envOf(cfg) }), "skipped_no_token");
});
