/**
 * guest-tab — Tab POS F3 + F4
 *
 * PUBLIC endpoint (verify_jwt = false en config.toml): un cliente con el QR de la
 * mesa puede crear sesión de invitado (con código), agregar órdenes con código,
 * enviar pedidos sin código (esperan aprobación del mesero, F4), y ver el estado
 * de sus propios pedidos.
 *
 * Acciones:
 *   create_session     { table_qr_token, access_code, device_id, fingerprint, captcha_token }
 *   session_status     { session_token }
 *   add_order          { session_token, idempotency_key, items[], contact_name?, notes? }
 *   add_order_no_code  { table_qr_token, device_id, fingerprint, captcha_token,
 *                        idempotency_key, items[], contact_name?, notes? }   — F4
 *   order_status       { session_token } | { table_qr_token, device_id }    — F4
 *
 * Errores: { error: { code, message, retry_after_s?, blocked_until? } } con HTTP 4xx.
 * El campo `code` es estable en mayúsculas — el cliente traduce por code.
 *
 * Secretos requeridos: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *                      HCAPTCHA_SECRET, GUEST_IP_SALT (opcional).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@16.2.0";
import { priceLinesFromDb } from "../_shared/pricing.ts";
import { businessChargeGate, buildConnectPiParams } from "../_shared/connect.ts";
import {
  sha256Hex,
  hashIp,
  CODE_ATTEMPTS_PER_DEVICE,
  CODE_ATTEMPTS_DEVICE_WIN_MS,
  CODE_ATTEMPTS_PER_TABLE,
  CODE_ATTEMPTS_TABLE_WIN_MS,
  CODE_ATTEMPTS_PER_IP,
  CODE_ATTEMPTS_IP_WIN_MS,
  GUEST_SESSION_TTL_HOURS,
} from "../_shared/guestPolicy.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function errResponse(code: string, message: string, status: number, extra: Record<string, unknown> = {}): Response {
  return jsonResponse({ error: { code, message, ...extra } }, status);
}

function getAdminClient() {
  const url  = Deno.env.get("SUPABASE_URL")!;
  const key  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function verifyCaptcha(token: string, remoteip: string | null): Promise<boolean> {
  const secret = Deno.env.get("HCAPTCHA_SECRET");
  if (!secret) {
    console.error("[guest-tab] HCAPTCHA_SECRET not set — refusing session creation");
    return false;
  }
  const body = new URLSearchParams({ secret, response: token });
  if (remoteip) body.set("remoteip", remoteip);
  const res  = await fetch("https://api.hcaptcha.com/siteverify", { method: "POST", body });
  const json = await res.json() as { success: boolean };
  return json.success === true;
}

function getClientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    null
  );
}

// Genera 32 bytes aleatorios en base64url (token opaco para el cliente).
function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function handleCreateSession(body: Record<string, unknown>, req: Request): Promise<Response> {
  // 1. Validar forma
  const { table_qr_token, access_code, device_id, fingerprint, captcha_token } = body as {
    table_qr_token?: string;
    access_code?:    string;
    device_id?:      string;
    fingerprint?:    string;
    captcha_token?:  string;
  };

  if (!table_qr_token || typeof table_qr_token !== "string")
    return errResponse("VALIDATION", "table_qr_token requerido", 400);
  if (!access_code || !/^\d{6}$/.test(access_code))
    return errResponse("VALIDATION", "access_code debe ser 6 dígitos", 400);
  if (!device_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(device_id))
    return errResponse("VALIDATION", "device_id debe ser UUID v4", 400);
  if (!fingerprint || typeof fingerprint !== "string" || fingerprint.length < 8 || fingerprint.length > 128)
    return errResponse("VALIDATION", "fingerprint inválido", 400);
  if (!captcha_token || typeof captcha_token !== "string")
    return errResponse("VALIDATION", "captcha_token requerido", 400);

  // 2. Verificar hCaptcha
  const ip = getClientIp(req);
  if (!(await verifyCaptcha(captcha_token, ip)))
    return errResponse("CAPTCHA_FAILED", "Verificación de seguridad fallida", 403);

  const db = getAdminClient();

  // 3. Resolver mesa por qr_token
  const { data: table } = await db
    .from("tables")
    .select("id, business_id, label, access_code, session_opened_at")
    .eq("qr_token", table_qr_token)
    .eq("is_active", true)
    .maybeSingle();

  if (!table) return errResponse("TABLE_NOT_FOUND", "Mesa no encontrada", 404);

  const { id: tableId, business_id: businessId, label: tableLabel } = table;

  // 4. Bloqueo de dispositivo
  const now = new Date().toISOString();
  const { data: block } = await db
    .from("guest_device_blocks")
    .select("blocked_until")
    .eq("business_id", businessId)
    .eq("device_id", device_id)
    .is("unblocked_at", null)
    .gt("blocked_until", now)
    .maybeSingle();

  if (block) {
    return errResponse("DEVICE_BLOCKED", "No puedes pedir desde este dispositivo. Pide ayuda a tu mesero.", 403, {
      blocked_until: block.blocked_until,
    });
  }

  // 5. Rate limit
  const ipHash      = ip ? await hashIp(ip) : null;
  const fiveMinAgo  = new Date(Date.now() - CODE_ATTEMPTS_DEVICE_WIN_MS).toISOString();
  const tenMinAgo   = new Date(Date.now() - CODE_ATTEMPTS_TABLE_WIN_MS).toISOString();

  const [{ count: devCount }, { count: tblCount }, { count: ipCount }] = await Promise.all([
    db.from("guest_code_attempts").select("*", { count: "exact", head: true })
      .eq("device_id", device_id).gte("created_at", fiveMinAgo),
    db.from("guest_code_attempts").select("*", { count: "exact", head: true })
      .eq("table_id", tableId).gte("created_at", tenMinAgo),
    ipHash
      ? db.from("guest_code_attempts").select("*", { count: "exact", head: true })
          .eq("ip_hash", ipHash).gte("created_at", tenMinAgo)
      : Promise.resolve({ count: 0 }),
  ]);

  const rateLimited =
    (devCount ?? 0) >= CODE_ATTEMPTS_PER_DEVICE ||
    (tblCount ?? 0) >= CODE_ATTEMPTS_PER_TABLE  ||
    (ipHash && (ipCount ?? 0) >= CODE_ATTEMPTS_PER_IP);

  if (rateLimited) {
    // Insertar intento fallido antes de responder
    await db.from("guest_code_attempts").insert({
      business_id: businessId, table_id: tableId,
      device_id, ip_hash: ipHash, success: false,
    });
    const retryAfterS = Math.ceil(CODE_ATTEMPTS_DEVICE_WIN_MS / 1000);
    return errResponse("RATE_LIMITED", "Demasiados intentos. Espera un momento.", 429, { retry_after_s: retryAfterS });
  }

  // 6. Registrar intento (success=false por defecto) y comparar código en servidor
  const { data: attempt } = await db
    .from("guest_code_attempts")
    .insert({ business_id: businessId, table_id: tableId, device_id, ip_hash: ipHash, success: false })
    .select("id")
    .single();

  // Comparar en servidor: igualdad exacta de strings + sesión abierta
  const codeMatch = table.access_code === access_code && table.session_opened_at !== null;
  if (!codeMatch) {
    // Mensaje genérico — no revelar si la mesa tiene sesión o no
    return errResponse("CODE_INVALID", "Código no válido. Revisa el código de tu mesa o pide ayuda a tu mesero.", 401);
  }

  // 7. Generar token, insertar sesión de invitado, marcar intento exitoso
  const token      = generateToken();
  const tokenHash  = await sha256Hex(token);
  const expiresAt  = new Date(Date.now() + GUEST_SESSION_TTL_HOURS * 3600 * 1000).toISOString();
  const userAgent  = (req.headers.get("user-agent") ?? "").slice(0, 200);
  const fpHash     = await sha256Hex(fingerprint);

  // Paso 7a: insertar sesión — capturar error; no devolver token si falla
  const { error: sessInsertErr } = await db.from("guest_tab_sessions").insert({
    business_id:            businessId,
    table_id:               tableId,
    table_session_opened_at: table.session_opened_at,
    device_id,
    fingerprint_hash:       fpHash,
    token_hash:             tokenHash,
    ip_hash:                ipHash,
    user_agent:             userAgent,
    expires_at:             expiresAt,
  });

  if (sessInsertErr) {
    console.error("[guest-tab] Error insertando guest_tab_sessions:", sessInsertErr.message);
    return errResponse("INTERNAL", "No se pudo crear la sesión", 500);
  }

  // Paso 7b: marcar intento exitoso (guard: attempt puede ser null si el insert falló)
  if (attempt?.id) {
    await db.from("guest_code_attempts").update({ success: true }).eq("id", attempt.id);
  }

  // 8. Cargar negocio y responder — NUNCA devolver access_code
  const { data: biz } = await db
    .from("businesses")
    .select("id, slug, name, pos_payment_mode")
    .eq("id", businessId)
    .single();

  return jsonResponse({
    session_token: token,
    expires_at:    expiresAt,
    table_label:   tableLabel,
    business: {
      id:              biz?.id,
      slug:            biz?.slug,
      name:            biz?.name,
      pos_payment_mode: biz?.pos_payment_mode ?? "stripe",
    },
  });
}

async function handleSessionStatus(body: Record<string, unknown>): Promise<Response> {
  const { session_token } = body as { session_token?: string };
  if (!session_token || typeof session_token !== "string")
    return errResponse("VALIDATION", "session_token requerido", 400);

  const db         = getAdminClient();
  const tokenHash  = await sha256Hex(session_token);

  const { data: rows } = await db.rpc("guest_tab_session_validate", { p_token_hash: tokenHash });
  if (!rows || rows.length === 0)
    return errResponse("SESSION_INVALID", "La sesión ha expirado o no es válida.", 401);

  const sess = rows[0] as { business_id: string; expires_at?: string };

  const { data: biz } = await db
    .from("businesses")
    .select("pos_payment_mode")
    .eq("id", sess.business_id)
    .single();

  const { data: sessionRow } = await db
    .from("guest_tab_sessions")
    .select("expires_at, table_id")
    .eq("token_hash", tokenHash)
    .single();

  const { data: tbl } = await db
    .from("tables")
    .select("label")
    .eq("id", sessionRow?.table_id)
    .single();

  return jsonResponse({
    ok:              true,
    table_label:     tbl?.label,
    pos_payment_mode: biz?.pos_payment_mode ?? "stripe",
    expires_at:      sessionRow?.expires_at,
  });
}

async function handleAddOrder(body: Record<string, unknown>): Promise<Response> {
  const { session_token, idempotency_key, items, contact_name, notes } = body as {
    session_token?:   string;
    idempotency_key?: string;
    items?:           Array<{ menu_item_id: string; qty: number; options?: Record<string, unknown>; special_instructions?: string }>;
    contact_name?:    string;
    notes?:           string;
  };

  if (!session_token || typeof session_token !== "string")
    return errResponse("VALIDATION", "session_token requerido", 400);
  if (!idempotency_key || typeof idempotency_key !== "string")
    return errResponse("VALIDATION", "idempotency_key requerido", 400);
  if (!Array.isArray(items) || items.length === 0)
    return errResponse("EMPTY_CART", "El carrito está vacío", 400);

  // Validar ítems básicos
  for (const item of items) {
    if (!item.menu_item_id || typeof item.menu_item_id !== "string")
      return errResponse("VALIDATION", "Cada ítem requiere menu_item_id", 400);
    if (!Number.isInteger(item.qty) || item.qty < 1)
      return errResponse("VALIDATION", "qty debe ser entero ≥ 1", 400);
  }

  if (contact_name && contact_name.length > 60)
    return errResponse("VALIDATION", "contact_name demasiado largo (máx. 60 chars)", 400);
  if (notes && notes.length > 200)
    return errResponse("VALIDATION", "notes demasiado largo (máx. 200 chars)", 400);

  const db        = getAdminClient();
  const tokenHash = await sha256Hex(session_token);

  // 1. Validar sesión
  const { data: sessRows } = await db.rpc("guest_tab_session_validate", { p_token_hash: tokenHash });
  if (!sessRows || sessRows.length === 0)
    return errResponse("SESSION_INVALID", "La sesión ha expirado o no es válida.", 401);

  const sess = sessRows[0] as {
    session_id: string; business_id: string; table_id: string;
    table_label: string; device_id: string;
  };

  // 2. Bloqueo activo del device_id
  const now = new Date().toISOString();
  const { data: block } = await db
    .from("guest_device_blocks")
    .select("blocked_until")
    .eq("business_id", sess.business_id)
    .eq("device_id", sess.device_id)
    .is("unblocked_at", null)
    .gt("blocked_until", now)
    .maybeSingle();

  if (block)
    return errResponse("DEVICE_BLOCKED", "No puedes pedir desde este dispositivo. Pide ayuda a tu mesero.", 403, {
      blocked_until: block.blocked_until,
    });

  // 3. Idempotencia
  const { data: existingIdem } = await db
    .from("guest_order_idempotency")
    .select("order_id, business_id")
    .eq("idempotency_key", idempotency_key)
    .maybeSingle();

  if (existingIdem) {
    if (existingIdem.business_id !== sess.business_id)
      return errResponse("VALIDATION", "idempotency_key inválida para este negocio", 400);

    // Re-cargar la orden existente y devolver la misma respuesta
    const { data: existingOrder } = await db
      .from("orders")
      .select("id, subtotal_cents, total_cents")
      .eq("id", existingIdem.order_id)
      .single();

    const { data: existingItems } = await db
      .from("order_items")
      .select("qty, menu_items!inner(name)")
      .eq("order_id", existingIdem.order_id);

    return jsonResponse({
      order_id:        existingOrder?.id,
      approval_status: null,
      subtotal_cents:  existingOrder?.subtotal_cents,
      total_cents:     existingOrder?.total_cents,
      // deno-lint-ignore no-explicit-any
      items: (existingItems ?? []).map((r: any) => ({
        name: (r.menu_items as { name: string }).name,
        qty:  r.qty as number,
      })),
    });
  }

  // 4. Calcular precios en servidor (nunca del cliente)
  // deno-lint-ignore no-explicit-any
  const priced = await priceLinesFromDb(db as any, sess.business_id, items.map((it) => ({
    menu_item_id: it.menu_item_id,
    qty:          it.qty,
    options:      it.options,
  })));

  if ("error" in priced)
    return errResponse("MENU_ITEM_UNAVAILABLE", priced.error, (priced as { status?: number }).status ?? 409);

  const { lineUnitCents, resolvedOptions, subtotalCents } = priced as {
    lineUnitCents:    number[];
    resolvedOptions:  Array<Record<string, unknown>>;
    subtotalCents:    number;
  };

  // 5. Atribución D-14: resolver mesero via RPC (server-side, Variante T)
  const { data: waiterData } = await db.rpc("resolve_table_waiter_for_attribution", {
    p_table_id: sess.table_id,
  });
  const takenBy = waiterData ?? null;

  // 6. Insertar orden + ítems (transacción lógica: si falla items, borrar orden)
  const { data: order, error: orderErr } = await db
    .from("orders")
    .insert({
      business_id:       sess.business_id,
      table_id:          sess.table_id,
      table_label:       sess.table_label,  // nombre oficial de la BD, no del cliente
      order_type:        "table",
      status:            "preparing",
      source:            "customer_tab",
      approval_status:   null,              // con código → sin aprobación (F3)
      guest_device_id:   sess.device_id,
      guest_session_id:  sess.session_id,
      contact_name:      contact_name ?? null,
      notes:             notes ?? null,
      subtotal_cents:    subtotalCents,
      tax_cents:         0,                 // Variante T: sin impuesto a nivel orden
      tip_cents:         0,
      discount_cents:    0,
      total_cents:       subtotalCents,
      paid_at:           null,              // sin pago — va a la cuenta de la mesa
      taken_by:          takenBy,
      status_updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (orderErr || !order)
    return errResponse("INTERNAL", "Error al crear la orden", 500);

  const orderItemsPayload = items.map((it, i) => ({
    order_id:             order.id,
    menu_item_id:         it.menu_item_id,
    qty:                  it.qty,
    price_cents:          lineUnitCents[i],
    options:              resolvedOptions[i] ?? null,
    special_instructions: it.special_instructions ?? null,
    item_status:          "pending",
  }));

  const { error: itemsErr } = await db.from("order_items").insert(orderItemsPayload);

  if (itemsErr) {
    // Rollback lógico: eliminar la orden huérfana
    await db.from("orders").delete().eq("id", order.id);
    return errResponse("INTERNAL", "Error al insertar ítems de la orden", 500);
  }

  // 7. Registrar idempotencia — capturar errores de forma robusta
  const { error: idemInsertErr } = await db.from("guest_order_idempotency").insert({
    idempotency_key,
    business_id: sess.business_id,
    order_id:    order.id,
  });

  if (idemInsertErr) {
    // Código 23505 = violación de PK/UNIQUE: otra petición con la misma key ganó la carrera.
    // Recargamos esa orden y la devolvemos (mismo shape que el paso 3) para mantener
    // exactamente-una-vez semántica sin dejar dos órdenes huérfanas.
    if ((idemInsertErr as { code?: string }).code === "23505") {
      const { data: raceIdem } = await db
        .from("guest_order_idempotency")
        .select("order_id")
        .eq("idempotency_key", idempotency_key)
        .maybeSingle();

      if (raceIdem?.order_id) {
        // Borrar la orden que acabamos de crear (la otra ganó)
        await db.from("orders").delete().eq("id", order.id);

        const { data: raceOrder } = await db
          .from("orders")
          .select("id, subtotal_cents, total_cents")
          .eq("id", raceIdem.order_id)
          .single();

        const { data: raceItems } = await db
          .from("order_items")
          .select("qty, menu_items!inner(name)")
          .eq("order_id", raceIdem.order_id);

        return jsonResponse({
          order_id:        raceOrder?.id,
          approval_status: null,
          subtotal_cents:  raceOrder?.subtotal_cents,
          total_cents:     raceOrder?.total_cents,
          // deno-lint-ignore no-explicit-any
          items: (raceItems ?? []).map((r: any) => ({
            name: (r.menu_items as { name: string }).name,
            qty:  r.qty as number,
          })),
        });
      }
    }
    // Otros errores: la orden ya está creada y los ítems también — no bloquear al cliente.
    console.error("[guest-tab] Error insertando guest_order_idempotency (no crítico):", idemInsertErr.message);
  }

  // D-27 (deuda técnica): guest-tab no descuenta inventario — paridad con stripe-webhook.
  // Se resolverá en la fase de inventario junto con customer_stripe.

  // 8. Responder con nombres de ítems (desde BD, no del cliente)
  const { data: createdItems } = await db
    .from("order_items")
    .select("qty, menu_items!inner(name)")
    .eq("order_id", order.id);

  return jsonResponse({
    order_id:        order.id,
    approval_status: null,
    subtotal_cents:  subtotalCents,
    total_cents:     subtotalCents,
    // deno-lint-ignore no-explicit-any
    items: (createdItems ?? []).map((r: any) => ({
      name: (r.menu_items as { name: string }).name,
      qty:  r.qty as number,
    })),
  });
}

// ─── F4: add_order_no_code ────────────────────────────────────────────────────
// Cliente sin código → orden en approval_status='awaiting' (espera aprobación del mesero).
// D-31: rate limit 3 pedidos/dispositivo/mesa cada 10 min para disuadir spam.

async function handleAddOrderNoCode(body: Record<string, unknown>, req: Request): Promise<Response> {
  const {
    table_qr_token, device_id, fingerprint, captcha_token,
    idempotency_key, items, contact_name, notes,
  } = body as {
    table_qr_token?:  string;
    device_id?:       string;
    fingerprint?:     string;
    captcha_token?:   string;
    idempotency_key?: string;
    items?:           Array<{ menu_item_id: string; qty: number; options?: object; special_instructions?: string }>;
    contact_name?:    string;
    notes?:           string;
  };

  // 1. Validar shape
  if (!table_qr_token || typeof table_qr_token !== "string")
    return errResponse("VALIDATION", "table_qr_token requerido", 400);
  if (!device_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(device_id))
    return errResponse("VALIDATION", "device_id debe ser UUID v4", 400);
  if (!fingerprint || typeof fingerprint !== "string" || fingerprint.length < 8 || fingerprint.length > 128)
    return errResponse("VALIDATION", "fingerprint inválido", 400);
  if (!captcha_token || typeof captcha_token !== "string")
    return errResponse("VALIDATION", "captcha_token requerido", 400);
  if (!idempotency_key || typeof idempotency_key !== "string")
    return errResponse("VALIDATION", "idempotency_key requerido", 400);
  if (!Array.isArray(items) || items.length === 0)
    return errResponse("EMPTY_CART", "El carrito está vacío", 400);
  for (const item of items) {
    if (!item.menu_item_id || typeof item.menu_item_id !== "string")
      return errResponse("VALIDATION", "Cada ítem requiere menu_item_id", 400);
    if (!Number.isInteger(item.qty) || item.qty < 1)
      return errResponse("VALIDATION", "qty debe ser entero ≥ 1", 400);
  }
  if (contact_name && contact_name.length > 60)
    return errResponse("VALIDATION", "contact_name demasiado largo (máx. 60 chars)", 400);
  if (notes && notes.length > 200)
    return errResponse("VALIDATION", "notes demasiado largo (máx. 200 chars)", 400);

  // 2. hCaptcha obligatorio (sin sesión = mayor riesgo de abuso)
  const ip = getClientIp(req);
  if (!(await verifyCaptcha(captcha_token, ip)))
    return errResponse("CAPTCHA_FAILED", "Verificación de seguridad fallida", 403);

  const db = getAdminClient();

  // 3. Resolver mesa por qr_token
  const { data: table } = await db
    .from("tables")
    .select("id, business_id, label, is_active")
    .eq("qr_token", table_qr_token)
    .eq("is_active", true)
    .maybeSingle();

  if (!table) return errResponse("TABLE_NOT_FOUND", "Mesa no encontrada", 404);

  const { id: tableId, business_id: businessId, label: tableLabel } = table;

  // 4. Gate: solo modo external (D-05)
  const { data: biz } = await db
    .from("businesses")
    .select("pos_payment_mode, kds_settings")
    .eq("id", businessId)
    .single();

  if (!biz || biz.pos_payment_mode !== "external")
    return errResponse("MODE_NOT_ALLOWED", "Pedidos sin código solo disponibles en modo externo", 403);

  // 5. Bloqueo de dispositivo (D-08)
  const now = new Date().toISOString();
  const { data: block } = await db
    .from("guest_device_blocks")
    .select("blocked_until")
    .eq("business_id", businessId)
    .eq("device_id", device_id)
    .is("unblocked_at", null)
    .gt("blocked_until", now)
    .maybeSingle();

  if (block) {
    return errResponse("DEVICE_BLOCKED",
      "No puedes pedir desde este dispositivo. Pide ayuda a tu mesero.", 403,
      { blocked_until: block.blocked_until });
  }

  // 6. Rate limit: D-31 — máx. 3 pedidos sin código / dispositivo / mesa / 10 min
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count: recentCount } = await db
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("table_id", tableId)
    .eq("guest_device_id", device_id)
    .is("guest_session_id", null)
    .gte("created_at", tenMinAgo);

  if ((recentCount ?? 0) >= 3) {
    return errResponse("RATE_LIMITED",
      "Demasiados pedidos en poco tiempo. Espera unos minutos.", 429,
      { retry_after_s: 600 });
  }

  // 7. Idempotencia
  const { data: existingIdem } = await db
    .from("guest_order_idempotency")
    .select("order_id, business_id")
    .eq("idempotency_key", idempotency_key)
    .maybeSingle();

  if (existingIdem) {
    if (existingIdem.business_id !== businessId)
      return errResponse("VALIDATION", "idempotency_key inválida para este negocio", 400);

    const { data: existingOrder } = await db
      .from("orders")
      .select("id, approval_status, subtotal_cents, total_cents")
      .eq("id", existingIdem.order_id)
      .single();

    const { data: existingItems } = await db
      .from("order_items")
      .select("qty, menu_items!inner(name)")
      .eq("order_id", existingIdem.order_id);

    return jsonResponse({
      order_id:        existingOrder?.id,
      approval_status: existingOrder?.approval_status ?? "awaiting",
      subtotal_cents:  existingOrder?.subtotal_cents,
      total_cents:     existingOrder?.total_cents,
      // deno-lint-ignore no-explicit-any
      items: (existingItems ?? []).map((r: any) => ({
        name: (r.menu_items as { name: string }).name,
        qty:  r.qty as number,
      })),
    });
  }

  // 8. Calcular precios en servidor (nunca del cliente)
  // deno-lint-ignore no-explicit-any
  const priced = await priceLinesFromDb(db as any, businessId, items.map((it) => ({
    menu_item_id: it.menu_item_id,
    qty:          it.qty,
    options:      it.options as Record<string, unknown> | undefined,
  })));

  if ("error" in priced)
    return errResponse("MENU_ITEM_UNAVAILABLE", (priced as { error: string }).error,
      (priced as { status?: number }).status ?? 409);

  const { lineUnitCents, resolvedOptions, subtotalCents } = priced as {
    lineUnitCents:   number[];
    resolvedOptions: Array<Record<string, unknown>>;
    subtotalCents:   number;
  };

  // 9. Insertar orden con approval_status='awaiting' y status='confirmed'
  //    (Punto 1/8-a: insertamos directamente 'confirmed' para evitar el double-write del trigger)
  const { data: order, error: orderErr } = await db
    .from("orders")
    .insert({
      business_id:       businessId,
      table_id:          tableId,
      table_label:       tableLabel,
      order_type:        "table",
      status:            "confirmed",      // D/8-a: directo, el trigger no necesita corregirlo
      source:            "customer_tab",
      approval_status:   "awaiting",       // F4: espera aprobación del mesero
      guest_device_id:   device_id,
      guest_session_id:  null,             // sin sesión de invitado
      contact_name:      contact_name ?? null,
      notes:             notes ?? null,
      subtotal_cents:    subtotalCents,
      tax_cents:         0,
      tip_cents:         0,
      discount_cents:    0,
      total_cents:       subtotalCents,
      paid_at:           null,
      taken_by:          null,             // lo fija pos_approve_order (D-14)
      status_updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (orderErr || !order)
    return errResponse("INTERNAL", "Error al crear la orden", 500);

  const orderItemsPayload = items.map((it, i) => ({
    order_id:             order.id,
    menu_item_id:         it.menu_item_id,
    qty:                  it.qty,
    price_cents:          lineUnitCents[i],
    options:              resolvedOptions[i] ?? null,
    special_instructions: it.special_instructions ?? null,
    item_status:          "pending",
  }));

  const { error: itemsErr } = await db.from("order_items").insert(orderItemsPayload);

  if (itemsErr) {
    await db.from("orders").delete().eq("id", order.id);
    return errResponse("INTERNAL", "Error al insertar ítems de la orden", 500);
  }

  // 10. Registrar idempotencia con manejo de carrera
  const { error: idemInsertErr } = await db.from("guest_order_idempotency").insert({
    idempotency_key,
    business_id: businessId,
    order_id:    order.id,
  });

  if (idemInsertErr) {
    if ((idemInsertErr as { code?: string }).code === "23505") {
      const { data: raceIdem } = await db
        .from("guest_order_idempotency")
        .select("order_id")
        .eq("idempotency_key", idempotency_key)
        .maybeSingle();

      if (raceIdem?.order_id) {
        await db.from("orders").delete().eq("id", order.id);
        const { data: raceOrder } = await db
          .from("orders")
          .select("id, approval_status, subtotal_cents, total_cents")
          .eq("id", raceIdem.order_id).single();
        const { data: raceItems } = await db
          .from("order_items").select("qty, menu_items!inner(name)")
          .eq("order_id", raceIdem.order_id);
        return jsonResponse({
          order_id:        raceOrder?.id,
          approval_status: raceOrder?.approval_status ?? "awaiting",
          subtotal_cents:  raceOrder?.subtotal_cents,
          total_cents:     raceOrder?.total_cents,
          // deno-lint-ignore no-explicit-any
          items: (raceItems ?? []).map((r: any) => ({
            name: (r.menu_items as { name: string }).name,
            qty:  r.qty as number,
          })),
        });
      }
    }
    console.error("[guest-tab] Error insertando idempotency para no_code (no crítico):", idemInsertErr.message);
  }

  const { data: createdItems } = await db
    .from("order_items").select("qty, menu_items!inner(name)").eq("order_id", order.id);

  return jsonResponse({
    order_id:        order.id,
    approval_status: "awaiting",
    subtotal_cents:  subtotalCents,
    total_cents:     subtotalCents,
    // deno-lint-ignore no-explicit-any
    items: (createdItems ?? []).map((r: any) => ({
      name: (r.menu_items as { name: string }).name,
      qty:  r.qty as number,
    })),
  });
}

// ─── F4: order_status ─────────────────────────────────────────────────────────
// Muestra el estado de los pedidos del cliente (sus propios, no los de la mesa completa).
// Por sesión O por table_qr_token + device_id (pedidos sin código, últimas 12 h).

async function handleOrderStatus(body: Record<string, unknown>): Promise<Response> {
  const { session_token, table_qr_token, device_id } = body as {
    session_token?:  string;
    table_qr_token?: string;
    device_id?:      string;
  };

  if (!session_token && (!table_qr_token || !device_id))
    return errResponse("VALIDATION", "Se requiere session_token O (table_qr_token + device_id)", 400);

  const db = getAdminClient();
  let businessId: string;
  let tableId: string | null = null;
  let queryBySession = false;
  let sessionId: string | null = null;

  if (session_token) {
    // Con sesión de invitado
    const tokenHash = await sha256Hex(session_token);
    const { data: sess } = await db
      .from("guest_tab_sessions")
      .select("id, business_id, table_id")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (!sess) return errResponse("SESSION_INVALID", "Sesión inválida o expirada", 401);
    businessId   = sess.business_id;
    tableId      = sess.table_id;
    sessionId    = sess.id;
    queryBySession = true;
  } else {
    // Sin sesión: por table_qr_token + device_id
    const { data: tbl } = await db
      .from("tables")
      .select("id, business_id")
      .eq("qr_token", table_qr_token!)
      .eq("is_active", true)
      .maybeSingle();
    if (!tbl) return errResponse("TABLE_NOT_FOUND", "Mesa no encontrada", 404);
    businessId = tbl.business_id;
    tableId    = tbl.id;
  }

  // Verificar customer_status_enabled (D-12)
  const { data: bizCfg } = await db
    .from("businesses")
    .select("kds_settings")
    .eq("id", businessId)
    .single();

  const enabled = (bizCfg?.kds_settings as Record<string, unknown>)?.customer_status_enabled === true;
  if (!enabled) return jsonResponse({ enabled: false, orders: [] });

  // Cargar pedidos del cliente (por session_id O por device_id + table + 12h)
  let ordersQuery = db
    .from("orders")
    .select("id, created_at, approval_status, rejected_reason")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (queryBySession) {
    ordersQuery = ordersQuery.eq("guest_session_id", sessionId!);
  } else {
    const twelveHAgo = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
    ordersQuery = ordersQuery
      .eq("table_id", tableId!)
      .eq("guest_device_id", device_id!)
      .is("guest_session_id", null)
      .gte("created_at", twelveHAgo);
  }

  const { data: orders } = await ordersQuery;

  if (!orders || orders.length === 0) return jsonResponse({ enabled: true, orders: [] });

  const orderIds = orders.map((o: { id: string }) => o.id);

  const { data: allItems } = await db
    .from("order_items")
    .select("order_id, qty, item_status, menu_items!inner(name)")
    .in("order_id", orderIds);

  // Mapear por order_id
  const itemsByOrder = new Map<string, Array<{ name: string; qty: number; item_status: string }>>();
  for (const it of ((allItems ?? []) as unknown) as Array<{ order_id: string; qty: number; item_status: string; menu_items: { name: string } }>) {
    const bucket = itemsByOrder.get(it.order_id) ?? [];
    bucket.push({ name: it.menu_items.name, qty: it.qty, item_status: it.item_status });
    itemsByOrder.set(it.order_id, bucket);
  }

  const result = (orders as Array<{
    id: string; created_at: string;
    approval_status: string | null; rejected_reason: string | null;
  }>).map((o) => {
    // rejected_reason_kind: protege el motivo literal del cliente (D-spec § 5)
    let rejectedReasonKind: "edited" | "rejected" | null = null;
    if (o.approval_status === "rejected") {
      rejectedReasonKind = o.rejected_reason === "edited_by_waiter" ? "edited" : "rejected";
    }
    return {
      order_id:             o.id,
      created_at:           o.created_at,
      approval_status:      o.approval_status,        // null | 'awaiting' | 'approved' | 'rejected'
      rejected_reason_kind: rejectedReasonKind,
      items:                (itemsByOrder.get(o.id) ?? []).map((it) => ({
        name:        it.name,
        qty:         it.qty,
        item_status: it.item_status,
      })),
    };
  });

  return jsonResponse({ enabled: true, orders: result });
}

// ─── F5: Stripe helper ────────────────────────────────────────────────────────

function getStripe(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2024-06-20" });
}

// ─── F5: Session validation helper ────────────────────────────────────────────

async function validateGuestSession(sessionToken: string): Promise<{
  sessionId: string;
  businessId: string;
  tableId: string;
  tableLabel: string;
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean | null;
  bizStatus: string | null;
  posPaymentMode: string;
} | null> {
  const db = getAdminClient();
  const tokenHash = await sha256Hex(sessionToken);

  const { data: rows } = await db.rpc("guest_tab_session_validate", { p_token_hash: tokenHash });
  if (!rows || rows.length === 0) return null;

  const sess = rows[0] as { business_id: string };

  const { data: sessionRow } = await db
    .from("guest_tab_sessions")
    .select("id, table_id, expires_at")
    .eq("token_hash", tokenHash)
    .single();

  if (!sessionRow) return null;

  const { data: tbl } = await db
    .from("tables")
    .select("label")
    .eq("id", sessionRow.table_id)
    .single();

  const { data: biz } = await db
    .from("businesses")
    .select("stripe_account_id, stripe_charges_enabled, status, pos_payment_mode")
    .eq("id", sess.business_id)
    .single();

  return {
    sessionId:           (sessionRow as { id: string }).id,
    businessId:          sess.business_id,
    tableId:             (sessionRow as { table_id: string }).table_id,
    tableLabel:          (tbl as { label?: string })?.label ?? "",
    stripeAccountId:     (biz as { stripe_account_id?: string | null })?.stripe_account_id ?? null,
    stripeChargesEnabled: (biz as { stripe_charges_enabled?: boolean | null })?.stripe_charges_enabled ?? null,
    bizStatus:           (biz as { status?: string | null })?.status ?? null,
    posPaymentMode:      (biz as { pos_payment_mode?: string })?.pos_payment_mode ?? "stripe",
  };
}

// ─── F5: Generate receipt code (22-char base64url) ────────────────────────────

function generateReceiptCode(): string {
  const raw = new Uint8Array(16);
  crypto.getRandomValues(raw);
  return btoa(String.fromCharCode(...raw))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// ─── F5: handleSummary ────────────────────────────────────────────────────────

async function handleSummary(body: Record<string, unknown>): Promise<Response> {
  const { session_token } = body as { session_token?: string };
  if (!session_token) return errResponse("VALIDATION", "session_token requerido", 400);

  const sess = await validateGuestSession(session_token);
  if (!sess) return errResponse("SESSION_INVALID", "La sesión ha expirado o no es válida.", 401);

  const db = getAdminClient();

  const { data: summary, error: sumErr } = await db.rpc("pos_guest_table_summary", {
    p_business_id: sess.businessId,
    p_table_id:    sess.tableId,
  });

  if (sumErr) {
    console.error("[guest-tab] pos_guest_table_summary error:", sumErr.message);
    return errResponse("DB_ERROR", "Error al cargar el resumen", 500);
  }

  const data = summary as {
    balance: {
      session_opened_at:     string | null;
      items_unpaid_cents:    number;
      paid_unallocated_cents: number;
      due_cents:             number;
      guest_processing_cents: number;
    };
    items:    unknown[];
    payments: unknown[];
  };

  const canPay = sess.posPaymentMode === "stripe";

  // If can_pay and there's an even plan in progress, include it
  let evenPlan: unknown[] | undefined;
  if (canPay) {
    try {
      const { data: plan } = await db.rpc("pos_guest_even_plan", {
        p_business_id: sess.businessId,
        p_table_id:    sess.tableId,
        p_ways:        null as unknown as number, // null = only return existing plan, don't create
      });
      if (Array.isArray(plan) && plan.length > 0) {
        evenPlan = plan;
      }
    } catch {
      // ignore — no plan exists
    }
  }

  return jsonResponse({
    pos_payment_mode: sess.posPaymentMode,
    can_pay:          canPay,
    table_label:      sess.tableLabel,
    balance:          data.balance,
    items:            data.items ?? [],
    payments:         data.payments ?? [],
    ...(evenPlan ? { even_plan: evenPlan } : {}),
  });
}

// ─── F5: handleCreatePayment ──────────────────────────────────────────────────

async function handleCreatePayment(body: Record<string, unknown>): Promise<Response> {
  const { session_token, split_kind, ways, payment_id: evenPaymentId,
          order_item_ids, amount_cents: amountInput, tip_cents: tipInput } = body as {
    session_token?:   string;
    split_kind?:      string;
    ways?:            number;
    payment_id?:      string;
    order_item_ids?:  string[];
    amount_cents?:    number;
    tip_cents?:       number;
  };

  if (!session_token) return errResponse("VALIDATION", "session_token requerido", 400);
  if (!split_kind)    return errResponse("VALIDATION", "split_kind requerido", 400);

  const sess = await validateGuestSession(session_token);
  if (!sess) return errResponse("SESSION_INVALID", "La sesión ha expirado o no es válida.", 401);

  if (sess.posPaymentMode !== "stripe") {
    return errResponse("MODE_NOT_ALLOWED", "El negocio no acepta pagos en línea", 403);
  }

  const gate = businessChargeGate({
    stripe_account_id:     sess.stripeAccountId,
    status:                sess.bizStatus,
    stripe_charges_enabled: sess.stripeChargesEnabled,
  });
  if (gate) return errResponse("STRIPE_ERROR", gate.error, gate.status);

  const db = getAdminClient();

  // Load balance
  const { data: balData, error: balErr } = await db.rpc("pos_table_balance", {
    p_business_id: sess.businessId,
    p_table_id:    sess.tableId,
  });
  if (balErr) return errResponse("DB_ERROR", "Error al cargar saldo", 500);

  const bal = balData as {
    due_cents:              number;
    paid_unallocated_cents: number;
    session_opened_at:      string | null;
  };

  if (!bal || bal.due_cents <= 0) {
    return errResponse("NOTHING_DUE", "No hay saldo pendiente en esta mesa", 409);
  }

  let baseCents = 0;
  let posPaymentId: string | null = null;

  if (split_kind === "full") {
    // Insert processing row for the full amount
    baseCents = bal.due_cents;
    const { data: ins, error: insErr } = await db
      .from("pos_payments")
      .insert({
        business_id:        sess.businessId,
        table_id:           sess.tableId,
        amount_cents:       baseCents,
        kind:               "guest_full",
        status:             "processing",
        source:             "guest",
        claimed_at:         new Date().toISOString(),
        guest_session_id:   sess.sessionId,
        session_opened_at:  bal.session_opened_at,
      })
      .select("id")
      .single();
    if (insErr || !ins) return errResponse("DB_ERROR", "No se pudo crear el pago", 500);
    posPaymentId = (ins as { id: string }).id;

  } else if (split_kind === "even") {
    // Claim an existing share or create the plan
    if (evenPaymentId) {
      // Claim a specific share
      const { data: claimed } = await db.rpc("pos_guest_claim_share", {
        p_payment_id:       evenPaymentId,
        p_guest_session_id: sess.sessionId,
      });
      if (!claimed) return errResponse("SHARE_TAKEN", "Esta parte ya fue tomada por otro cliente", 409);
      posPaymentId = evenPaymentId;
      // Load amount from the row
      const { data: row } = await db.from("pos_payments").select("amount_cents").eq("id", evenPaymentId).single();
      baseCents = (row as { amount_cents: number })?.amount_cents ?? 0;
    } else {
      // Create plan or get existing, then claim first claimable
      if (!ways || ways < 2 || ways > 20) {
        return errResponse("INVALID_WAYS", "ways debe estar entre 2 y 20", 422);
      }
      const { data: plan, error: planErr } = await db.rpc("pos_guest_even_plan", {
        p_business_id: sess.businessId,
        p_table_id:    sess.tableId,
        p_ways:        ways,
      });
      if (planErr) {
        const msg = planErr.message;
        if (msg.includes("NOTHING_DUE")) return errResponse("NOTHING_DUE", "No hay saldo pendiente", 409);
        if (msg.includes("INVALID_WAYS")) return errResponse("INVALID_WAYS", "Número de partes inválido", 422);
        return errResponse("DB_ERROR", "Error al crear plan", 500);
      }
      const claimable = (plan as { payment_id: string; amount_cents: number; claimable: boolean }[])
        .find(r => r.claimable);
      if (!claimable) return errResponse("SHARE_TAKEN", "No hay partes disponibles", 409);

      const { data: claimed } = await db.rpc("pos_guest_claim_share", {
        p_payment_id:       claimable.payment_id,
        p_guest_session_id: sess.sessionId,
      });
      if (!claimed) return errResponse("SHARE_TAKEN", "La parte fue tomada por otro cliente", 409);
      posPaymentId = claimable.payment_id;
      baseCents    = claimable.amount_cents;
    }

  } else if (split_kind === "items") {
    if (bal.paid_unallocated_cents > 0) {
      return errResponse("ITEMS_SPLIT_UNAVAILABLE", "Ya hay pagos por monto; usa partes iguales o monto libre", 409);
    }
    if (!order_item_ids || order_item_ids.length === 0) {
      return errResponse("VALIDATION", "order_item_ids requerido para split por ítems", 400);
    }
    // Validate items and compute amount
    const { data: rows, error: itemsErr } = await db
      .from("order_items")
      .select("id, price_cents, qty, paid_at, order_id, orders!inner(table_id, canceled_at, paid_at)")
      .in("id", order_item_ids);
    if (itemsErr) return errResponse("DB_ERROR", "Error al validar ítems", 500);
    const items = (rows as unknown) as {
      id: string; price_cents: number; qty: number; paid_at: string | null;
      orders: { table_id: string; canceled_at: string | null; paid_at: string | null };
    }[];
    for (const it of items) {
      if (it.paid_at) return errResponse("ITEM_ALREADY_PAID", `Ítem ${it.id} ya fue pagado`, 409);
      if (it.orders.table_id !== sess.tableId) return errResponse("ITEM_RESERVED", "Ítem no pertenece a esta mesa", 409);
      if (it.orders.canceled_at || it.orders.paid_at) return errResponse("ITEM_ALREADY_PAID", "Orden ya cerrada", 409);
    }
    // Check none are reserved
    const { data: reserved } = await db
      .from("pos_payments")
      .select("order_item_ids")
      .eq("status", "processing")
      .gt("claimed_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
    const reservedIds = new Set<string>();
    for (const r of (reserved ?? []) as { order_item_ids: string[] | null }[]) {
      (r.order_item_ids ?? []).forEach(id => reservedIds.add(id));
    }
    for (const id of order_item_ids) {
      if (reservedIds.has(id)) return errResponse("ITEM_RESERVED", `Ítem ${id} ya está reservado`, 409);
    }
    baseCents = items.reduce((s, it) => s + it.price_cents * it.qty, 0);
    const { data: ins, error: insErr } = await db
      .from("pos_payments")
      .insert({
        business_id:        sess.businessId,
        table_id:           sess.tableId,
        amount_cents:       baseCents,
        kind:               "guest_items",
        order_item_ids:     order_item_ids,
        status:             "processing",
        source:             "guest",
        claimed_at:         new Date().toISOString(),
        guest_session_id:   sess.sessionId,
        session_opened_at:  bal.session_opened_at,
      })
      .select("id")
      .single();
    if (insErr || !ins) return errResponse("DB_ERROR", "No se pudo crear el pago", 500);
    posPaymentId = (ins as { id: string }).id;

  } else if (split_kind === "amount") {
    const aCents = typeof amountInput === "number" ? Math.floor(amountInput) : 0;
    if (aCents < 50 || aCents > bal.due_cents) {
      return errResponse("AMOUNT_OUT_OF_RANGE", `amount_cents debe estar entre 50 y ${bal.due_cents}`, 422);
    }
    baseCents = aCents;
    const { data: ins, error: insErr } = await db
      .from("pos_payments")
      .insert({
        business_id:        sess.businessId,
        table_id:           sess.tableId,
        amount_cents:       baseCents,
        kind:               "guest_amount",
        status:             "processing",
        source:             "guest",
        claimed_at:         new Date().toISOString(),
        guest_session_id:   sess.sessionId,
        session_opened_at:  bal.session_opened_at,
      })
      .select("id")
      .single();
    if (insErr || !ins) return errResponse("DB_ERROR", "No se pudo crear el pago", 500);
    posPaymentId = (ins as { id: string }).id;

  } else {
    return errResponse("VALIDATION", `split_kind desconocido: ${split_kind}`, 400);
  }

  // Validate tip
  const tipCents = typeof tipInput === "number" && tipInput >= 0
    ? Math.min(Math.floor(tipInput), baseCents)
    : 0;
  if (typeof tipInput === "number" && tipInput > baseCents) {
    return errResponse("TIP_OUT_OF_RANGE", "tip_cents no puede superar el monto base", 422);
  }
  const totalCents = baseCents + tipCents;

  // Create Stripe PaymentIntent (destination charges — same model as guest-pay)
  const stripe = getStripe();
  let pi: Stripe.PaymentIntent;
  try {
    const piParams = buildConnectPiParams({
      amountCents:     totalCents,
      currency:        "usd",
      metadata: {
        payment_kind:   "pos_guest",
        pos_payment_id: posPaymentId!,
        business_id:    sess.businessId,
        table_id:       sess.tableId,
        base_cents:     String(baseCents),
        tip_cents:      String(tipCents),
      },
      stripeAccountId: sess.stripeAccountId!,
    });
    pi = await stripe.paymentIntents.create(piParams);
  } catch (err) {
    // Roll back the processing row
    await db.from("pos_payments").update({ status: "failed" }).eq("id", posPaymentId!);
    const msg = err instanceof Error ? err.message : "Stripe error";
    console.error("[guest-tab] PI create error:", msg);
    return errResponse("STRIPE_ERROR", msg, 502);
  }

  // Save stripe_pi_id on the row
  await db.from("pos_payments").update({ stripe_pi_id: pi.id }).eq("id", posPaymentId!);

  const publishableKey = Deno.env.get("EXPO_PUBLIC_STRIPE_PK") ?? "";

  return jsonResponse({
    pos_payment_id:  posPaymentId,
    client_secret:   pi.client_secret,
    publishable_key: publishableKey,
    stripe_account_id: sess.stripeAccountId,
    base_cents:      baseCents,
    tip_cents:       tipCents,
    total_cents:     totalCents,
  });
}

// ─── F5: handleConfirmPayment ─────────────────────────────────────────────────

async function handleConfirmPayment(body: Record<string, unknown>): Promise<Response> {
  const { session_token, pos_payment_id } = body as {
    session_token?:   string;
    pos_payment_id?:  string;
  };
  if (!session_token)   return errResponse("VALIDATION", "session_token requerido", 400);
  if (!pos_payment_id)  return errResponse("VALIDATION", "pos_payment_id requerido", 400);

  const sess = await validateGuestSession(session_token);
  if (!sess) return errResponse("SESSION_INVALID", "La sesión ha expirado o no es válida.", 401);

  const db = getAdminClient();

  // Load the payment row
  const { data: payRow, error: payErr } = await db
    .from("pos_payments")
    .select("id, business_id, table_id, amount_cents, stripe_pi_id, status, receipt_code, kind, source, session_opened_at")
    .eq("id", pos_payment_id)
    .maybeSingle();

  if (payErr || !payRow) return errResponse("PAYMENT_NOT_FOUND", "Pago no encontrado", 404);

  const pay = payRow as {
    id: string; business_id: string; table_id: string; amount_cents: number;
    stripe_pi_id: string | null; status: string; receipt_code: string | null;
    kind: string; source: string; session_opened_at: string | null;
  };

  if (pay.source !== "guest") return errResponse("PAYMENT_NOT_FOUND", "Pago no encontrado", 404);
  if (pay.table_id !== sess.tableId) return errResponse("PAYMENT_NOT_FOUND", "Pago no pertenece a esta mesa", 404);

  // Idempotent: already succeeded
  if (pay.status === "succeeded") {
    const { data: balNow } = await db.rpc("pos_table_balance", {
      p_business_id: sess.businessId, p_table_id: sess.tableId,
    });
    return jsonResponse({
      ok: true, status: "succeeded", tab_closed: (balNow as { due_cents: number })?.due_cents === 0,
      receipt_code: pay.receipt_code,
      remaining_due_cents: (balNow as { due_cents: number })?.due_cents ?? 0,
    });
  }

  if (!pay.stripe_pi_id) return errResponse("PAYMENT_NOT_FOUND", "Sin PaymentIntent asociado", 422);

  // Retrieve PI from Stripe
  const stripe = getStripe();
  const gate = businessChargeGate({
    stripe_account_id: sess.stripeAccountId, status: sess.bizStatus,
    stripe_charges_enabled: sess.stripeChargesEnabled,
  });
  if (gate) return errResponse("STRIPE_ERROR", gate.error, gate.status);

  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe.paymentIntents.retrieve(
      pay.stripe_pi_id,
      { expand: ["charges.data.payment_method_details"] },
    );
  } catch (err) {
    return errResponse("STRIPE_ERROR", err instanceof Error ? err.message : "Stripe error", 502);
  }

  if (pi.status === "requires_payment_method" || pi.status === "canceled") {
    // Release the reservation
    const releaseStatus = pay.kind === "guest_even" ? "pending" : "failed";
    await db.from("pos_payments").update({
      status: releaseStatus,
      claimed_at: releaseStatus === "pending" ? null : undefined,
    }).eq("id", pos_payment_id);
    return errResponse("NOT_SUCCEEDED", `El pago no fue completado (${pi.status})`, 402);
  }

  if (pi.status !== "succeeded") {
    return jsonResponse({ ok: false, status: pi.status });
  }

  // Apply payment
  const tipCents = Math.max(0, pi.amount - pay.amount_cents);
  const { error: applyErr } = await db.rpc("pos_apply_payment", {
    p_payment_id: pos_payment_id,
    p_tip_cents:  tipCents,
  });
  if (applyErr) {
    console.error("[guest-tab] pos_apply_payment error:", applyErr.message);
    return errResponse("DB_ERROR", "Error al aplicar pago", 500);
  }

  // Write receipt_code + card details
  let receiptCode = pay.receipt_code;
  if (!receiptCode) {
    try {
      const code = generateReceiptCode();
      const charge = (pi as unknown as { charges?: { data: unknown[] } }).charges?.data?.[0] as
        { payment_method_details?: { card?: { brand?: string; last4?: string } } } | null ?? null;
      const cardInfo = charge?.payment_method_details?.card ?? null;
      const { error: rcErr } = await db
        .from("pos_payments")
        .update({ receipt_code: code, card_brand: cardInfo?.brand ?? null, card_last4: cardInfo?.last4 ?? null })
        .eq("id", pos_payment_id)
        .is("receipt_code", null);
      if (!rcErr) receiptCode = code;
    } catch (e) {
      console.error("[guest-tab] receipt injection failed:", e);
    }
  }

  const { data: balFinal } = await db.rpc("pos_table_balance", {
    p_business_id: sess.businessId, p_table_id: sess.tableId,
  });
  const remainingDue = (balFinal as { due_cents: number })?.due_cents ?? 0;

  return jsonResponse({
    ok: true, status: "succeeded", tab_closed: remainingDue === 0,
    receipt_code: receiptCode, remaining_due_cents: remainingDue,
  });
}

// ─── F5: handleCancelPayment ──────────────────────────────────────────────────

async function handleCancelPayment(body: Record<string, unknown>): Promise<Response> {
  const { session_token, pos_payment_id } = body as {
    session_token?:  string;
    pos_payment_id?: string;
  };
  if (!session_token)  return errResponse("VALIDATION", "session_token requerido", 400);
  if (!pos_payment_id) return errResponse("VALIDATION", "pos_payment_id requerido", 400);

  const sess = await validateGuestSession(session_token);
  if (!sess) return errResponse("SESSION_INVALID", "La sesión ha expirado o no es válida.", 401);

  const db = getAdminClient();

  const { data: row } = await db
    .from("pos_payments")
    .select("id, kind, status, stripe_pi_id, guest_session_id, source")
    .eq("id", pos_payment_id)
    .maybeSingle();

  if (!row) return jsonResponse({ ok: true });  // idempotent

  const pay = row as {
    id: string; kind: string; status: string;
    stripe_pi_id: string | null; guest_session_id: string | null; source: string;
  };

  if (pay.source !== "guest") return jsonResponse({ ok: true });

  if (pay.status === "processing") {
    const releaseStatus = pay.kind === "guest_even" ? "pending" : "failed";
    await db.from("pos_payments").update({
      status: releaseStatus,
      claimed_at: releaseStatus === "pending" ? null : undefined,
      guest_session_id: releaseStatus === "pending" ? null : undefined,
    }).eq("id", pos_payment_id).eq("status", "processing");

    // Cancel the PI if it exists
    if (pay.stripe_pi_id) {
      try {
        const stripe = getStripe();
        await stripe.paymentIntents.cancel(pay.stripe_pi_id);
      } catch (e) {
        console.error("[guest-tab] cancel PI non-fatal:", e instanceof Error ? e.message : e);
      }
    }
  }

  return jsonResponse({ ok: true });
}

// ─── Entry point ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST")   return errResponse("METHOD_NOT_ALLOWED", "Método no permitido", 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return errResponse("INVALID_JSON", "JSON inválido en el cuerpo de la petición", 400);
  }

  const action = body.action as string | undefined;

  switch (action) {
    case "create_session":    return handleCreateSession(body, req);
    case "session_status":    return handleSessionStatus(body);
    case "add_order":         return handleAddOrder(body);
    case "add_order_no_code": return handleAddOrderNoCode(body, req);  // F4
    case "order_status":      return handleOrderStatus(body);           // F4
    case "summary":           return handleSummary(body);               // F5
    case "create_payment":    return handleCreatePayment(body);         // F5
    case "confirm_payment":   return handleConfirmPayment(body);        // F5
    case "cancel_payment":    return handleCancelPayment(body);         // F5
    default:
      return errResponse("UNKNOWN_ACTION", `Acción desconocida: ${action ?? "(vacía)"}`, 400);
  }
});
