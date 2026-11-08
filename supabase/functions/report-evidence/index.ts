/**
 * JChat 3.0 — D7: report-evidence Edge Function. Signed URLs (10 min) for the evidence copies of a report; platform admins only.
 * Runtime: Deno (Supabase Edge Functions). verify_jwt is ON (default); the admin check uses the caller's JWT (is_platform_admin()).
 *
 * Deploy:
 *   supabase functions deploy report-evidence --project-ref klfsgcfoahdtkojyqspd
 *
 * Needs migration 268 (reports.evidence, the report-evidence bucket). SUPABASE_URL / SB_PUBLISHABLE_KEY / SB_SECRET_KEY are injected.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";
import { createAdminClient, getPublishableKey } from "../_shared/supabaseAdmin.ts";
import { handleReportEvidence, type EvidenceEntry, type HandlerDeps } from "./handler.ts";

Deno.serve((req: Request): Promise<Response> => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL");
  const anon = getPublishableKey();
  if (!url || !anon) {
    console.error("[report-evidence] SUPABASE_URL / publishable key not set");
    return Promise.resolve(new Response(JSON.stringify({ error: "server_misconfigured" }), { status: 500, headers: { "Content-Type": "application/json" } }));
  }
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } });
  const admin = createAdminClient();
  const deps: HandlerDeps = {
    async callerId() {
      const { data, error } = await userClient.auth.getUser();
      return error || !data.user ? null : data.user.id;
    },
    async isAdmin() {
      const { data, error } = await userClient.rpc("is_platform_admin");
      return !error && data === true;
    },
    async loadEvidence(reportId) {
      const { data, error } = await admin.from("reports").select("evidence").eq("id", reportId).maybeSingle();
      if (error) throw new Error("load_failed");
      if (!data) return null;
      const list = (data as { evidence?: unknown }).evidence;
      return Array.isArray(list) ? (list as EvidenceEntry[]) : [];
    },
    async sign(bucket, paths, ttl) {
      const { data, error } = await admin.storage.from(bucket).createSignedUrls(paths, ttl);
      if (error) throw new Error("sign_failed");
      return paths.map((p) => (data ?? []).find((d: { path: string | null }) => d.path === p)?.signedUrl ?? null);
    },
    async log(actorId, reportId, count) {
      const { error } = await admin.from("security_logs").insert({ actor_id: actorId, action: "evidence_viewed", target_type: "report", target_id: reportId, detail: `files:${count}` });
      if (error) console.error("[report-evidence] security_logs insert failed");
    },
  };
  return handleReportEvidence(req, deps);
});
