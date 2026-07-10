/**
 * JChat 3.0 — Delete Account Edge Function (M6)
 * Runtime: Deno (Supabase Edge Functions)
 *
 * Hard-deletes the CALLER's account. Deleting the row in auth.users cascades
 * (ON DELETE CASCADE) into public.users and every piece of personal content
 * (posts, comments, follows, blocks, DMs, businesses, notifications,
 * room_members, loyalty, reservations, reviews, stories, …). SET NULL columns
 * (messages, orders, gifts, offers, logs) anonymise themselves.
 *
 * radius_increase_requests references the user with NO ACTION FKs, so those
 * rows must be cleared BEFORE the delete or the cascade fails.
 *
 * Security (P0-3): the user id is ALWAYS taken from the verified JWT, never
 * from the request body — otherwise any caller could delete another account.
 *
 * Deploy:
 *   supabase functions deploy delete-account
 *
 * Required env vars (auto-injected by Supabase unless noted):
 *   SUPABASE_URL              — project URL
 *   SUPABASE_ANON_KEY         — anon key (to verify the caller's JWT)
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (admin API; auth.users delete)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // 1. Auth — identify the caller from the JWT (never from the body).
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing or invalid Authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error("[delete-account] SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY not set");
      return jsonResponse({ error: "Internal server error" }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return jsonResponse({ error: "Invalid session" }, 401);
    }
    const userId = user.id;

    // 2. Admin client (service_role) — required to delete from auth.users.
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 3. Clear NO ACTION references that would block the cascade.
    //    requested_by → the user owns these requests, delete them.
    //    reviewed_by  → the user reviewed OTHER users' requests, only unlink.
    const { error: reqDelErr } = await admin
      .from("radius_increase_requests")
      .delete()
      .eq("requested_by", userId);
    if (reqDelErr) {
      console.error("[delete-account] radius_increase_requests delete failed", reqDelErr);
      return jsonResponse({ error: "Failed to clear related requests" }, 500);
    }

    const { error: reqUpdErr } = await admin
      .from("radius_increase_requests")
      .update({ reviewed_by: null })
      .eq("reviewed_by", userId);
    if (reqUpdErr) {
      console.error("[delete-account] radius_increase_requests reviewer unlink failed", reqUpdErr);
      return jsonResponse({ error: "Failed to unlink reviewed requests" }, 500);
    }

    // 4. Hard delete auth.users → cascades public.users and all personal content.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error("[delete-account] deleteUser failed", delErr);
      return jsonResponse({ error: delErr.message }, 500);
    }

    return jsonResponse({ success: true }, 200);
  } catch (e) {
    console.error("[delete-account] unexpected error", e);
    return jsonResponse({ error: String(e) }, 500);
  }
});
