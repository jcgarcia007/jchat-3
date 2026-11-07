/**
 * JChat 3.0 — apple-token Edge Function (D3, App Review 5.1.1(v))
 * Runtime: Deno (Supabase Edge Functions)
 *
 * After the native "Sign in with Apple" on iOS the app sends Apple's one-time `authorizationCode` here. The function trades it at
 * https://appleid.apple.com/auth/token for a refresh_token and stores it AES-GCM encrypted in public.apple_tokens (migration 264, RLS
 * without policies: only service_role). delete-account uses it to revoke the token when the person deletes the account.
 *
 * Security: the user id comes from the verified JWT, never from the body; the caller must have an Apple identity, and the `sub` of the id_token Apple
 * returns must equal that identity's provider_id, so nobody can attach a token that is not theirs. Nothing sensitive is logged or returned.
 *
 * Answers: 200 { ok: true } · 401 missing_auth / invalid_session · 400 bad_request · 403 no_apple_identity / apple_sub_mismatch ·
 *          502 apple_exchange_failed · 500 server_misconfigured / store_failed / unexpected.
 *
 * Deploy:  supabase functions deploy apple-token
 * Secrets: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, APPLE_CLIENT_ID (bundle id), APPLE_TOKEN_KEY (see _shared/appleRevoke.ts).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";
import { bytesToPgBytea, encryptToken, exchangeAuthorizationCode, readAppleConfig } from "../_shared/appleRevoke.ts";
import { getPublishableKey, getSecretKey } from "../_shared/supabaseAdmin.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

function failure(code: string, status = 500): Response {
  return jsonResponse({ error: code, code }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return failure("method_not_allowed", 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return failure("missing_auth", 401);

    const body = await req.json().catch(() => null) as { authorizationCode?: unknown } | null;
    const code = typeof body?.authorizationCode === "string" ? body.authorizationCode.trim() : "";
    if (!code || code.length > 2000) return failure("bad_request", 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = getPublishableKey();
    const serviceKey = getSecretKey();
    const { config, missing } = readAppleConfig((n) => Deno.env.get(n));
    if (!supabaseUrl || !anonKey || !serviceKey || !config) {
      console.error(`[apple-token] not configured (missing: ${missing.join(",") || "supabase keys"})`);
      return failure("server_misconfigured");
    }

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return failure("invalid_session", 401);

    const appleIdentity = (user.identities ?? []).find((i) => i.provider === "apple");
    if (!appleIdentity) return failure("no_apple_identity", 403);

    const exchanged = await exchangeAuthorizationCode(config, code);
    if (!exchanged.ok) {
      console.error(`[apple-token] exchange failed (status ${exchanged.status}, ${exchanged.reason})`);
      return failure("apple_exchange_failed", 502);
    }
    const providerId = (appleIdentity.identity_data as { sub?: string } | undefined)?.sub ?? (appleIdentity as { id?: string }).id;
    if (exchanged.appleSub && providerId && exchanged.appleSub !== providerId) {
      console.error("[apple-token] id_token sub does not match the user's apple identity");
      return failure("apple_sub_mismatch", 403);
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const enc = await encryptToken(exchanged.refreshToken, config.tokenKey, user.id);
    const { error: upErr } = await admin.from("apple_tokens").upsert(
      { user_id: user.id, refresh_token_enc: bytesToPgBytea(enc), client_id: config.clientId, created_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    if (upErr) {
      console.error("[apple-token] store failed", upErr.code ?? "");
      return failure("store_failed");
    }
    return jsonResponse({ ok: true });
  } catch (e) {
    console.error("[apple-token] unexpected error", (e as Error)?.name ?? "error");
    return failure("unexpected");
  }
});
