/**
 * JChat 3.0 — D7: evidence-purge Edge Function. Removes the copies of report evidence whose report was purged (retention_purge, migration 268).
 * Runtime: Deno (Supabase Edge Functions). JWT verification is off (config.toml): every POST must carry x-push-secret = PUSH_WEBHOOK_SECRET.
 *
 * Deploy:
 *   supabase functions deploy evidence-purge --project-ref klfsgcfoahdtkojyqspd --no-verify-jwt
 *
 * Secrets: PUSH_WEBHOOK_SECRET (shared with send-push and outbound-emails); SUPABASE_URL / SB_SECRET_KEY are injected.
 */

import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import { EVIDENCE_BUCKET, handleEvidencePurge, type HandlerDeps, type QueueRow } from "./handler.ts";

Deno.serve((req: Request): Promise<Response> => {
  const admin = createAdminClient();
  const deps: HandlerDeps = {
    secret: Deno.env.get("PUSH_WEBHOOK_SECRET"),
    async loadRows(ids) {
      const { data, error } = await admin.from("evidence_purge_queue").select("id, bucket, path").in("id", ids);
      if (error) throw new Error("queue_load_failed");
      return (data ?? []) as QueueRow[];
    },
    remove: (paths) => admin.storage.from(EVIDENCE_BUCKET).remove(paths),
    async deleteRows(ids) {
      const { error } = await admin.from("evidence_purge_queue").delete().in("id", ids);
      if (error) throw new Error("queue_delete_failed");
    },
    async markError(ids, text) {
      await admin.from("evidence_purge_queue").update({ last_error: text }).in("id", ids);
    },
  };
  return handleEvidencePurge(req, deps);
});
