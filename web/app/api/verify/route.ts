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
 *   "send_sms"         → Step 3: ask Twilio Verify to send an SMS code (we store nothing)
 *   "verify_sms"       → Step 3: ask Twilio Verify to check the code; if ok set sms_verified
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
 * Twilio Verify config. The SMS step uses Twilio Verify: Twilio generates, stores, sends
 * AND validates the one-time code. Our DB NEVER stores the code — that closes the sms_code
 * read hole (a business owner could previously SELECT their own sms_code and self-verify).
 *
 * Auth is an API Key + Secret (Basic base64(apiKey:apiSecret)), NOT the Account Auth Token.
 * Kill-switch (FIX #1d): until all FOUR secrets exist, send_sms/verify_sms return the same
 * 503 "Verification flow not available yet" as before — the UI contract is unchanged.
 *
 * NOTE: Vercel snapshots env vars at build time — rotating the Twilio secrets requires a
 * fresh deployment (an empty commit is skipped by Vercel and does NOT pick them up).
 */
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_API_KEY = process.env.TWILIO_API_KEY;
const TWILIO_API_SECRET = process.env.TWILIO_API_SECRET;
const TWILIO_VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID;

function twilioConfigured(): boolean {
  return !!(
    TWILIO_ACCOUNT_SID &&
    TWILIO_API_KEY &&
    TWILIO_API_SECRET &&
    TWILIO_VERIFY_SERVICE_SID
  );
}

/** Basic auth header for the Twilio API using the API Key + Secret (never the Auth Token). */
function twilioAuthHeader(): string {
  return "Basic " + Buffer.from(`${TWILIO_API_KEY}:${TWILIO_API_SECRET}`).toString("base64");
}

/** Twilio Verify endpoint URL for our service. */
function verifyUrl(resource: "Verifications" | "VerificationCheck"): string {
  return `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}/${resource}`;
}

/** E.164 phone format: leading '+' followed by 2–15 digits, first digit non-zero. */
function isE164(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

/**
 * Read the business phone (E.164) for verification. Returns { phone } or { error } with a
 * 400/404/500 response. Uses supabaseAdmin (RLS-bypassing) — the caller has already been
 * ownership-gated by assertOwnerOrAdmin, so this is safe.
 */
async function getBusinessPhoneE164(
  businessId: string
): Promise<{ phone: string } | { error: NextResponse }> {
  const { data, error } = await supabaseAdmin
    .from("businesses")
    .select("phone")
    .eq("id", businessId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }
  const phone = ((data?.phone as string | null) ?? "").trim();
  if (!phone || !isE164(phone)) {
    return {
      error: NextResponse.json(
        {
          error:
            "El negocio no tiene un teléfono válido en formato internacional (+1...).",
        },
        { status: 400 }
      ),
    };
  }
  return { phone };
}

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

    // ── Step 3a: Send SMS verification code (Twilio Verify) ────────────────────
    case "send_sms": {
      // Kill-switch (FIX #1d): no Twilio → don't simulate a verification.
      if (!twilioConfigured()) {
        return NextResponse.json(
          { error: "Verification flow not available yet." },
          { status: 503 }
        );
      }

      const phoneResult = await getBusinessPhoneE164(business_id);
      if ("error" in phoneResult) return phoneResult.error;

      // Twilio Verify generates, stores, and sends the code. We store NOTHING — no
      // sms_code, no expiry — so there is no code in our DB for anyone to read.
      try {
        const res = await fetch(verifyUrl("Verifications"), {
          method: "POST",
          headers: {
            Authorization: twilioAuthHeader(),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: phoneResult.phone,
            Channel: "sms",
          }).toString(),
        });

        if (!res.ok) {
          const detail = await res.text();
          console.error(
            `[verify/send_sms] Twilio Verify send failed (${res.status}):`,
            detail
          );
          return NextResponse.json(
            { error: "No se pudo enviar el código. Inténtalo de nuevo." },
            { status: 502 }
          );
        }
      } catch (err) {
        console.error("[verify/send_sms] Twilio Verify send error:", err);
        return NextResponse.json(
          { error: "No se pudo enviar el código. Inténtalo de nuevo." },
          { status: 502 }
        );
      }

      // NEVER return the code (nor a __dev_code) — it lives only in Twilio Verify and is
      // delivered to the owner by SMS.
      return NextResponse.json({ ok: true });
    }

    // ── Step 3b: Verify SMS code (Twilio Verify check) ─────────────────────────
    case "verify_sms": {
      // Kill-switch (FIX #1d): no Twilio → the SMS step doesn't exist yet.
      if (!twilioConfigured()) {
        return NextResponse.json(
          { error: "Verification flow not available yet." },
          { status: 503 }
        );
      }

      const submitted_code = body.code;
      if (typeof submitted_code !== "string" || !submitted_code.trim()) {
        return NextResponse.json({ error: "code is required." }, { status: 400 });
      }

      const phoneResult = await getBusinessPhoneE164(business_id);
      if ("error" in phoneResult) return phoneResult.error;

      // Ask Twilio whether the submitted code is valid. Twilio holds the code — we never
      // stored it, so there is nothing to compare against in our DB.
      let approved = false;
      try {
        const res = await fetch(verifyUrl("VerificationCheck"), {
          method: "POST",
          headers: {
            Authorization: twilioAuthHeader(),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: phoneResult.phone,
            Code: submitted_code.trim(),
          }).toString(),
        });

        // Twilio returns 404 when the verification expired, was already approved, or ran
        // out of attempts — that is "invalid or expired", NOT a server error.
        if (res.status === 404) {
          return NextResponse.json(
            { ok: false, error: "Código inválido o expirado." },
            { status: 400 }
          );
        }
        if (!res.ok) {
          const detail = await res.text();
          console.error(
            `[verify/verify_sms] Twilio VerificationCheck failed (${res.status}):`,
            detail
          );
          return NextResponse.json(
            { error: "No se pudo verificar el código. Inténtalo de nuevo." },
            { status: 502 }
          );
        }

        const check = (await res.json()) as { status?: string; valid?: boolean };
        approved = check.status === "approved" && check.valid === true;
      } catch (err) {
        console.error("[verify/verify_sms] Twilio VerificationCheck error:", err);
        return NextResponse.json(
          { error: "No se pudo verificar el código. Inténtalo de nuevo." },
          { status: 502 }
        );
      }

      if (!approved) {
        return NextResponse.json(
          { ok: false, error: "Código inválido o expirado." },
          { status: 400 }
        );
      }

      // Mark ONLY the SMS step as verified. This route must NOT flip businesses.status to
      // 'verified' — that flag enables Stripe payments and must never be settable by the
      // business owner (FIX #1c). The subject of a verification cannot self-approve it.
      // The flip to businesses.status='verified' is done exclusively by (a) a super_admin
      // action, or (b) a real Stripe Identity webhook — never here.
      //
      // upsert (not update): send_sms no longer pre-creates the row, so guarantee the
      // sms_verified flag persists even if Step 2 was skipped. onConflict leaves the other
      // verification columns untouched.
      const { error: smsUpdateErr } = await supabaseAdmin
        .from("business_verifications")
        .upsert(
          { business_id, sms_verified: true },
          { onConflict: "business_id" }
        );

      if (smsUpdateErr) {
        return NextResponse.json({ error: smsUpdateErr.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, sms_verified: true });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
