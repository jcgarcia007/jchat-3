/**
 * JChat 3.0 — guest-pay Edge Function (G1: pago de invitado sin cuenta).
 * Runtime: Deno (Supabase Edge Functions)
 *
 * PUBLIC endpoint (verify_jwt = false in config.toml): a walk-in customer with NO
 * account pays from the menu. We do NOT use anonymous Supabase sessions — Supabase
 * rate-limits anonymous sign-ups per IP, and a bar's shared WiFi is one IP, so the
 * 31st guest of the hour couldn't order (D-39). Instead the bot defence is hCaptcha,
 * verified server-side here.
 *
 * The ORDER is always saved (kitchen, waiter, sales) — only the link to a customer
 * is ephemeral (user_id NULL). Email is optional, only so Stripe emails the receipt.
 *
 * Action: { action: "create_guest_payment", captcha_token, order:{...}, contact_name, contact_email? }
 *   → verifies hCaptcha, re-prices from the DB, applies the SAME Connect routing as
 *     the customer flow, stamps metadata.payment_kind='guest_order' (NO user_id),
 *     persists the cart with user_id NULL, and returns { clientSecret, publishableKey }.
 *
 * The webhook turns metadata.payment_kind='guest_order' into an order with user_id
 * NULL. Prices/Connect are reused from ../_shared (never duplicated).
 *
 * Required secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   EXPO_PUBLIC_STRIPE_PK, HCAPTCHA_SECRET, PLATFORM_FEE_* (shared).
 */

import Stripe from "npm:stripe@16.2.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";
import { businessChargeGate, buildConnectPiParams } from "../_shared/connect.ts";
import { priceLinesFromDb, computeTaxCents, TAX_FALLBACK } from "../_shared/pricing.ts";

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}
function getStripe(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2024-06-20" });
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

interface GuestItem {
  menu_item_id: string;
  qty: number;
  options?: Record<string, unknown>;
  special_instructions?: string | null;
}

/**
 * Verify the hCaptcha token server-side. A token is SINGLE-USE — if the guest
 * retries the payment, G2's UI must request a fresh token (an old one fails here).
 */
async function verifyCaptcha(token: string, remoteip: string | null): Promise<boolean> {
  const secret = Deno.env.get("HCAPTCHA_SECRET");
  if (!secret) {
    console.error("[guest-pay] HCAPTCHA_SECRET not set — refusing to accept payments");
    return false;
  }
  const form = new URLSearchParams({ secret, response: token });
  if (remoteip) form.set("remoteip", remoteip);
  try {
    const res = await fetch("https://api.hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error("[guest-pay] hCaptcha siteverify failed:", err);
    return false;
  }
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function handleCreateGuestPayment(body: Record<string, unknown>, req: Request): Promise<Response> {
  // ── Guard 1: hCaptcha ──────────────────────────────────────────────────────
  const captchaToken = typeof body.captcha_token === "string" ? body.captcha_token : "";
  if (!captchaToken) return errorResponse("Falta la verificación de seguridad", 400);
  const remoteip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    null;
  if (!(await verifyCaptcha(captchaToken, remoteip))) {
    return errorResponse("Verificación fallida, inténtalo de nuevo", 403);
  }

  // ── Guard 2: contact_name required, email optional ─────────────────────────
  const contactName = typeof body.contact_name === "string" ? body.contact_name.trim() : "";
  if (!contactName) return errorResponse("Dinos a nombre de quién es el pedido", 400);
  if (contactName.length > 60) return errorResponse("El nombre es demasiado largo", 400);

  let contactEmail: string | null = null;
  if (typeof body.contact_email === "string" && body.contact_email.trim()) {
    const e = body.contact_email.trim().slice(0, 120);
    if (!isValidEmail(e)) return errorResponse("El correo no tiene un formato válido", 400);
    contactEmail = e;
  }

  // ── Parse the order ────────────────────────────────────────────────────────
  const order = body.order as Record<string, unknown> | undefined;
  if (!order) return errorResponse("order payload is required");
  const businessId = typeof order.business_id === "string" ? order.business_id : null;
  if (!businessId) return errorResponse("order.business_id is required");
  const orderType = ["table", "counter", "gift"].includes(order.order_type as string)
    ? (order.order_type as string)
    : "counter";
  const tableLabel = typeof order.table_label === "string" ? order.table_label.trim().slice(0, 40) || null : null;
  const tableQrToken = typeof order.table_qr_token === "string" ? order.table_qr_token.trim() || null : null;

  const rawItems = Array.isArray(order.items) ? order.items : null;
  if (!rawItems || rawItems.length === 0) return errorResponse("Cart is empty");
  const items: GuestItem[] = [];
  for (const raw of rawItems as Record<string, unknown>[]) {
    const id = typeof raw.menu_item_id === "string" ? raw.menu_item_id : "";
    if (!id) return errorResponse("Each item must have a menu_item_id");
    if (!Number.isInteger(raw.qty) || (raw.qty as number) < 1) {
      return errorResponse(`Invalid qty for item ${id}`);
    }
    items.push({
      menu_item_id: id,
      qty: raw.qty as number,
      options: (raw.options ?? {}) as Record<string, unknown>,
      special_instructions: typeof raw.special_instructions === "string" ? raw.special_instructions : null,
    });
  }

  const db = getAdminClient();
  const stripe = getStripe();

  // ── Guard 3: business exists + can charge (shared gate, same errors) ───────
  const { data: business, error: bizErr } = await db
    .from("businesses")
    .select("id, stripe_account_id, tax_rate, status, stripe_charges_enabled")
    .eq("id", businessId)
    .maybeSingle();
  if (bizErr) return errorResponse(`DB error: ${bizErr.message}`, 500);
  if (!business) return errorResponse("Business not found", 404);
  const gate = businessChargeGate(business as {
    stripe_account_id: string | null; status: string | null; stripe_charges_enabled: boolean | null;
  });
  if (gate) return errorResponse(gate.error, gate.status);

  // ── Guard 4: table QR token must belong to THIS business (same as customer flow) ─
  let resolvedTableId: string | null = null;
  if (tableQrToken) {
    const { data: tableRow, error: tableErr } = await db
      .from("tables")
      .select("id, business_id")
      .eq("qr_token", tableQrToken)
      .eq("is_active", true)
      .maybeSingle();
    if (tableErr) {
      console.error("[guest-pay] table_qr_token lookup failed:", tableErr.message);
    } else if (!tableRow) {
      console.warn("[guest-pay] table_qr_token not found or inactive — order has no table");
    } else if (tableRow.business_id !== businessId) {
      return errorResponse("La mesa no pertenece a este negocio", 400);
    } else {
      resolvedTableId = tableRow.id as string;
    }
  }

  // ── Price from the DB (shared calculator). Client amounts ignored. ─────────
  const priced = await priceLinesFromDb(db, businessId, items);
  if ("error" in priced) return errorResponse(priced.error, priced.status ?? 400);
  const { lineUnitCents, resolvedOptions, subtotalCents } = priced;

  const taxRate = business.tax_rate != null ? Number(business.tax_rate) : TAX_FALLBACK;
  const taxCents = computeTaxCents(subtotalCents, taxRate);
  const totalCents = subtotalCents + taxCents; // guest: no tip, no discount
  if (totalCents < 50) return errorResponse("Total is below Stripe minimum ($0.50)");

  // ── Metadata: payment_kind='guest_order' and NO user_id (that's what marks it) ─
  const metadata: Record<string, string> = {
    payment_kind: "guest_order",
    business_id: businessId,
    order_type: orderType,
    subtotal_cents: String(subtotalCents),
    tax_cents: String(taxCents),
    total_cents: String(totalCents),
    contact_name: contactName,
  };
  if (contactEmail) metadata.contact_email = contactEmail;
  if (tableLabel) metadata.table_label = tableLabel;
  if (resolvedTableId) metadata.table_id = resolvedTableId;

  const piParams = buildConnectPiParams({
    amountCents: totalCents,
    currency: "usd",
    metadata,
    stripeAccountId: business.stripe_account_id as string, // gate guaranteed non-null
    receiptEmail: contactEmail, // Stripe emails a receipt only if given
  });

  const paymentIntent = await stripe.paymentIntents.create(piParams);

  // Persist the SERVER-RESOLVED cart with user_id NULL (085 made it nullable). The
  // webhook reads this to insert order_items (metadata is length-capped).
  const { error: cartErr } = await db.from("pending_order_carts").upsert({
    payment_intent_id: paymentIntent.id,
    business_id: businessId,
    user_id: null,
    items: items.map((it, idx) => ({
      menu_item_id: it.menu_item_id,
      qty: it.qty,
      price_cents: lineUnitCents[idx],
      options: resolvedOptions[idx],
      special_instructions: it.special_instructions ?? null,
    })),
  });
  if (cartErr) {
    console.error("[guest-pay] failed to persist pending cart:", cartErr);
    // Don't fail the payment: the webhook falls back to metadata items (none here),
    // but log loudly — a guest order with no cart would land with no items.
  }

  const publishableKey = Deno.env.get("EXPO_PUBLIC_STRIPE_PK") ?? "";
  return jsonResponse({
    clientSecret: paymentIntent.client_secret,
    publishableKey,
    serverTotalCents: totalCents,
    serverBreakdown: { subtotalCents, taxCents, tipCents: 0, discountCents: 0 },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }
  const action = typeof body.action === "string" ? body.action : null;

  try {
    switch (action) {
      case "create_guest_payment":
        return await handleCreateGuestPayment(body, req);
      default:
        return errorResponse(`Unknown action: ${action ?? "(none)"}`);
    }
  } catch (err) {
    console.error(`[guest-pay] error in action "${action}":`, err);
    return errorResponse("Internal server error", 500);
  }
});
