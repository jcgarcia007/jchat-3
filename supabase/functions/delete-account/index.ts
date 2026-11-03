/**
 * JChat 3.0 — Delete Account Edge Function (M6)
 * Runtime: Deno (Supabase Edge Functions)
 *
 * Hard-deletes the CALLER's account. First it purges the person's Storage objects (photos, voice notes: deleting the user never
 * removes files), then deleting the row in auth.users cascades (ON DELETE CASCADE) into public.users and every piece of
 * personal content (posts, comments, follows, blocks, DMs, businesses, notifications, room_members, loyalty, reservations,
 * reviews, stories, …). Since migration 255 the chat messages (messages.user_id), pinned_messages.pinned_by and
 * disputes.opened_by are ON DELETE CASCADE too: a deleted account's messages disappear for everyone (decision 2026-11).
 * Only gifts.from_user / to_user are SET NULL (the gift stays, without the person); orders, offers and logs keep their rows
 * without the person's identity (SET NULL on nullable columns).
 *
 * Stripe: users.stripe_customer_id / stripe_subscription_id are NOT touched here (cancelling the subscription and the customer
 * belongs to the business-owner deletion flow, not yet built; see the audit, B2-3).
 *
 * radius_increase_requests references the user with NO ACTION FKs, so those
 * rows must be cleared BEFORE the delete or the cascade fails.
 *
 * Security (P0-3): the user id is ALWAYS taken from the verified JWT, never
 * from the request body — otherwise any caller could delete another account.
 *
 * Errors answer with a CODED reason (never the raw error text): the body is { error: <code>, code: <code> } and the app shows
 * "We couldn't delete your account. Write to us at <contact> (code: <code>)". Codes:
 *   401 missing_auth · 401 invalid_session · 405 method_not_allowed
 *   409 owner_has_business   — the caller owns a business (nothing was deleted)
 *   500 server_misconfigured · owner_check_failed · cleanup_failed
 *   500 storage_purge_failed — the person's files could not be removed; NOTHING else was deleted, the person can try again
 *   500 fk_violation         — the database refused the delete (a foreign key / NOT NULL stops the cascade; see migration 255)
 *   500 delete_failed        — the auth admin API failed for another reason
 *   500 unexpected
 * Old name of the 409 code: "owns_business" (the clients accept both while the app update rolls out).
 *
 * Deploy:
 *   supabase functions deploy delete-account
 *
 * Required env vars (auto-injected by Supabase unless noted):
 *   SUPABASE_URL              — project URL
 *   SB_PUBLISHABLE_KEY         — anon key (to verify the caller's JWT)
 *   SB_SECRET_KEY — service role key (admin API; auth.users delete)
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";
import { classifyDeleteError } from "../_shared/deleteAccountErrors.ts";
import { buildPurgePlan, purgePlan, type StorageApi } from "../_shared/deleteAccountStorage.ts";
import { getPublishableKey, getSecretKey } from "../_shared/supabaseAdmin.ts";

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

/** An error answer: a short code only (the details stay in the function logs). */
function failure(code: string, status = 500): Response {
  return jsonResponse({ error: code, code }, status);
}

/** Reads the paths the database knows, builds the plan from the verified uid and deletes the objects. Throws on any error. */
async function purgeUserStorage(admin: SupabaseClient, userId: string): Promise<number> {
  const PAGE = 1000;
  const conversationIds: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from("dm_messages").select("conversation_id").eq("sender_id", userId).range(from, from + PAGE - 1);
    if (error) throw new Error(`dm_messages: ${error.message}`);
    for (const row of data ?? []) conversationIds.push((row as { conversation_id: string }).conversation_id);
    if ((data ?? []).length < PAGE) break;
  }
  const voiceRoomPaths: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from("messages").select("media_url").eq("user_id", userId).like("media_url", "room/%").range(from, from + PAGE - 1);
    if (error) throw new Error(`messages: ${error.message}`);
    for (const row of data ?? []) voiceRoomPaths.push((row as { media_url: string }).media_url);
    if ((data ?? []).length < PAGE) break;
  }
  const plan = buildPurgePlan(userId, { conversationIds, voiceRoomPaths });
  return await purgePlan(admin.storage as unknown as StorageApi, plan);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return failure("method_not_allowed", 405);
  }

  try {
    // 1. Auth — identify the caller from the JWT (never from the body).
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return failure("missing_auth", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = getPublishableKey();
    const serviceKey = getSecretKey();
    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error("[delete-account] SUPABASE_URL / publishable key / secret key not set");
      return failure("server_misconfigured");
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return failure("invalid_session", 401);
    }
    const userId = user.id;

    // 2. Admin client (service_role) — required to delete from auth.users.
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 2b. A business owner cannot delete the account: businesses.owner_id is ON DELETE CASCADE, so the venue (menu,
    //     staff, history) would disappear with it. They must close or transfer the business first. Nothing has been
    //     deleted at this point.
    const { data: owned, error: ownedErr } = await admin
      .from("businesses")
      .select("id")
      .eq("owner_id", userId)
      .limit(1);
    if (ownedErr) {
      console.error("[delete-account] owner check failed", ownedErr);
      return failure("owner_check_failed");
    }
    if ((owned ?? []).length > 0) {
      return failure("owner_has_business", 409);
    }

    // 3. Clear NO ACTION references that would block the cascade.
    //    requested_by → the user owns these requests, delete them.
    //    reviewed_by  → the user reviewed OTHER users' requests, only unlink.
    const { error: reqDelErr } = await admin
      .from("radius_increase_requests")
      .delete()
      .eq("requested_by", userId);
    if (reqDelErr) {
      console.error("[delete-account] radius_increase_requests delete failed", reqDelErr);
      return failure("cleanup_failed");
    }

    const { error: reqUpdErr } = await admin
      .from("radius_increase_requests")
      .update({ reviewed_by: null })
      .eq("reviewed_by", userId);
    if (reqUpdErr) {
      console.error("[delete-account] radius_increase_requests reviewer unlink failed", reqUpdErr);
      return failure("cleanup_failed");
    }

    // 3b. Purge Storage BEFORE the cascade: the rows that tell us where some files are (voice-note paths in messages, the
    //     conversations of dm-media) disappear with the user. If this fails nothing else has been deleted: answer and let the
    //     person retry (the files already removed are simply gone; the account is intact).
    try {
      const removed = await purgeUserStorage(admin, userId);
      console.log(`[delete-account] storage purged (${removed} objects)`);
    } catch (purgeErr) {
      console.error("[delete-account] storage purge failed", purgeErr);
      return failure("storage_purge_failed");
    }

    // 4. Hard delete auth.users → cascades public.users and all personal content.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      const code = classifyDeleteError(delErr.message);
      console.error(`[delete-account] deleteUser failed (${code})`, delErr);
      return failure(code);
    }

    return jsonResponse({ success: true }, 200);
  } catch (e) {
    console.error("[delete-account] unexpected error", e);
    return failure("unexpected");
  }
});
