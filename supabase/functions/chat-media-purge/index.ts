/**
 * JChat 3.0 — Lote G: chat-media-purge Edge Function. Removes, through the Storage API, the photos (bucket post-media) and voice notes (bucket voice-notes)
 * of the chat messages that purge_expired_messages() deleted after 24 h (queue chat_media_purge_queue, migration 278).
 * Runtime: Deno (Supabase Edge Functions). JWT verification is off (config.toml): every POST must carry x-push-secret = PUSH_WEBHOOK_SECRET.
 *
 * Deploy (BEFORE applying migration 278):
 *   supabase functions deploy chat-media-purge --project-ref klfsgcfoahdtkojyqspd --no-verify-jwt
 *
 * Secrets: PUSH_WEBHOOK_SECRET (shared with send-push, outbound-emails and evidence-purge); SUPABASE_URL / SB_SECRET_KEY are injected.
 */

import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import { handleChatMediaPurge, type ChatMediaBucket, type HandlerDeps, type QueueRow } from "./handler.ts";

Deno.serve((req: Request): Promise<Response> => {
  const admin = createAdminClient();
  const deps: HandlerDeps = {
    secret: Deno.env.get("PUSH_WEBHOOK_SECRET"),
    async loadRows(ids) {
      const { data, error } = await admin.from("chat_media_purge_queue").select("id, bucket, path").in("id", ids);
      if (error) throw new Error("queue_load_failed");
      return (data ?? []) as QueueRow[];
    },
    async inUse(bucket: ChatMediaBucket, paths) {
      const { data, error } = await admin.rpc("chat_media_paths_in_use", { p_bucket: bucket, p_paths: paths });
      if (error) throw new Error("in_use_failed");
      return ((data ?? []) as unknown[]).filter((v): v is string => typeof v === "string");
    },
    remove: (bucket, paths) => admin.storage.from(bucket).remove(paths),
    async deleteRows(ids) {
      const { error } = await admin.from("chat_media_purge_queue").delete().in("id", ids);
      if (error) throw new Error("queue_delete_failed");
    },
    async markError(ids, text) {
      await admin.from("chat_media_purge_queue").update({ last_error: text }).in("id", ids);
    },
  };
  return handleChatMediaPurge(req, deps);
});
