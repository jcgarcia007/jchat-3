/**
 * JChat 3.0 — Menu Assistant Edge Function (FASE 2)
 *
 * AI-assisted menu building for business owners. Five actions dispatched via
 * { action: string } in the JSON body:
 *
 *   suggest_categories { business_id, business_type, sells[], country, currency, price_range }
 *                                          → { ok, categories: [{ name, emoji?, rationale }] }
 *   suggest_items      { business_id, business_type, country, currency, price_range,
 *                        category_name, count? }
 *                                          → { ok, items: [{ name, description_es, description_en,
 *                                                            price_cents, station, tags[] }] }
 *   refine_item        { business_id, item_name, category_name, business_type, country }
 *                                          → { ok, groups, options, modifier_groups }
 *   polish_item        { business_id, name, description?, direction? }
 *                                          → { ok, description_es, description_en, tags[] }
 *                                          | { ok, translated }
 *
 * ── Security invariants ──────────────────────────────────────────────────────
 *   • Every action resolves auth.uid() server-side from the caller's JWT — the
 *     body never supplies a user id.
 *   • Every action re-checks businesses.owner_id === user.id AND
 *     businesses.plan === 'pro' with the SERVICE-ROLE client. The Pro gate lives
 *     here, not only in the dashboard UI.
 *   • Nothing is written to the DB by this function. It only READS menu context
 *     (menu_items / menu_categories) to feed the prompt. All inserts happen
 *     client-side in the wizard (FASE 5), always with is_published = false.
 *   • ANTHROPIC_API_KEY never leaves the server.
 *
 *   generate_images  { business_id, item_name, description?, style?, style_hint?,
 *                      reference_image_urls?: string[], count? (default 5, cap 6) }
 *                                          → { ok, images: string[] }  (Storage public URLs)
 *
 *   When reference_image_urls is provided the function uses
 *   POST /v1/images/edits (gpt-image-1, multipart/form-data) so the model uses
 *   those images as style/composition reference. Without reference_image_urls the
 *   function falls back to POST /v1/images/generations (current text-to-image flow).
 *   style_hint overrides the default photography prompt prefix.
 *
 * ── Required env vars ────────────────────────────────────────────────────────
 *   ANTHROPIC_API_KEY         — Anthropic API key (supabase secrets set ...)
 *   GEMINI_API_KEY            — Google AI API key for image generation
 *   GEMINI_IMAGE_MODEL        — (optional) override the Gemini image model ID;
 *                               default: "gemini-2.0-flash-preview-image-generation"
 *                               Verify current name at:
 *                               https://ai.google.dev/gemini-api/docs/models
 *                               NOTE: Imagen (:predict endpoint) deprecated Aug 17 2026.
 *   SUPABASE_URL              — auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY — set in Edge Function secrets
 *   SUPABASE_ANON_KEY         — for JWT verification (same as other functions)
 *
 * Deploy (Juan, manually — NOT part of this task):
 *   supabase functions deploy menu-assistant
 */

// ── Imports ───────────────────────────────────────────────────────────────────

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.44.4";

// ── Supabase clients (same pattern as functions/terminal/index.ts) ────────────

/** Admin (service role) client — bypasses RLS for server-side reads. */
function getAdminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** User-scoped (anon + caller token) client — used only to resolve the user. */
function getUserClient(authHeader: string): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  return createClient(url, key, {
    global: { headers: { Authorization: authHeader } },
  });
}

// ── CORS + response helpers ───────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

/** Every failure is { ok: false, error: <code> }. Codes are stable contract. */
function errorResponse(code: string, status = 400): Response {
  return jsonResponse({ ok: false, error: code }, status);
}

/** Every success is { ok: true, ...payload }. */
function okResponse(payload: Record<string, unknown>): Response {
  return jsonResponse({ ok: true, ...payload });
}

// ── Auth: resolve the caller from the JWT ─────────────────────────────────────

async function verifyCaller(req: Request): Promise<{ authUserId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    console.error("[menu-assistant] missing/invalid Authorization header");
    return errorResponse("unauthorized", 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    console.error("[menu-assistant] SUPABASE_URL or SUPABASE_ANON_KEY not set");
    return errorResponse("service_not_configured", 500);
  }

  const userClient = getUserClient(authHeader);
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    console.error("[menu-assistant] auth.getUser failed:", authError?.message ?? "no user");
    return errorResponse("unauthorized", 401);
  }
  return { authUserId: user.id };
}

// ── Pro gate (SERVER-SIDE, every action) ──────────────────────────────────────

/**
 * The business must exist, be owned by the caller, and be on the Pro plan.
 * Returns null on success or a Response to return immediately.
 * All three failure modes collapse to `pro_required` for the client so the
 * endpoint can't be used to probe which business ids exist.
 */
async function requireProOwner(
  db: SupabaseClient,
  businessId: string,
  authUserId: string,
): Promise<Response | null> {
  const { data, error } = await db
    .from("businesses")
    .select("id, owner_id, plan")
    .eq("id", businessId)
    .maybeSingle();

  if (error) {
    console.error("[menu-assistant] businesses lookup error:", error.message);
    return errorResponse("service_not_configured", 500);
  }

  const business = data as { id: string; owner_id: string; plan: string } | null;

  if (!business) {
    console.error(`[menu-assistant] business not found: ${businessId}`);
    return errorResponse("pro_required", 403);
  }
  if (business.owner_id !== authUserId) {
    console.error(
      `[menu-assistant] owner mismatch for business=${businessId} user=${authUserId}`,
    );
    return errorResponse("pro_required", 403);
  }
  if (business.plan !== "pro") {
    console.error(`[menu-assistant] plan=${business.plan} for business=${businessId}`);
    return errorResponse("pro_required", 403);
  }
  return null;
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

const ANTHROPIC_MODEL = "claude-sonnet-4-6";

interface AnthropicTextBlock {
  type: string;
  text?: string;
}

/**
 * Single helper for every Anthropic call. Always asks for JSON and parses it.
 * Throws:
 *   Error('service_not_configured')  — ANTHROPIC_API_KEY missing
 *   Error('anthropic_error_<status>') — non-2xx from the API
 *   Error('bad_ai_response')          — response wasn't parseable JSON
 */
async function askClaude(
  system: string,
  userMsg: string,
  maxTokens = 2000,
): Promise<unknown> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("[menu-assistant] ANTHROPIC_API_KEY is not set — set it with `supabase secrets set ANTHROPIC_API_KEY=...`");
    throw new Error("service_not_configured");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[menu-assistant] anthropic ${res.status}: ${detail.slice(0, 500)}`);
    throw new Error(`anthropic_error_${res.status}`);
  }

  const data = await res.json() as { content?: AnthropicTextBlock[] };
  const text = (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");

  // Strip markdown code fences if the model wrapped the JSON anyway.
  const clean = text.replace(/```json\s*|```/g, "").trim();

  try {
    return JSON.parse(clean);
  } catch {
    console.error("[menu-assistant] bad_ai_response, first 300 chars:", clean.slice(0, 300));
    throw new Error("bad_ai_response");
  }
}

// ── Prompt building blocks ────────────────────────────────────────────────────

const SYSTEM_BASE =
  "Eres un experto en menús de restaurantes y hospitalidad. " +
  "Respondes ÚNICAMENTE con JSON válido según el esquema indicado, " +
  "sin texto adicional, sin markdown, sin bloques de código.";

/** Fixed dietary-tag vocabulary the wizard writes into menu_items.dietary_tags. */
const DIETARY_TAGS = [
  "spicy",
  "vegetarian",
  "vegan",
  "gluten_free",
  "contains_nuts",
  "contains_dairy",
  "alcohol",
] as const;

/**
 * Reads up to 30 existing menu items + all categories so the model matches the
 * business's own style and price level, and doesn't repeat what already exists.
 * Never fails the request — on error it just returns an empty context.
 */
async function buildMenuContext(
  db: SupabaseClient,
  businessId: string,
): Promise<string> {
  const [itemsRes, catsRes] = await Promise.all([
    db
      .from("menu_items")
      .select("name, price_cents, description, station")
      .eq("business_id", businessId)
      .order("sort", { ascending: true })
      .limit(30),
    db
      .from("menu_categories")
      .select("name")
      .eq("business_id", businessId)
      .order("sort", { ascending: true })
      .limit(50),
  ]);

  if (itemsRes.error) {
    console.error("[menu-assistant] menu_items context error:", itemsRes.error.message);
  }
  if (catsRes.error) {
    console.error("[menu-assistant] menu_categories context error:", catsRes.error.message);
  }

  const items = (itemsRes.data ?? []) as Array<{
    name: string | null;
    price_cents: number | null;
    description: string | null;
    station: string | null;
  }>;
  const cats = (catsRes.data ?? []) as Array<{ name: string | null }>;

  if (items.length === 0 && cats.length === 0) return "";

  const parts: string[] = [];

  if (cats.length > 0) {
    const names = cats.map((c) => c.name).filter(Boolean).join(", ");
    if (names) parts.push(`Categorías que el negocio YA tiene: ${names}.`);
  }

  if (items.length > 0) {
    const lines = items
      .filter((i) => i.name)
      .map((i) => {
        const price =
          typeof i.price_cents === "number"
            ? ` — ${(i.price_cents / 100).toFixed(2)}`
            : "";
        const station = i.station ? ` [${i.station}]` : "";
        const desc = i.description ? ` — ${i.description}` : "";
        return `- ${i.name}${price}${station}${desc}`;
      });
    if (lines.length > 0) {
      parts.push(
        "El negocio YA tiene estos artículos (estilo y precios de referencia; " +
          "NO los repitas en tus sugerencias):\n" + lines.join("\n"),
      );
    }
  }

  return parts.join("\n\n");
}

// ── Body-field helpers ────────────────────────────────────────────────────────

function str(body: Record<string, unknown>, key: string): string | null {
  const v = body[key];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function strArray(body: Record<string, unknown>, key: string): string[] {
  const v = body[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
}

function intField(body: Record<string, unknown>, key: string): number | null {
  const v = body[key];
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

// ── Action A: suggest_categories ──────────────────────────────────────────────

async function handleSuggestCategories(
  body: Record<string, unknown>,
  db: SupabaseClient,
  businessId: string,
): Promise<Response> {
  const businessType = str(body, "business_type");
  const country = str(body, "country");
  const details = str(body, "details"); // optional free-text ("cocina mexicana, tacos y mariscos")
  // Legacy fields — still accepted for backwards compat.
  const priceRange = str(body, "price_range");
  const sells = strArray(body, "sells");

  if (!businessType) return errorResponse("bad_request", 400);

  const context = await buildMenuContext(db, businessId);

  const system =
    SYSTEM_BASE +
    "\n\nEsquema exacto de la respuesta:\n" +
    '{ "categories": [ { "name": string, "emoji": string, "rationale": string } ] }\n' +
    'El campo "emoji" es opcional pero se prefiere un solo emoji representativo. ' +
    '"rationale" es una frase corta en español explicando por qué esa categoría ' +
    "encaja en este negocio.";

  const userMsg = [
    `Tipo de negocio: ${businessType}`,
    details ? `Especialidad/detalles: ${details}` : null,
    country ? `País: ${country}` : null,
    priceRange ? `Rango de precios: ${priceRange}` : null,
    sells.length > 0 ? `Qué va a vender: ${sells.join(", ")}` : null,
    context || null,
    "",
    "Propón entre 6 y 12 categorías de menú apropiadas para este rubro y país. " +
      "Si se indicó una especialidad o cocina específica, úsala para personalizar " +
      "las categorías (por ejemplo, una taquería mexicana necesita Tacos, Antojitos " +
      "y Aguas Frescas, no 'Entrantes' genéricos). " +
      "Ordénalas como se mostrarían en el menú (de entradas a postres/bebidas, " +
      "o el orden natural del rubro). No repitas categorías que el negocio ya tiene.",
  ]
    .filter((l) => l !== null)
    .join("\n");

  const raw = await askClaude(system, userMsg, 2000);
  const obj = asRecord(raw);
  const list = obj && Array.isArray(obj.categories) ? obj.categories : null;
  if (!list) throw new Error("bad_ai_response");

  const categories = list
    .map((entry) => {
      const c = asRecord(entry);
      if (!c) return null;
      const name = typeof c.name === "string" ? c.name.trim() : "";
      if (!name) return null;
      return {
        name,
        emoji: typeof c.emoji === "string" && c.emoji.trim() !== "" ? c.emoji.trim() : null,
        rationale: typeof c.rationale === "string" ? c.rationale.trim() : "",
      };
    })
    .filter((c): c is { name: string; emoji: string | null; rationale: string } => c !== null);

  if (categories.length === 0) throw new Error("bad_ai_response");

  return okResponse({ categories });
}

// ── Action B: suggest_items ───────────────────────────────────────────────────

async function handleSuggestItems(
  body: Record<string, unknown>,
  db: SupabaseClient,
  businessId: string,
): Promise<Response> {
  const businessType = str(body, "business_type");
  const categoryName = str(body, "category_name");
  const country = str(body, "country");
  const details = str(body, "details"); // optional free-text ("cocina mexicana, tacos y mariscos")
  // Legacy fields — still accepted for backwards compat.
  const priceRange = str(body, "price_range");
  const rawCount = intField(body, "count");
  const count = rawCount !== null ? Math.min(Math.max(rawCount, 1), 20) : 8;

  if (!businessType || !categoryName) return errorResponse("bad_request", 400);

  const context = await buildMenuContext(db, businessId);

  const system =
    SYSTEM_BASE +
    "\n\nEsquema exacto de la respuesta:\n" +
    '{ "items": [ { "name": string, "description_es": string, "description_en": string, ' +
    '"price_cents": number, "station": "kitchen" | "bar", "tags": string[] } ] }\n' +
    `"tags" solo puede contener valores de esta lista fija: ${DIETARY_TAGS.join(", ")}. ` +
    'Usa solo los que apliquen; si ninguno aplica, devuelve un arreglo vacío. ' +
    '"price_cents" es un entero en centavos USD (por ejemplo 1250 = $12.50). ' +
    "Las bebidas (incluidas las alcohólicas y el café de barra) " +
    'usan station "bar"; todo lo demás usa "kitchen".';

  const userMsg = [
    `Tipo de negocio: ${businessType}`,
    `Categoría: ${categoryName}`,
    details ? `Especialidad/detalles del negocio: ${details}` : null,
    country ? `País: ${country}` : null,
    priceRange ? `Rango de precios: ${priceRange}` : null,
    context || null,
    "",
    `Propón exactamente ${count} artículos típicos de la categoría "${categoryName}" ` +
      "para este rubro y país. " +
      (details
        ? `Personaliza los artículos según la especialidad indicada ("${details}") — ` +
          "usa nombres y platos propios de esa cocina o estilo, no genéricos. "
        : "") +
      "Para cada artículo: nombre en el idioma local, " +
      "descripción apetitosa y CORTA (máximo 20 palabras) en español y en inglés, " +
      "precio sugerido en centavos USD acorde al país, estación de preparación " +
      "y etiquetas dietéticas. Incluye marcas locales frecuentes cuando aplique " +
      "(aguas, cervezas, licores del país). No repitas artículos que el negocio ya tiene.",
  ]
    .filter((l) => l !== null)
    .join("\n");

  const raw = await askClaude(system, userMsg, 4000);
  const obj = asRecord(raw);
  const list = obj && Array.isArray(obj.items) ? obj.items : null;
  if (!list) throw new Error("bad_ai_response");

  const allowed = new Set<string>(DIETARY_TAGS);

  const items = list
    .map((entry) => {
      const it = asRecord(entry);
      if (!it) return null;
      const name = typeof it.name === "string" ? it.name.trim() : "";
      if (!name) return null;
      const priceCents =
        typeof it.price_cents === "number" && Number.isFinite(it.price_cents)
          ? Math.max(0, Math.trunc(it.price_cents))
          : 0;
      const station = it.station === "bar" ? "bar" : "kitchen";
      const tags = Array.isArray(it.tags)
        ? it.tags.filter((t): t is string => typeof t === "string" && allowed.has(t))
        : [];
      return {
        name,
        description_es:
          typeof it.description_es === "string" ? it.description_es.trim() : "",
        description_en:
          typeof it.description_en === "string" ? it.description_en.trim() : "",
        price_cents: priceCents,
        station,
        tags,
      };
    })
    .filter((i) => i !== null);

  if (items.length === 0) throw new Error("bad_ai_response");

  return okResponse({ items });
}

// ── Action C: refine_item ─────────────────────────────────────────────────────
//
// ══ FORMATO DE `options` — decisión de FASE 2 ═══════════════════════════════
//
// El editor manual (web/app/dashboard/menu/page.tsx) usa DOS sistemas de
// variantes que conviven en la misma pantalla:
//
//   1. `menu_items.options` (jsonb, sistema legacy pero el que el wizard usa):
//
//        { "sizes":  [ { "label": string, "price_cents": number } ],
//          "extras": [ { "label": string, "price_cents": number } ] }
//
//      - `sizes`  = grupo ÚNICO obligatorio (radio). El cliente debe elegir uno.
//      - `extras` = grupo MÚLTIPLE opcional (checkbox). Cero o varios.
//      - `price_cents` es un DELTA que se SUMA a menu_items.price_cents
//        (verificado en mobile/screens/menu/ProductDetailScreen.tsx y en
//        supabase/functions/_shared/pricing.ts → resolveModifierCents).
//      - Este es el formato que handleSaveItem escribe en `options` y el único
//        que el wizard de FASE 5 va a insertar (inserta solo menu_items).
//
//   2. `modifier_groups` + `menu_item_modifier_groups` (sistema nuevo, N:N):
//
//        { key, label, type: 'single'|'multi', min_select, max_select,
//          choices: [ { label, price_cents } ], sort }
//
//      Soporta N grupos arbitrarios con exclusividad real. handleSaveItem lo
//      escribe cuando el dueño usa el editor de grupos del modal.
//
// DECISIÓN: `refine_item` devuelve LAS TRES REPRESENTACIONES en una sola
// respuesta, para que ningún consumidor tenga que convertir nada:
//
//   • `groups`          → formato natural de la IA. Es lo que la UI de FASE 4
//                         pinta como chips (label + type + options[] con
//                         price_delta_cents). Sin pérdida de información.
//   • `options`         → YA en el formato exacto de `menu_items.options`.
//                         El wizard lo inserta directamente, sin conversión.
//   • `modifier_groups` → YA en el formato exacto de las filas de
//                         `modifier_groups` (sin business_id/id, que los pone
//                         quien inserta). Camino sin pérdida, opcional.
//
// MAPEO groups → options (aplanado, documentado porque ES CON PÉRDIDA):
//   - El PRIMER grupo con type === 'single' se convierte en `sizes`
//     (es el único grupo obligatorio de elección única que soporta el formato).
//   - TODOS los demás grupos se aplanan en `extras`, prefijando la etiqueta del
//     grupo: "Envase: Vidrio". El prefijo conserva el significado al perderse
//     la agrupación.
//   - PÉRDIDA CONOCIDA: un segundo grupo 'single' pasa a ser multi-select en
//     `extras` (el cliente podría marcar dos). Por eso también devolvemos
//     `modifier_groups`, que preserva la exclusividad, para cuando el wizard
//     quiera el camino completo.
//   - price_delta_cents → price_cents sin transformar (ambos son deltas).
// ═══════════════════════════════════════════════════════════════════════════

interface RefinedOption {
  label: string;
  price_delta_cents: number;
}

interface RefinedGroup {
  label: string;
  type: "single" | "multi";
  options: RefinedOption[];
}

/** { label, price_cents } — la forma de un choice tanto en options como en choices. */
interface OptionChoice {
  label: string;
  price_cents: number;
}

/** El formato exacto de menu_items.options. */
interface ItemOptions {
  sizes: OptionChoice[];
  extras: OptionChoice[];
}

/** Una fila de modifier_groups lista para insertar (sin id/business_id). */
interface ModifierGroupRow {
  key: string;
  label: string;
  type: "single" | "multi";
  min_select: number;
  max_select: number;
  choices: OptionChoice[];
  sort: number;
}

/** Slug estable para modifier_groups.key (unique (business_id, key)). */
function slugKey(label: string, index: number): string {
  const slug = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return slug ? `${slug}_${index}` : `grupo_${index}`;
}

/** groups → menu_items.options. Ver el bloque de documentación de arriba. */
function groupsToItemOptions(groups: RefinedGroup[]): ItemOptions {
  const options: ItemOptions = { sizes: [], extras: [] };
  let sizeGroupTaken = false;

  for (const group of groups) {
    if (!sizeGroupTaken && group.type === "single") {
      sizeGroupTaken = true;
      for (const o of group.options) {
        options.sizes.push({ label: o.label, price_cents: o.price_delta_cents });
      }
      continue;
    }
    for (const o of group.options) {
      options.extras.push({
        label: `${group.label}: ${o.label}`,
        price_cents: o.price_delta_cents,
      });
    }
  }

  return options;
}

/** groups → filas de modifier_groups (camino sin pérdida). */
function groupsToModifierGroups(groups: RefinedGroup[]): ModifierGroupRow[] {
  return groups.map((group, i) => ({
    key: slugKey(group.label, i),
    label: group.label,
    type: group.type,
    // 'single' = exactamente una; 'multi' = cero o varias, hasta todas.
    min_select: group.type === "single" ? 1 : 0,
    max_select: group.type === "single" ? 1 : group.options.length,
    choices: group.options.map((o) => ({
      label: o.label,
      price_cents: o.price_delta_cents,
    })),
    sort: i,
  }));
}

async function handleRefineItem(body: Record<string, unknown>): Promise<Response> {
  const itemName = str(body, "item_name");
  const categoryName = str(body, "category_name");
  const businessType = str(body, "business_type");
  const country = str(body, "country");

  if (!itemName) return errorResponse("bad_request", 400);

  const system =
    SYSTEM_BASE +
    "\n\nEsquema exacto de la respuesta:\n" +
    '{ "groups": [ { "label": string, "type": "single" | "multi", ' +
    '"options": [ { "label": string, "price_delta_cents": number } ] } ] }\n' +
    '"type" es "single" cuando el cliente debe elegir exactamente una opción, ' +
    'y "multi" cuando puede elegir varias (o ninguna). ' +
    '"price_delta_cents" es un entero en centavos que se SUMA al precio base del ' +
    "artículo; usa 0 cuando la opción no cambia el precio. Nunca uses el precio " +
    "total del artículo, solo la diferencia.";

  const userMsg = [
    `Artículo: ${itemName}`,
    categoryName ? `Categoría: ${categoryName}` : null,
    businessType ? `Tipo de negocio: ${businessType}` : null,
    country ? `País: ${country}` : null,
    "",
    "Propón entre 2 y 4 grupos de variaciones inteligentes ESPECÍFICOS para ese " +
      "artículo, con entre 2 y 6 opciones cada uno. Ejemplos de la idea: una " +
      "botella de agua → Marca / Tamaño / Envase; una margarita → Tequila / " +
      "Tamaño / Sal / Picante; una almohada → Tamaño / Firmeza / Relleno. " +
      "Pon primero el grupo más importante (el que casi siempre hay que elegir). " +
      "Todas las etiquetas en el idioma del país.",
  ]
    .filter((l) => l !== null)
    .join("\n");

  const raw = await askClaude(system, userMsg, 2000);
  const obj = asRecord(raw);
  const list = obj && Array.isArray(obj.groups) ? obj.groups : null;
  if (!list) throw new Error("bad_ai_response");

  const groups = list
    .map((entry) => {
      const g = asRecord(entry);
      if (!g) return null;
      const label = typeof g.label === "string" ? g.label.trim() : "";
      if (!label) return null;
      const type: "single" | "multi" = g.type === "multi" ? "multi" : "single";
      const rawOptions = Array.isArray(g.options) ? g.options : [];
      const options = rawOptions
        .map((oEntry) => {
          const o = asRecord(oEntry);
          if (!o) return null;
          const oLabel = typeof o.label === "string" ? o.label.trim() : "";
          if (!oLabel) return null;
          const delta =
            typeof o.price_delta_cents === "number" &&
              Number.isFinite(o.price_delta_cents)
              ? Math.trunc(o.price_delta_cents)
              : 0;
          return { label: oLabel, price_delta_cents: delta };
        })
        .filter((o) => o !== null);
      if (options.length === 0) return null;
      return { label, type, options };
    })
    .filter((g) => g !== null);

  if (groups.length === 0) throw new Error("bad_ai_response");

  return okResponse({
    groups,
    options: groupsToItemOptions(groups),
    modifier_groups: groupsToModifierGroups(groups),
  });
}

// ── Action E: generate_images ─────────────────────────────────────────────────
//
// Generates food-photography images with angle variation.
// - Each image uses a different camera angle to maximise visual variety.
// - Calls are sequential (one at a time) with a 1 s gap between them.
// - 429 responses are retried up to 3 times (respects Retry-After header).
// - Partial success: skips failed images, returns those that succeeded.
//   Only throws image_gen_error if zero images were produced.
//
// Default provider: OpenAI gpt-image-1 (n=1 per call, always b64_json).
// Fallback: Gemini generateContent (n=1 per call, sequential).
// Toggle with IMAGE_PROVIDER env var: "openai" (default) | "gemini".
//
// OpenAI API shape (verified Aug 2026):
//   POST https://api.openai.com/v1/images/generations
//   Auth: Authorization: Bearer OPENAI_API_KEY
//   Body: { model, prompt, n: 1, size, quality }
//   Response: { data: [{ b64_json }], usage }
//   GPT models always return b64_json — no response_format needed.
//   Model default: gpt-image-1. Override with OPENAI_IMAGE_MODEL env var.
//
// Gemini API shape (kept as fallback):
//   POST v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}
//   One call per image (generateContent supports one image per request).
//   IMPORTANT: Imagen :predict endpoint shut down Aug 17 2026. Use generateContent.

const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
const OPENAI_IMAGES_EDITS_URL = "https://api.openai.com/v1/images/edits";
const OPENAI_IMAGE_MODEL_DEFAULT = "gpt-image-1";

const GEMINI_GENERATE_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_IMAGE_MODEL_DEFAULT = "gemini-2.0-flash-preview-image-generation";

/**
 * Camera angles cycled per image to maximise visual variety.
 * Index wraps with modulo so it works for any count 1–6.
 */
const PHOTO_ANGLES: string[] = [
  "top-down overhead shot",
  "45-degree side angle",
  "close-up macro detail shot",
  "eye-level front view",
  "three-quarter angle",
];

/** Milliseconds to pause between sequential image generation calls. */
const INTER_CALL_DELAY_MS = 1_000;

// ── Shared utilities ───────────────────────────────────────────────────────────

/** Decode base64 string → Uint8Array (Deno-safe, no Buffer). */
function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Redact credentials that might appear in API error bodies. */
function redactCreds(text: string): string {
  return text
    .replace(/Bearer [^"'\s,\]}\n]+/g, "Bearer REDACTED")
    .replace(/key=[^&"'\s,\]}\n]+/g, "key=REDACTED");
}

/** Throw an image_gen_error with a human-readable detail attached. */
function imgError(detail: string): never {
  console.error(`[menu-assistant] image gen error: ${detail}`);
  throw Object.assign(new Error("image_gen_error"), { imageGenDetail: detail });
}

/** Pause for `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with automatic retry on HTTP 429 (rate limit).
 * Respects the Retry-After response header (seconds); falls back to baseSleepMs.
 * Returns the final Response — caller handles non-2xx statuses.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3,
  baseSleepMs = 3_000,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;
    if (attempt >= maxRetries) {
      console.warn("[menu-assistant] 429 rate limit — no more retries, returning last response");
      return res;
    }
    const retryAfter = res.headers.get("Retry-After");
    const waitMs = retryAfter
      ? Math.max(parseInt(retryAfter, 10), 1) * 1_000
      : baseSleepMs;
    console.warn(
      `[menu-assistant] 429 rate limit (attempt ${attempt + 1}/${maxRetries + 1}), ` +
        `retrying in ${waitMs}ms`,
    );
    await sleep(waitMs);
  }
  // Unreachable — every path in the loop either returns or awaits and loops.
  throw new Error("fetchWithRetry: unreachable");
}

// ── Reference-image download helper ───────────────────────────────────────────

/**
 * Download a public image URL → raw bytes.
 * Returns null on any network or HTTP error (non-blocking — caller skips it).
 */
async function downloadPublicImage(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      console.warn(
        `[menu-assistant] ref image download failed HTTP ${res.status}: ${url.slice(0, 100)}`,
      );
      return null;
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch (err) {
    console.warn(
      `[menu-assistant] ref image download error for ${url.slice(0, 100)}:`,
      err,
    );
    return null;
  }
}

// ── OpenAI provider ────────────────────────────────────────────────────────────

async function generateImagesOpenAI(
  basePrompt: string,
  n: number,
): Promise<Uint8Array[]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.error(
      "[menu-assistant] OPENAI_API_KEY is not set — " +
        "set it with `supabase secrets set OPENAI_API_KEY=...`",
    );
    throw new Error("service_not_configured");
  }

  const model = Deno.env.get("OPENAI_IMAGE_MODEL") ?? OPENAI_IMAGE_MODEL_DEFAULT;
  const images: Uint8Array[] = [];
  let lastFailDetail = "";

  for (let i = 0; i < n; i++) {
    // Small gap between calls to stay well under rate limits.
    if (i > 0) await sleep(INTER_CALL_DELAY_MS);

    const angle = PHOTO_ANGLES[i % PHOTO_ANGLES.length];
    const prompt = `${basePrompt}, ${angle}`;

    const res = await fetchWithRetry(OPENAI_IMAGES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "medium",
        // gpt-image-1 always returns b64_json; output_format defaults to png
      }),
    });

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      lastFailDetail = `HTTP ${res.status}: ${redactCreds(raw).slice(0, 200)}`;
      console.error(
        `[menu-assistant] openai image ${i + 1}/${n} failed: ${lastFailDetail}`,
      );
      continue; // partial failure — skip this image, keep going
    }

    interface OpenAIImagesResponse {
      data?: Array<{ b64_json?: string }>;
    }
    let json: OpenAIImagesResponse;
    try {
      json = (await res.json()) as OpenAIImagesResponse;
    } catch {
      lastFailDetail = "Failed to parse OpenAI JSON response";
      console.error(
        `[menu-assistant] openai image ${i + 1}/${n}: ${lastFailDetail}`,
      );
      continue;
    }

    const b64 = json.data?.[0]?.b64_json;
    if (!b64) {
      lastFailDetail = "OpenAI image item missing b64_json field";
      console.error(
        `[menu-assistant] openai image ${i + 1}/${n}: ${lastFailDetail}`,
      );
      continue;
    }

    images.push(b64ToBytes(b64));
  }

  if (images.length === 0) {
    imgError(lastFailDetail || "OpenAI returned no usable images");
  }

  return images;
}

// ── OpenAI edits provider (reference-image mode) ──────────────────────────────

/**
 * Generate images with the OpenAI /v1/images/edits endpoint, using downloaded
 * reference images as style / composition reference.
 *
 * gpt-image-1 accepts up to 16 input images via multipart `image[]` fields.
 * No mask is required for the reference-only use case.
 * Response shape is identical to /generations: { data: [{ b64_json }] }.
 *
 * Falls back to returning an empty array (not throwing) so the caller can
 * gracefully degrade to the generations endpoint when all calls fail.
 */
async function generateImagesOpenAIEditsWithRefs(
  basePrompt: string,
  n: number,
  refBytes: Uint8Array[],
): Promise<Uint8Array[]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.error(
      "[menu-assistant] OPENAI_API_KEY is not set — " +
        "set it with `supabase secrets set OPENAI_API_KEY=...`",
    );
    throw new Error("service_not_configured");
  }

  const model = Deno.env.get("OPENAI_IMAGE_MODEL") ?? OPENAI_IMAGE_MODEL_DEFAULT;
  const images: Uint8Array[] = [];
  let lastFailDetail = "";

  for (let i = 0; i < n; i++) {
    if (i > 0) await sleep(INTER_CALL_DELAY_MS);

    const angle = PHOTO_ANGLES[i % PHOTO_ANGLES.length];
    const prompt = `${basePrompt}, ${angle}`;

    // Build multipart body. gpt-image-1 edits accepts repeated `image[]` fields
    // (array) for multiple reference images — standard multipart array encoding.
    const fd = new FormData();
    fd.append("model", model);
    fd.append("prompt", prompt);
    fd.append("n", "1");
    fd.append("size", "1024x1024");
    fd.append("quality", "medium");
    for (const [idx, bytes] of refBytes.entries()) {
      // Use image[] to signal an array; provide a filename so the server can
      // infer content-type from the extension.
      // downloadPublicImage() wraps res.arrayBuffer() in new Uint8Array(buf),
      // so bytes.buffer is always a plain ArrayBuffer — the cast is safe.
      fd.append(
        "image[]",
        new Blob([bytes.buffer as ArrayBuffer], { type: "image/png" }),
        `ref_${idx}.png`,
      );
    }

    const res = await fetchWithRetry(OPENAI_IMAGES_EDITS_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      // Do NOT set Content-Type — the runtime sets it with the correct boundary.
      body: fd,
    });

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      lastFailDetail = `HTTP ${res.status}: ${redactCreds(raw).slice(0, 200)}`;
      console.error(
        `[menu-assistant] openai edits image ${i + 1}/${n} failed: ${lastFailDetail}`,
      );
      continue; // partial failure — skip, keep going
    }

    interface OpenAIImagesResponse {
      data?: Array<{ b64_json?: string }>;
    }
    let json: OpenAIImagesResponse;
    try {
      json = (await res.json()) as OpenAIImagesResponse;
    } catch {
      lastFailDetail = "Failed to parse OpenAI edits JSON response";
      console.error(
        `[menu-assistant] openai edits image ${i + 1}/${n}: ${lastFailDetail}`,
      );
      continue;
    }

    const b64 = json.data?.[0]?.b64_json;
    if (!b64) {
      lastFailDetail = "OpenAI edits item missing b64_json field";
      console.error(
        `[menu-assistant] openai edits image ${i + 1}/${n}: ${lastFailDetail}`,
      );
      continue;
    }

    images.push(b64ToBytes(b64));
  }

  if (images.length === 0) {
    imgError(lastFailDetail || "OpenAI edits returned no usable images");
  }

  return images;
}

// ── Gemini provider (fallback) ─────────────────────────────────────────────────

async function generateImagesGemini(
  basePrompt: string,
  n: number,
): Promise<Uint8Array[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error(
      "[menu-assistant] GEMINI_API_KEY is not set — " +
        "set it with `supabase secrets set GEMINI_API_KEY=...`",
    );
    throw new Error("service_not_configured");
  }

  const model = Deno.env.get("GEMINI_IMAGE_MODEL") ?? GEMINI_IMAGE_MODEL_DEFAULT;
  const geminiUrl = `${GEMINI_GENERATE_BASE}/${model}:generateContent?key=${apiKey}`;
  const images: Uint8Array[] = [];
  let lastFailDetail = "";

  for (let i = 0; i < n; i++) {
    if (i > 0) await sleep(INTER_CALL_DELAY_MS);

    const angle = PHOTO_ANGLES[i % PHOTO_ANGLES.length];
    const prompt = `${basePrompt}, ${angle}`;

    const res = await fetchWithRetry(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
    });

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      lastFailDetail = `HTTP ${res.status}: ${redactCreds(raw).slice(0, 200)}`;
      console.error(
        `[menu-assistant] gemini image ${i + 1}/${n} failed: ${lastFailDetail}`,
      );
      continue;
    }

    interface GeminiImageResponse {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: { mimeType: string; data: string };
          }>;
        };
      }>;
    }
    let data: GeminiImageResponse;
    try {
      data = (await res.json()) as GeminiImageResponse;
    } catch {
      lastFailDetail = "Failed to parse Gemini JSON response";
      console.error(
        `[menu-assistant] gemini image ${i + 1}/${n}: ${lastFailDetail}`,
      );
      continue;
    }

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const inlineData = parts.find(
      (p) => p.inlineData?.mimeType?.startsWith("image/"),
    )?.inlineData;

    if (!inlineData?.data) {
      lastFailDetail =
        "No image part in Gemini response — " +
        "check GEMINI_IMAGE_MODEL supports image generation and responseModalities=[IMAGE]";
      console.error(
        `[menu-assistant] gemini image ${i + 1}/${n}: ${lastFailDetail}`,
      );
      continue;
    }

    images.push(b64ToBytes(inlineData.data));
  }

  if (images.length === 0) {
    imgError(lastFailDetail || "Gemini returned no usable images");
  }

  return images;
}

// ── Dispatcher ─────────────────────────────────────────────────────────────────

/**
 * Abstraction layer — routes to OpenAI (default) or Gemini based on the
 * IMAGE_PROVIDER env var. Set IMAGE_PROVIDER=gemini to use Gemini as fallback.
 *
 * `basePrompt` is the style+subject description; each provider appends a
 * per-image angle suffix before calling the API.
 */
async function generateImages(
  basePrompt: string,
  n: number,
): Promise<Uint8Array[]> {
  const provider = Deno.env.get("IMAGE_PROVIDER") ?? "openai";
  return provider === "gemini"
    ? generateImagesGemini(basePrompt, n)
    : generateImagesOpenAI(basePrompt, n);
}

async function handleGenerateImages(
  body: Record<string, unknown>,
  db: SupabaseClient,
  businessId: string,
): Promise<Response> {
  const itemName = str(body, "item_name");
  const description = str(body, "description");
  const style = str(body, "style");
  const styleHint = str(body, "style_hint");                 // NEW: per-item style override
  const referenceImageUrls = strArray(body, "reference_image_urls"); // NEW: brand-kit URLs
  const rawCount = intField(body, "count");
  // Default 3, cap 6 to avoid rate-limit / cost overruns.
  const count = rawCount !== null ? Math.min(Math.max(rawCount, 1), 6) : 3;

  if (!itemName) return errorResponse("bad_request", 400);

  // ── Build base food-photography prompt ─────────────────────────────────────
  // style_hint overrides the per-call style string; style is kept for backwards compat.
  // Angle is NOT included here — each provider appends it per-call.
  const descPart = description ? `, ${description}` : "";
  const styleBase =
    styleHint ??
    style ??
    "professional food photography, clean bright background, natural window light, " +
      "appetizing, high detail, restaurant quality, no text";
  const basePrompt = `${styleBase} of ${itemName}${descPart}`;

  // ── Generate images ────────────────────────────────────────────────────────
  // With reference_image_urls → OpenAI /v1/images/edits (style composition).
  // Without reference_image_urls → /v1/images/generations (text-to-image).
  // If reference image downloads all fail, fall back to generations silently.
  let imageBytes: Uint8Array[];
  try {
    if (referenceImageUrls.length > 0) {
      console.log(
        `[menu-assistant] edits mode: downloading ${referenceImageUrls.length} reference images`,
      );
      const refResults = await Promise.all(referenceImageUrls.map(downloadPublicImage));
      const refBytes = refResults.filter((b): b is Uint8Array => b !== null);
      if (refBytes.length === 0) {
        // All downloads failed — graceful fallback to text-to-image.
        console.warn(
          "[menu-assistant] all ref image downloads failed — falling back to generations",
        );
        imageBytes = await generateImages(basePrompt, count);
      } else {
        console.log(
          `[menu-assistant] edits mode: ${refBytes.length}/${referenceImageUrls.length} refs downloaded`,
        );
        imageBytes = await generateImagesOpenAIEditsWithRefs(basePrompt, count, refBytes);
      }
    } else {
      imageBytes = await generateImages(basePrompt, count);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "service_not_configured") throw err;
    // Forward provider detail so the caller can surface it for debugging.
    const detail = (err as { imageGenDetail?: string }).imageGenDetail;
    throw Object.assign(
      new Error("image_gen_error"),
      detail ? { imageGenDetail: detail } : {},
    );
  }

  // ── Upload to Supabase Storage → menu-photos bucket (already public) ───────
  // Path: {business_id}/ai/{uuid}.png  — service-role client, no RLS bypass needed.
  const urls: string[] = [];
  const uploadFailures: string[] = [];

  for (const bytes of imageBytes) {
    const path = `${businessId}/ai/${crypto.randomUUID()}.png`;

    const { error: upErr } = await db.storage
      .from("menu-photos")
      .upload(path, bytes, { contentType: "image/png", upsert: false });

    if (upErr) {
      console.error(
        `[menu-assistant] storage upload failed for ${path}:`,
        upErr.message,
      );
      uploadFailures.push(upErr.message);
      continue; // partial failure — keep uploading the rest
    }

    const { data: pubData } = db.storage
      .from("menu-photos")
      .getPublicUrl(path);
    urls.push(pubData.publicUrl);
  }

  // Return partial success if at least one image made it through.
  if (urls.length === 0) {
    console.error(
      "[menu-assistant] all Storage uploads failed:",
      uploadFailures,
    );
    throw new Error("image_gen_error");
  }

  return okResponse({ images: urls });
}

// ── Action D: polish_item ─────────────────────────────────────────────────────

async function handlePolishItem(body: Record<string, unknown>): Promise<Response> {
  const name = str(body, "name");
  const description = str(body, "description");
  const rawDirection = str(body, "direction");

  if (!name) return errorResponse("bad_request", 400);

  // Uso 2: traducir la descripción dada.
  if (rawDirection === "es_to_en" || rawDirection === "en_to_es") {
    if (!description) return errorResponse("bad_request", 400);

    const target = rawDirection === "es_to_en" ? "inglés" : "español";
    const system =
      SYSTEM_BASE +
      "\n\nEsquema exacto de la respuesta:\n" +
      '{ "translated": string }';
    const userMsg = [
      `Artículo de menú: ${name}`,
      `Descripción original: ${description}`,
      "",
      `Traduce la descripción al ${target}. Mantén el tono apetitoso y la ` +
        "longitud similar. No traduzcas nombres propios de platillos ni marcas.",
    ].join("\n");

    const raw = await askClaude(system, userMsg, 1000);
    const obj = asRecord(raw);
    const translated = obj && typeof obj.translated === "string" ? obj.translated.trim() : "";
    if (!translated) throw new Error("bad_ai_response");

    return okResponse({ translated });
  }

  if (rawDirection !== null) return errorResponse("bad_request", 400);

  // Uso 1: generar descripciones y tags a partir del nombre del platillo.
  const system =
    SYSTEM_BASE +
    "\n\nEsquema exacto de la respuesta:\n" +
    '{ "description_es": string, "description_en": string, "tags": string[] }\n' +
    `"tags" solo puede contener valores de esta lista fija: ${DIETARY_TAGS.join(", ")}. ` +
    "Usa solo los que apliquen; si ninguno aplica, devuelve un arreglo vacío.";

  const userMsg = [
    `Artículo de menú: ${name}`,
    description ? `Notas del dueño: ${description}` : null,
    "",
    "Escribe una descripción apetitosa y CORTA (máximo 20 palabras) en español " +
      "y su equivalente en inglés, más las etiquetas dietéticas que apliquen.",
  ]
    .filter((l) => l !== null)
    .join("\n");

  const raw = await askClaude(system, userMsg, 1000);
  const obj = asRecord(raw);
  if (!obj) throw new Error("bad_ai_response");

  const allowed = new Set<string>(DIETARY_TAGS);
  const descriptionEs =
    typeof obj.description_es === "string" ? obj.description_es.trim() : "";
  const descriptionEn =
    typeof obj.description_en === "string" ? obj.description_en.trim() : "";
  const tags = Array.isArray(obj.tags)
    ? obj.tags.filter((t): t is string => typeof t === "string" && allowed.has(t))
    : [];

  if (!descriptionEs && !descriptionEn) throw new Error("bad_ai_response");

  return okResponse({
    description_es: descriptionEs,
    description_en: descriptionEn,
    tags,
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight — required before any cross-origin POST
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return errorResponse("bad_request", 405);
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return errorResponse("bad_request", 400);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("bad_request", 400);
  }

  const action = typeof body.action === "string" ? body.action : null;

  // 1. Auth — auth.uid() resolved from the caller's JWT, never from the body.
  const authResult = await verifyCaller(req);
  if (authResult instanceof Response) return authResult;
  const { authUserId } = authResult;

  // 2. Every action is scoped to one business.
  const businessId = str(body, "business_id");
  if (!businessId) return errorResponse("bad_request", 400);

  let db: SupabaseClient;
  try {
    db = getAdminClient();
  } catch (err) {
    console.error("[menu-assistant] admin client init failed:", err);
    return errorResponse("service_not_configured", 500);
  }

  // 3. Pro gate — server-side, before ANY Anthropic call (no free AI for free plans).
  const gateErr = await requireProOwner(db, businessId, authUserId);
  if (gateErr) return gateErr;

  console.log(`[menu-assistant] action="${action}" user=${authUserId} business=${businessId}`);

  try {
    switch (action) {
      case "suggest_categories":
        return await handleSuggestCategories(body, db, businessId);

      case "suggest_items":
        return await handleSuggestItems(body, db, businessId);

      case "refine_item":
        return await handleRefineItem(body);

      case "polish_item":
        return await handlePolishItem(body);

      case "generate_images":
        return await handleGenerateImages(body, db, businessId);

      default:
        console.error(`[menu-assistant] unknown action: ${action ?? "(none)"}`);
        return errorResponse("bad_request", 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message === "service_not_configured") {
      return errorResponse("service_not_configured", 500);
    }
    if (message === "bad_ai_response") {
      return errorResponse("bad_ai_response", 500);
    }
    if (message.startsWith("anthropic_error_")) {
      return errorResponse(message, 502);
    }
    if (message === "image_gen_error") {
      const detail = (err as { imageGenDetail?: string }).imageGenDetail;
      return jsonResponse(
        { ok: false, error: "image_gen_error", ...(detail ? { detail } : {}) },
        502,
      );
    }

    console.error(`[menu-assistant] unhandled error in action "${action}":`, err);
    return errorResponse("service_not_configured", 500);
  }
});
