/**
 * JChat 3.0 — Delete Account Edge Function (M6)
 * Runtime: Deno (Supabase Edge Functions)
 *
 * Hard-deletes the CALLER's account. First it purges the person's Storage objects (photos, voice notes: deleting the user never
 * removes files; the list comes from the RPC storage_user_object_paths, migration 258, which must be applied before this function is
 * deployed: without it every delete answers storage_purge_failed), then deleting the row in auth.users cascades (ON DELETE CASCADE) into public.users and every piece of
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
 *   409 owner_has_business   — LEGACY: the caller owns a venue and did not send confirmOwnerClose (old app); nothing was deleted
 *   409 owner_open_orders    — (owner) orders in progress / open tables: { open: [{business_id, business_name, kind, n}] }; nothing was closed
 *   409 stripe_balance_pending — (owner) Connect balance > 0: { balances: [{business_id, business_name, currency, amount(cents)}] }; nothing was closed
 *   502 stripe_balance_check_failed · subscription_cancel_failed — (owner) Stripe failed; nothing was closed
 *   500 owner_close_failed   — (owner) a venue could not be closed: { state: { subscriptionCancelled, closed, total } }; retry is safe
 *   500 server_misconfigured · owner_check_failed · cleanup_failed
 *   500 storage_purge_failed — the person's files could not be removed; NOTHING else was deleted, the person can try again
 *   500 fk_violation         — the database refused the delete (a foreign key / NOT NULL stops the cascade; see migration 255)
 *   500 delete_failed        — the auth admin API failed for another reason
 *   500 unexpected
 * Old name of the 409 code: "owns_business" (the clients accept both while the app update rolls out).
 *
 * Owner (D4): venues are CLOSED, not deleted; see _shared/ownerClose.ts (steps, codes) and migration 265. Extra secrets: STRIPE_SECRET_KEY (exists),
 * RESEND_API_KEY (exists, safety-alert); optional NOTIFICATIONS_FROM (sender of the reservation e-mails, default "JChat <noreply@jchat.cloud>").
 *
 * Sign in with Apple: before the delete the person's Apple refresh token (stored by `apple-token`) is revoked with Apple's REST API;
 * a failure is logged in security_logs and never blocks the deletion (_shared/appleRevoke.ts). Secrets: APPLE_TEAM_ID, APPLE_KEY_ID,
 * APPLE_PRIVATE_KEY, APPLE_CLIENT_ID, APPLE_TOKEN_KEY (without them the revoke is skipped and logged as not_configured).
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
import { purgeUserObjects, type PurgeAdmin } from "../_shared/deleteAccountStorage.ts";
import { revokeAppleOnDelete, type RevokeAdmin } from "../_shared/appleRevoke.ts";
import { closeOwnerBusinesses, ownerPreflight, type OwnerDeps } from "../_shared/ownerClose.ts";
import { deliverClosedReservationEmails, type EmailDeps } from "../_shared/ownerCloseEmails.ts";
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

/** An error answer with extra fields (amounts, open items, state): still a short code first, never raw error text. */
function failureWith(code: string, status: number, extra: Record<string, unknown>): Response {
  return jsonResponse({ error: code, code, ...extra }, status);
}

/** Owner flow (D4): the database and Stripe, behind the interfaces _shared/ownerClose.ts is tested with. Stripe is loaded only when it is needed. */
function buildOwnerDeps(admin: SupabaseClient, userId: string): OwnerDeps {
  let stripePromise: Promise<import("npm:stripe@16.2.0").default> | null = null;
  const getStripe = () => {
    stripePromise ??= (async () => {
      const key = Deno.env.get("STRIPE_SECRET_KEY");
      if (!key) throw new Error("stripe_not_configured");
      const { default: Stripe } = await import("npm:stripe@16.2.0");
      return new Stripe(key, { apiVersion: "2024-06-20" });
    })();
    return stripePromise;
  };
  return {
    async listOwned(uid) {
      const { data, error } = await admin.from("businesses").select("id, name, city, stripe_account_id").eq("owner_id", uid);
      if (error) throw new Error("owner_check_failed");
      return (data ?? []) as { id: string; name: string; city: string | null; stripe_account_id: string | null }[];
    },
    async openOrders(uid) {
      const { data, error } = await admin.rpc("owner_open_orders", { p_owner: uid });
      if (error) throw new Error("owner_check_failed");
      return ((data ?? []) as { business_id: string; business_name: string; kind: "orders" | "tabs"; n: number | string }[])
        .map((r) => ({ ...r, n: Number(r.n) }));
    },
    async subscriptionId(uid) {
      const { data, error } = await admin.from("users").select("stripe_subscription_id").eq("id", uid).maybeSingle();
      if (error) throw new Error("owner_check_failed");
      return (data as { stripe_subscription_id: string | null } | null)?.stripe_subscription_id ?? null;
    },
    async closeBusiness(businessId, uid) {
      const { data, error } = await admin.rpc("owner_close_business", { p_business_id: businessId, p_owner: uid });
      if (error) throw new Error(error.message);
      return (data ?? {}) as { already?: boolean; email_ids?: string[] };
    },
    async log(action, targetId, detail) {
      try {
        await admin.from("security_logs").insert({ actor_id: null, action, target_type: targetId ? "business" : "user", target_id: targetId ?? userId, detail });
      } catch {
        console.error(`[delete-account] security_logs insert threw (${action})`);
      }
    },
    stripe: {
      async balance(accountId) {
        const b = await (await getStripe()).balance.retrieve({}, { stripeAccount: accountId });
        return {
          available: b.available.map((l) => ({ currency: l.currency, amount: l.amount })),
          pending: b.pending.map((l) => ({ currency: l.currency, amount: l.amount })),
        };
      },
      async cancelSubscription(subscriptionId) {
        // Immediately, no proration, no refund of the period already paid.
        await (await getStripe()).subscriptions.cancel(subscriptionId, { prorate: false, invoice_now: false });
      },
      async disconnectAccount(accountId) {
        await (await getStripe()).accounts.del(accountId);
      },
    },
  };
}

function buildEmailDeps(admin: SupabaseClient): EmailDeps {
  return {
    async loadRows(ids) {
      const { data, error } = await admin.from("outbound_emails").select("id, user_id, payload, attempts").in("id", ids);
      if (error) throw new Error("emails_load_failed");
      return (data ?? []) as Awaited<ReturnType<EmailDeps["loadRows"]>>;
    },
    async recipient(uid) {
      const { data: u } = await admin.auth.admin.getUserById(uid);
      const email = u?.user?.email;
      if (!email) return null;
      const { data: row } = await admin.from("users").select("language").eq("id", uid).maybeSingle();
      return { email, language: (row as { language?: string } | null)?.language === "en" ? "en" : "es" };
    },
    async markRow(id, status, attempts) {
      await admin.from("outbound_emails").update({ status, attempts, sent_at: status === "sent" ? new Date().toISOString() : null }).eq("id", id);
    },
    resendKey: Deno.env.get("RESEND_API_KEY"),
    from: Deno.env.get("NOTIFICATIONS_FROM") ?? undefined,
  };
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

    // 2b. Business owner (D4). Their venues are CLOSED (not deleted) before the account goes: businesses.owner_id is ON DELETE CASCADE, so
    //     closing sets owner_id to NULL first and the cascade never reaches the venue, its orders or its payments.
    //     Body: { check: true } = dry run for the app's screens (nothing changes; answers the owner's venues or the blocker);
    //           { confirmOwnerClose: true } = the person confirmed the owner screen. A request WITHOUT it (an old app version that only
    //           showed the generic text) still gets the legacy 409 owner_has_business and nothing is touched.
    const reqBody = await req.json().catch(() => null) as { check?: unknown; confirmOwnerClose?: unknown } | null;
    const checkOnly = reqBody?.check === true;
    const confirmOwnerClose = reqBody?.confirmOwnerClose === true;
    const ownerDeps = buildOwnerDeps(admin, userId);

    let ownsVenues: boolean;
    try {
      ownsVenues = (await ownerDeps.listOwned(userId)).length > 0;
    } catch (ownedErr) {
      console.error("[delete-account] owner check failed", ownedErr);
      return failure("owner_check_failed");
    }

    if (checkOnly) {
      if (!ownsVenues) return jsonResponse({ owner: false });
      try {
        const pre = await ownerPreflight(ownerDeps, userId);
        if (pre.kind === "ok") return jsonResponse({ owner: true, businesses: pre.businesses });
        if (pre.kind === "not_owner") return jsonResponse({ owner: false });
        const { kind: _k, status, code, ...extra } = pre;
        return failureWith(code, status, extra);
      } catch (e) {
        console.error("[delete-account] owner preflight failed", e);
        return failure("owner_check_failed");
      }
    }

    if (ownsVenues) {
      if (!confirmOwnerClose) return failure("owner_has_business", 409);
      try {
        const pre = await ownerPreflight(ownerDeps, userId);
        if (pre.kind === "blocked") {
          const { kind: _k, status, code, ...extra } = pre;
          return failureWith(code, status, extra);
        }
        const closed = await closeOwnerBusinesses(ownerDeps, userId);
        if (!closed.ok) {
          console.error(`[delete-account] owner close stopped (${closed.code}) closed ${closed.state.closed}/${closed.state.total}, subscription cancelled: ${closed.state.subscriptionCancelled}`);
          return failureWith(closed.code, closed.status, { state: closed.state });
        }
        // Reservation e-mails (best effort; the rows are already queued by the database).
        try {
          const report = await deliverClosedReservationEmails(buildEmailDeps(admin), closed.emailIds);
          console.log(`[delete-account] owner close: ${closed.state.closed} venue(s), emails sent ${report.sent} failed ${report.failed} skipped ${report.skipped} pending ${report.pending}`);
        } catch {
          console.error("[delete-account] reservation emails threw");
        }
      } catch (e) {
        console.error("[delete-account] owner flow failed", e);
        return failure("owner_close_failed");
      }
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

    // 3b. Purge Storage BEFORE the cascade. Which objects are the person's comes from storage.objects itself (RPC
    //     storage_user_object_paths, migration 258; service_role only): the app's tables cannot be trusted for it (messages.media_url
    //     is NULL in production while voice-notes has files). If this fails nothing else has been deleted: answer and let the person
    //     retry (the files already removed are simply gone; the account is intact).
    try {
      const removed = await purgeUserObjects(admin as unknown as PurgeAdmin, userId);
      console.log(`[delete-account] storage purged (${removed} objects)`);
    } catch (purgeErr) {
      console.error("[delete-account] storage purge failed", purgeErr);
      return failure("storage_purge_failed");
    }

    // 3c. Sign in with Apple (guideline 5.1.1(v)): revoke the person's Apple token. It runs after the storage purge (a failed purge aborts
    //     the delete with the account intact, so nothing must be revoked yet) and NEVER blocks the deletion: it logs to security_logs
    //     (apple_revoked / apple_revoke_skipped_no_token / apple_revoke_failed) and the delete goes on.
    const apple = await revokeAppleOnDelete({
      admin: admin as unknown as RevokeAdmin,
      userId,
      hasAppleIdentity: (user.identities ?? []).some((i) => i.provider === "apple"),
      getEnv: (name) => Deno.env.get(name),
    });
    console.log(`[delete-account] apple revoke: ${apple}`);

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
