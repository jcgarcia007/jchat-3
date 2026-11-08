/**
 * JChat 3.0 — POST /api/business-plan-request: the Custom-plan request form of /pricing/business sends here.
 *
 * Why a route handler and not a direct supabase.rpc from the browser: the browser cannot know its own IP, and the RPC's per-IP limit needs it.
 * Here we read x-forwarded-for, store only an HMAC of it (never the address), verify hCaptcha when a secret is configured, and call the RPC
 * `submit_business_plan_request` (migration 269) with the visitor's own session, so auth.uid() fills user_id when they are signed in.
 * The RPC validates and rate-limits (3 per hour per email / ip_hash); nothing here is trusted beyond forwarding.
 *
 * NO e-mail is sent in this spec. TODO spec 4: the RPC will queue outbound_emails kind='business_plan_request' → SALES_EMAIL.
 *
 * Responses:  200 {ok:true}  ·  422 {ok:false, code:'INVALID'}  ·  429 {ok:false, code:'RATE_LIMIT'}  ·  400 {ok:false, code:'CAPTCHA'}
 *             ·  500 {ok:false, code:'ERROR'}.
 */

import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Optional server secret for the IP hash; the fallback keeps the hash stable (and non-reversible by a plain sha256 lookup table is NOT guaranteed
// without a secret — set IP_HASH_SECRET in the environment).
const IP_HASH_SECRET = process.env.IP_HASH_SECRET ?? "jchat-business-plan-requests";

function clientIpHash(req: Request): string | null {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "";
  return ip ? createHmac("sha256", IP_HASH_SECRET).update(ip).digest("hex") : null;
}

/** hCaptcha server check. No HCAPTCHA_SECRET → the captcha is off (kill-switch, same as the rest of the web, D-38): let the request through. */
async function captchaPassed(token: unknown): Promise<boolean> {
  const secret = process.env.HCAPTCHA_SECRET?.trim();
  if (!secret) return true;
  if (typeof token !== "string" || token.length === 0) return false;
  try {
    const res = await fetch("https://api.hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID" }, { status: 422 });
  }

  const name = text(body.business_name);
  const email = text(body.email);
  const locations = Number(body.locations_count);
  if (name === null || email === null || !Number.isInteger(locations)) {
    return NextResponse.json({ ok: false, code: "INVALID" }, { status: 422 });
  }

  if (!(await captchaPassed(body.captcha_token))) {
    return NextResponse.json({ ok: false, code: "CAPTCHA" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_business_plan_request", {
    p_business_name: name,
    p_locations_count: locations,
    p_phone: text(body.phone) ?? "",
    p_email: email,
    p_message: text(body.message) ?? "",
    p_locale: text(body.locale) ?? "",
    p_ip_hash: clientIpHash(req) ?? undefined,
  });
  if (error) {
    console.error("[business-plan-request] rpc failed:", error.message);
    return NextResponse.json({ ok: false, code: "ERROR" }, { status: 500 });
  }

  const result = data as { ok?: boolean; code?: string } | null;
  if (result?.ok === true) return NextResponse.json({ ok: true });
  if (result?.code === "RATE_LIMIT") return NextResponse.json({ ok: false, code: "RATE_LIMIT" }, { status: 429 });
  return NextResponse.json({ ok: false, code: "INVALID" }, { status: 422 });
}
