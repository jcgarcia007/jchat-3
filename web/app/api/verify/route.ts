/**
 * JChat 3.0 — Business Verification API Route (Task 2.2)
 * Server-side handler for all 3 verification steps.
 * Uses supabaseAdmin (service role) — never imported in client components.
 *
 * POST /api/verify
 * Body: { action, business_id, ...step-specific fields }
 *
 * Actions:
 *   "identity_status"  → Step 1: poll identity_status from business_verifications
 *   "generate_code"    → Step 2: upsert daily_code + code_date; return the code
 *   "submit_selfie"    → Step 2: store selfie_url (stub)
 *   "send_sms"         → Step 3: generate sms_code, store + sms_expires_at
 *   "verify_sms"       → Step 3: check submitted code against DB; if ok set verified
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a random uppercase alphanumeric string of `len` characters. */
function randomCode(len: number, numeric = false): string {
  const chars = numeric
    ? "0123456789"
    : "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O/1/I)
  let result = "";
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/** Today's date as YYYY-MM-DD (UTC). */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Kill-switch (FIX #1d): the SMS step is a stub — Twilio is not wired up. Until the
 * three TWILIO_* secrets exist, send_sms/verify_sms return 503 instead of simulating
 * a verification the app can't actually perform.
 */
const isTwilioConfigured = !!(
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_PHONE_NUMBER
);

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
      { error: "Supabase admin not configured. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY." },
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

  switch (action) {
    // ── Step 1: Poll Stripe Identity status ────────────────────────────────────
    case "identity_status": {
      /*
       * TODO(Stripe Identity): replace this read with a real Stripe Identity
       * status poll or webhook handler. The webhook should update
       * business_verifications.identity_status to 'approved' or 'failed'
       * and then call the status-update logic below (set businesses.status='pending').
       */
      const { data: bv, error } = await supabaseAdmin
        .from("business_verifications")
        .select("identity_status")
        .eq("business_id", business_id)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const status: string = (bv?.identity_status as string | null) ?? "pending";

      // When approved by Stripe Identity, flip businesses.status → 'pending'
      // (business appears on map with a "Pending review" badge until fully verified).
      // Payments remain blocked until status='verified' (all 3 steps complete).
      if (status === "approved") {
        const { error: updateErr } = await supabaseAdmin
          .from("businesses")
          .update({ status: "pending" })
          .eq("id", business_id)
          .eq("status", "pending_verification"); // only advance, never go back

        if (updateErr) {
          console.error("[verify/identity_status] businesses update error:", updateErr.message);
        }
      }

      return NextResponse.json({ identity_status: status });
    }

    // ── Step 2a: Generate (or return today's) daily code ──────────────────────
    case "generate_code": {
      const today = todayUTC();

      // Check if a code already exists for today
      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from("business_verifications")
        .select("daily_code, code_date")
        .eq("business_id", business_id)
        .maybeSingle();

      if (fetchErr) {
        return NextResponse.json({ error: fetchErr.message }, { status: 500 });
      }

      // Re-use today's code if already generated
      if (existing?.code_date === today && existing?.daily_code) {
        return NextResponse.json({ daily_code: existing.daily_code as string });
      }

      // Generate a new 6-character code
      const daily_code = randomCode(6);

      const { error: upsertErr } = await supabaseAdmin
        .from("business_verifications")
        .upsert(
          { business_id, daily_code, code_date: today },
          { onConflict: "business_id" }
        );

      if (upsertErr) {
        return NextResponse.json({ error: upsertErr.message }, { status: 500 });
      }

      return NextResponse.json({ daily_code });
    }

    // ── Step 2b: Submit selfie (stub) ─────────────────────────────────────────
    case "submit_selfie": {
      const selfie_url = body.selfie_url;
      if (typeof selfie_url !== "string" || !selfie_url.trim()) {
        return NextResponse.json(
          { error: "selfie_url is required." },
          { status: 400 }
        );
      }

      /*
       * TODO(storage): replace selfie_url stub with Supabase Storage upload.
       * Flow: client uploads file → storage bucket 'verification-selfies' →
       * gets signed URL → sends URL here to store for Super Admin review.
       */
      const { error } = await supabaseAdmin
        .from("business_verifications")
        .upsert(
          { business_id, selfie_url: selfie_url.trim() },
          { onConflict: "business_id" }
        );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    // ── Step 3a: Send SMS verification code ───────────────────────────────────
    case "send_sms": {
      // Kill-switch (FIX #1d): no Twilio → don't simulate a verification.
      if (!isTwilioConfigured) {
        return NextResponse.json(
          { error: "Verification flow not available yet." },
          { status: 503 }
        );
      }

      const sms_code = randomCode(6, true); // 6-digit numeric
      const sms_expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // now + 10 min

      const { error } = await supabaseAdmin
        .from("business_verifications")
        .upsert(
          { business_id, sms_code, sms_expires_at, sms_verified: false },
          { onConflict: "business_id" }
        );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      /*
       * TODO(Twilio): send the actual SMS here.
       * const phone = await getBusinessPhone(business_id);
       * await twilioClient.messages.create({
       *   body: `Your JChat verification code: ${sms_code}. Expires in 10 minutes.`,
       *   from: process.env.TWILIO_PHONE_NUMBER,
       *   to: phone,
       * });
       */

      // The code is NEVER returned to the client — it is a verification secret and is
      // delivered only via SMS (once Twilio is wired up above).
      return NextResponse.json({
        ok: true,
        expires_at: sms_expires_at,
      });
    }

    // ── Step 3b: Verify SMS code ──────────────────────────────────────────────
    case "verify_sms": {
      // Kill-switch (FIX #1d): no Twilio → the SMS step doesn't exist yet.
      if (!isTwilioConfigured) {
        return NextResponse.json(
          { error: "Verification flow not available yet." },
          { status: 503 }
        );
      }

      const submitted_code = body.code;
      if (typeof submitted_code !== "string" || !submitted_code.trim()) {
        return NextResponse.json({ error: "code is required." }, { status: 400 });
      }

      const { data: bv, error: fetchErr } = await supabaseAdmin
        .from("business_verifications")
        .select("sms_code, sms_expires_at, sms_verified")
        .eq("business_id", business_id)
        .maybeSingle();

      if (fetchErr) {
        return NextResponse.json({ error: fetchErr.message }, { status: 500 });
      }
      if (!bv || !bv.sms_code) {
        return NextResponse.json({ error: "No code found. Request a new one." }, { status: 400 });
      }
      if (bv.sms_verified) {
        return NextResponse.json({ ok: true, already_verified: true });
      }

      // Expiry check
      const expiresAt = new Date(bv.sms_expires_at as string).getTime();
      if (Date.now() > expiresAt) {
        return NextResponse.json(
          { error: "Code expired. Please request a new code." },
          { status: 400 }
        );
      }

      // Code match check
      if (submitted_code.trim() !== (bv.sms_code as string)) {
        return NextResponse.json({ error: "Incorrect code. Please try again." }, { status: 400 });
      }

      // Mark ONLY the SMS step as verified. This route must NOT flip
      // businesses.status to 'verified' — that flag enables Stripe payments and
      // must never be settable by the business owner (FIX #1c). The subject of a
      // verification cannot self-approve it.
      //
      // TODO: the flip to businesses.status='verified' is performed exclusively by
      //   (a) a super_admin action, or (b) a real Stripe Identity webhook — never here.
      const { error: smsUpdateErr } = await supabaseAdmin
        .from("business_verifications")
        .update({ sms_verified: true })
        .eq("business_id", business_id);

      if (smsUpdateErr) {
        return NextResponse.json({ error: smsUpdateErr.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, sms_verified: true });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
