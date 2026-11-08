/**
 * JChat 3.0 — D5: outbound-emails Edge Function. Delivers the rows of public.outbound_emails that outbound_emails_retry() (migration 266) hands it.
 * Runtime: Deno (Supabase Edge Functions). JWT verification is off (config.toml): every POST must carry x-push-secret = PUSH_WEBHOOK_SECRET.
 *
 * Deploy:
 *   supabase functions deploy outbound-emails --project-ref klfsgcfoahdtkojyqspd --no-verify-jwt
 *
 * Needs migration 272 applied FIRST (it adds the kind values, to_email and reply_to this function selects).
 *
 * Secrets: PUSH_WEBHOOK_SECRET (shared with send-push), RESEND_API_KEY, optional NOTIFICATIONS_FROM; SUPABASE_URL / SB_SECRET_KEY are injected.
 */

import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import { handleOutboundEmails, type HandlerDeps } from "./handler.ts";

Deno.serve((req: Request): Promise<Response> => {
  const admin = createAdminClient();
  const deps: HandlerDeps = {
    secret: Deno.env.get("PUSH_WEBHOOK_SECRET"),
    resendKey: Deno.env.get("RESEND_API_KEY"),
    from: Deno.env.get("NOTIFICATIONS_FROM") ?? undefined,
    async loadRows(ids) {
      const { data, error } = await admin
        .from("outbound_emails")
        .select("id, kind, user_id, to_email, reply_to, payload, attempts")
        .in("id", ids)
        .in("status", ["pending", "failed"]);
      if (error) throw new Error("emails_load_failed");
      return (data ?? []) as Awaited<ReturnType<HandlerDeps["loadRows"]>>;
    },
    async recipient(uid) {
      const { data: u } = await admin.auth.admin.getUserById(uid);
      const email = u?.user?.email;
      if (!email) return null;
      const { data: row } = await admin.from("users").select("language").eq("id", uid).maybeSingle();
      return { email, language: (row as { language?: string } | null)?.language === "en" ? "en" : "es" };
    },
    async markRow(id, status, error) {
      await admin
        .from("outbound_emails")
        .update({ status, sent_at: status === "sent" ? new Date().toISOString() : null, last_error: status === "sent" ? null : (error ?? null) })
        .eq("id", id);
    },
  };
  return handleOutboundEmails(req, deps);
});
