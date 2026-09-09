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
import { priceLinesFromDb } from "../_shared/pricing.ts";
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
    options:      it.options,
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
  for (const it of (allItems ?? []) as Array<{ order_id: string; qty: number; item_status: string; menu_items: { name: string } }>) {
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
    default:
      return errResponse("UNKNOWN_ACTION", `Acción desconocida: ${action ?? "(vacía)"}`, 400);
  }
});
