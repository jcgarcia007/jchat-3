# Diseño — autenticar las Edge Functions de pago (Fix #3 y #4) — 2026-07-07

> Diseño, **sin cambios de código**. Cierra P0-3 en `stripe-connect` (IDOR, Fix #4) y
> `subscriptions.create_checkout` (anónimo, Fix #3). Base: `docs/DIAGNOSTICO_PAGOS.md`.
> Referencia canónica: `payments/index.ts` **ya implementa** el patrón de verificación de
> JWT (líneas 309-334) — lo reusamos idéntico en ambas funciones.

---

## Patrón canónico ya existente (payments/index.ts:309-334)

```ts
const authHeader = req.headers.get("Authorization");
if (!authHeader?.startsWith("Bearer ")) {
  return errorResponse("Missing or invalid Authorization header", 401);
}
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
if (!anonKey || !supabaseUrl) return errorResponse("Internal server error", 500);

// Cliente con scope de usuario: getUser() falla si el token expiró o es falso.
const userClient = createClient(supabaseUrl, anonKey, {
  global: { headers: { Authorization: authHeader } },
});
const { data: { user }, error: authError } = await userClient.auth.getUser();
if (authError || !user) return errorResponse("Unauthorized", 401);
const authUserId = user.id;   // única identidad confiable
```

- El cliente (móvil/web) llama estas funciones con `supabase.functions.invoke(...)`, que
  **incluye automáticamente el JWT del usuario** en el header `Authorization`. Así que el header
  ya llega en el path de app; solo hay que **leerlo y verificarlo**.
- `SUPABASE_ANON_KEY` es auto-inyectada en Edge Functions de Supabase (sin config manual).

### Helper de autorización compartido (nuevo, para ambas funciones)

```ts
/** Verifica que el caller sea dueño del negocio o platform admin. Lanza Response 403 si no. */
async function assertOwnerOrAdmin(
  db: ReturnType<typeof getAdminClient>,   // service_role (bypassa RLS para leer)
  authUserId: string,
  businessId: string,
): Promise<Response | null> {
  const { data: biz, error } = await db
    .from("businesses")
    .select("owner_id")
    .eq("id", businessId)
    .maybeSingle();
  if (error) return errorResponse("DB error", 500);
  if (!biz)  return errorResponse("Business not found", 404);
  if (biz.owner_id === authUserId) return null;               // dueño → OK

  // ¿platform admin? (mismo criterio que is_platform_admin())
  const { data: admin } = await db
    .from("admin_roles")
    .select("user_id")
    .eq("user_id", authUserId)
    .maybeSingle();
  if (admin) return null;                                     // admin → OK

  return errorResponse("Forbidden: not the owner of this business", 403);
}
```
> Nota: se lee con el cliente **service_role** (`getAdminClient`) porque necesitamos leer
> `businesses.owner_id`/`admin_roles` sin depender de RLS; la **decisión** de autorización la
> toma el código comparando contra `authUserId` (el JWT verificado), nunca contra el body.

---

## FIX #4 — `stripe-connect`: check de propiedad (IDOR)

### 1. Cómo opera hoy (supabase/functions/stripe-connect/index.ts)
- `Deno.serve` (líneas 223-256): parsea `body`, lee `action`, y despacha a
  `handleCreateConnectAccount` / `handleGetAccountStatus` / `handleCreateLoginLink`.
- **Nunca lee el JWT.** Cada handler toma `business_id` **del body** y opera con service_role:
  - `handleCreateConnectAccount` (73-154): `select businesses ... where id = business_id`; si no
    hay `stripe_account_id`, crea cuenta Express y **escribe `businesses.stripe_account_id`**;
    devuelve `onboarding_url`.
  - `handleGetAccountStatus` (158-187): retrieve del estado de la cuenta Stripe del negocio.
  - `handleCreateLoginLink` (192-219): **devuelve un login link al dashboard de Stripe Express**
    del negocio. 🔴 el más peligroso.
- `verify_jwt = true` (config.toml) → la **plataforma** ya exige un JWT válido, pero la función
  **no verifica propiedad** → cualquier usuario logueado opera sobre cualquier `business_id`.

### 2. Propuesta
Leer el JWT en `Deno.serve`, obtener `authUserId`, y **antes de despachar cualquier acción**
llamar `assertOwnerOrAdmin(db, authUserId, business_id)`. Si devuelve una Response (403/404) →
retornarla; si `null` → continuar.

```ts
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST")    return errorResponse("Method not allowed", 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return errorResponse("Invalid JSON body"); }
  const action    = typeof body.action === "string" ? body.action : null;
  const businessId = typeof body.business_id === "string" ? body.business_id : null;
  if (!businessId) return errorResponse("business_id is required");

  // ── P0-3: verificar JWT + propiedad ANTES de cualquier acción ──
  const authResp = await verifyCaller(req);            // { authUserId } | Response
  if (authResp instanceof Response) return authResp;
  const db = getAdminClient();
  const ownerCheck = await assertOwnerOrAdmin(db, authResp.authUserId, businessId);
  if (ownerCheck) return ownerCheck;                    // 403/404

  try {
    switch (action) {
      case "create_connect_account": return await handleCreateConnectAccount(body);
      case "get_account_status":     return await handleGetAccountStatus(body);
      case "create_login_link":      return await handleCreateLoginLink(body);
      default: return errorResponse(`Unknown action: ${action ?? "(none)"}`);
    }
  } catch (err) { console.error("[stripe-connect]", err); return errorResponse("Internal server error", 500); }
});
```
donde `verifyCaller(req)` encapsula el patrón canónico y devuelve `{ authUserId }` o una Response 401.

### 3. Cómo obtener `auth.uid()` dentro de la función
El patrón canónico de arriba (cliente con `Authorization` header + `auth.getUser()`).
`verify_jwt=true` ya garantiza que el token es válido a nivel plataforma, pero **igual hay que
leerlo** para conocer al usuario — `getUser()` lo decodifica y devuelve `user.id`.

### 4. Idempotency key en `create_connect_account` (menor)
```ts
const account = await stripe.accounts.create(params, { idempotencyKey: `connect:${businessId}` });
```
Evita crear dos cuentas Express si el request se reintenta por red antes de guardar
`stripe_account_id`.

### Qué NO se rompe
- `verify_jwt=true` se mantiene; el cliente ya manda el JWT vía `functions.invoke`. El dueño
  legítimo pasa el check; solo se bloquean los `business_id` ajenos. Sin cambio de URL.

---

## FIX #3 — `subscriptions.create_checkout`: autenticar + autorizar

### 1. Cómo distingue hoy webhook vs app (subscriptions/index.ts)
- `Deno.serve` (508-565): `const isWebhook = req.headers.has("stripe-signature")` (línea 528).
  - **Webhook** (`isWebhook`): `handleWebhook(req)` → `constructEventAsync` (firma) ✅.
  - **App** (else): parsea JSON, `action==="create_checkout"` → `handleCreateCheckout(body)`
    **sin ninguna auth** (verify_jwt=false a nivel plataforma) → 🔴 anónimo.
- `handleCreateCheckout` (132-223): lee `business_id`/`plan` del body; si `plan` es free hace el
  **downgrade** escribiendo `subscriptions` + `businesses.update({plan:'regular'})` con
  service_role (149-172); si es de pago crea un Checkout Session.
- `verify_jwt=false` es **necesario** para el path webhook (Stripe no manda JWT de Supabase).

### 2. Opciones (comparación)

| | **OPCIÓN A — dos funciones** | **OPCIÓN B — una función, auth interna** *(recomendada)* |
|---|---|---|
| Estructura | `subscriptions` = solo webhook (verify_jwt=false, firma) + **nueva** `subscriptions-checkout` (verify_jwt=true, ownership) | Una función; si NO hay `stripe-signature` → verifica JWT + ownership manualmente antes de checkout/downgrade |
| URL del webhook Stripe | **Sin cambio** si el webhook se queda en `subscriptions` (variante recomendada de A). Si se renombra a `subscriptions-webhook` → **re-registrar** el endpoint en Stripe 🔴 | **Sin cambio** — el webhook sigue en `/functions/v1/subscriptions` |
| Cliente (billing page) | Debe llamar a la **nueva** función `subscriptions-checkout` | **Sin cambio** — sigue `invoke('subscriptions', { action:'create_checkout' })` |
| verify_jwt | checkout gateado por la plataforma (true) → más defensa en capas | queda `false`; la función implementa la auth (una rama) |
| Complejidad | +1 función, +1 deploy, cambio en cliente | Cambio mínimo, todo en un archivo |
| Riesgo | Mayor superficie de cambio (config + cliente + posible re-registro) | La función debe implementar bien la rama de auth (es el mismo código que en A) |

**Recomendación: OPCIÓN B.** No cambia URLs, no re-registra el webhook de Stripe, no toca el
cliente, y el código de verificación es el mismo que se escribiría en A. El único "costo" es que
`verify_jwt` sigue `false`, pero eso ya es obligatorio por el webhook y la rama de app hace la
verificación manual. (Si en el futuro se prefiere gateo de plataforma, migrar a la variante de A
que **mantiene el webhook en `subscriptions`** y agrega `subscriptions-checkout` — así tampoco se
re-registra el endpoint.)

### 3. Diseño de la rama de app (Opción B)
En `Deno.serve`, cuando **no** hay `stripe-signature` (path app), antes de despachar
`create_checkout`:

```ts
// path app (sin stripe-signature)
const body = await req.json();
const action = typeof body.action === "string" ? body.action : null;

if (action === "create_checkout") {
  const businessId = typeof body.business_id === "string" ? body.business_id : null;
  if (!businessId) return errorResponse("business_id is required");

  // ── P0-3: JWT + ownership ANTES de crear checkout o downgrade ──
  const authResp = await verifyCaller(req);           // { authUserId } | Response(401)
  if (authResp instanceof Response) return authResp;
  const db = getAdminClient();
  const ownerCheck = await assertOwnerOrAdmin(db, authResp.authUserId, businessId);
  if (ownerCheck) return ownerCheck;                   // 403/404

  return await handleCreateCheckout(body);             // (ya autorizado)
}
```

### 4. El path downgrade queda detrás del check
`handleCreateCheckout` (149-172) hace el `businesses.update({plan:'regular'})` con service_role.
Como el check de ownership corre **antes** de invocar `handleCreateCheckout`, el downgrade
**solo se ejecuta si el caller es dueño (o admin) del `business_id`**. El anónimo se corta en el
401 (sin JWT) o 403 (JWT de otro usuario). ✅

### Qué NO se rompe
- **(a) Webhook de Stripe registrado:** intacto — la rama `isWebhook` (firma) no cambia; misma URL.
- **(b) Upgrade/checkout del cliente logueado:** el billing page ya manda el JWT vía
  `functions.invoke` → el dueño pasa el check y obtiene la `url` de Checkout.
- **(c) Pruebas en test mode:** sin cambios de precios/keys; solo se añade la verificación.

---

## Resumen de cambios propuestos (para la sesión de aplicación — NO aplicados)

| Archivo | Cambio |
|---|---|
| `supabase/functions/stripe-connect/index.ts` | `verifyCaller` + `assertOwnerOrAdmin` antes del dispatch (las 3 acciones); idempotency key en `accounts.create`. |
| `supabase/functions/subscriptions/index.ts` | En el path app (sin `stripe-signature`): `verifyCaller` + `assertOwnerOrAdmin` antes de `create_checkout`/downgrade. Webhook intacto. `verify_jwt` sigue `false`. |
| `config.toml` | Sin cambios (Opción B). |
| Cliente (billing / connect UI) | Sin cambios (ya mandan el JWT vía `functions.invoke`). |
| Stripe dashboard | Sin re-registro de webhooks (Opción B). |

### Plan de verificación (test mode)
1. `stripe-connect create_login_link` con `business_id` **ajeno** → **403** (antes: devolvía login link 🔴).
2. `stripe-connect create_login_link` con **tu** negocio → funciona.
3. `subscriptions create_checkout` **sin** Authorization (anónimo) → **401**; con JWT de **otro**
   usuario → **403**; con JWT del **dueño** → devuelve `url` de Checkout.
4. Downgrade a `regular` de un negocio ajeno → **403** (antes: escribía el plan 🔴).
5. Webhook de Stripe (order/subscription events) → sigue procesando (firma), sin cambios.
6. `payments` no se toca (ya seguro).

### Follow-up ya conocido (fuera de esta tanda)
- `payments`: `ensure_customer` / `create_setup_intent` aún usan `body.user_id` sin JWT (P0-3
  menor) — mismo patrón `verifyCaller` cuando se aborden.
- Idempotencia de webhooks (tabla `processed_stripe_events(event_id UNIQUE)`) y recálculo de
  modificadores en `payments` — P1 del diagnóstico.
