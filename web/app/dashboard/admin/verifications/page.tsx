/**
 * JChat 3.0 — Admin: Business Verifications (manual approval, 2026-07-12)
 *
 * Platform-admin-only page to manually approve/revoke businesses. Approval is what
 * sets businesses.status='verified' — the flag that enables Stripe payments — via the
 * is_platform_admin()-gated RPC admin_set_business_verification().
 *
 * Access: gated server-side. Non-admins get notFound() (404) — NOT a 403 — so the page
 * does not reveal its own existence. (The dashboard layout already handles auth +
 * plan/admin access; this is the per-page admin-only gate.)
 */

import { notFound } from "next/navigation";
import {
  createSupabaseServerClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import VerificationsClient from "./VerificationsClient";

// Always evaluate the gate per-request (auth-dependent).
export const dynamic = "force-dynamic";

export default async function AdminVerificationsPage() {
  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) notFound();

    const { data: isAdmin } = await supabase.rpc("is_platform_admin");
    if (!isAdmin) notFound();
  }

  return <VerificationsClient />;
}
