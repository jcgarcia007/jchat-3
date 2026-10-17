/**
 * JChat 3.0 — Business Verification API Route (Task 2.2)
 * Former server-side handler for the owner verification steps (removed: see below).
 * Uses supabaseAdmin (service role) — never imported in client components.
 *
 * POST /api/verify
 * Body: { action, business_id, ...step-specific fields }
 *
 * Every action (identity_status, generate_code, submit_selfie, send_sms, verify_sms) answers 410 { error: "verification_steps_removed" }
 * since 2026-10-17; the owner flow is one "in review" screen and an admin approves from /super-admin/verification.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Auth gate (P0-3): assert the caller owns `businessId` (or is a platform admin).
 * Returns null when allowed, or a 403/404/500 NextResponse. Ownership is read with the
 * service-role client so it can't be spoofed; the caller identity is the verified
 * `authUserId` from the cookie-session JWT — NEVER body.business_id alone.
 */
async function assertOwnerOrAdmin(
  businessId: string,
  authUserId: string
): Promise<NextResponse | null> {
  const { data: biz, error } = await supabaseAdmin
    .from("businesses")
    .select("owner_id")
    .eq("id", businessId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!biz) return NextResponse.json({ error: "Business not found." }, { status: 404 });
  if (biz.owner_id === authUserId) return null;

  const { data: admin } = await supabaseAdmin
    .from("admin_roles")
    .select("user_id")
    .eq("user_id", authUserId)
    .maybeSingle();
  if (admin) return null;

  return NextResponse.json(
    { error: "Forbidden: not the owner of this business." },
    { status: 403 }
  );
}

// ─── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Guard: require admin client to be configured
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Supabase admin not configured. Set SUPABASE_URL + SB_SECRET_KEY." },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { action, business_id } = body;

  if (typeof action !== "string" || typeof business_id !== "string") {
    return NextResponse.json(
      { error: "Fields 'action' and 'business_id' are required strings." },
      { status: 400 }
    );
  }

  // ── Auth (P0-3): verify JWT + business ownership BEFORE any action ─────────────
  // This route runs on the service-role client (bypasses RLS), so it MUST enforce
  // access itself. The browser calls it with the cookie session (no Authorization
  // header), so we verify via the SSR cookie client — getUser() validates the JWT
  // server-side against Supabase Auth. Then we gate on ownership of body.business_id.
  const serverClient = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await serverClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const forbidden = await assertOwnerOrAdmin(business_id, user.id);
  if (forbidden) return forbidden;

  // ── Action dispatch ──────────────────────────────────────────────────────────

  // Every action is gone (decision 2026-10-17: verification = manual approval from /super-admin/verification, which does not
  // use this route). They stay recognised so an old client gets a clear 410 Gone and not a generic 400. The route never flips
  // businesses.status.
  switch (action) {
    case "identity_status":
    case "generate_code":
    case "submit_selfie":
    case "send_sms":
    case "verify_sms":
      return NextResponse.json({ error: "verification_steps_removed" }, { status: 410 });

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
