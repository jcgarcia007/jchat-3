# Diseño — Tanda 3: integridad de pagos (Fixes #5–#9)

> **Estado: DISEÑO. Nada aplicado.** Follow-ups P1 de `docs/DIAGNOSTICO_PAGOS.md`
> (§ lista priorizada, ítems 5–8) + `docs/SECURITY_AUDIT.md` (§ Follow-ups P1 de pagos).
> Verificado contra el esquema real en vivo (proyecto `klfsgcfoahdtkojyqspd`) y el
> código actual el 2026-07-08. Seguimos en **Stripe test mode**.
>
> Estos son fixes de **integridad/robustez**, no de explotación directa (los 4 P0 ya
> se cerraron en Tandas 1+2). Ninguno bloquea, pero todos deben estar antes de dinero real.

---

## Resumen — tipo de cambio y prioridad

| Fix | Qué | Tipo | Redeploy / migración | Riesgo |
|---|---|---|---|---|
| **#8** | `UNIQUE` parcial en `orders.stripe_pi_id` | 🗄️ **BD** | migración nueva | 🟢 nulo (tabla vacía) |
| **#9** | Proteger `businesses.is_verified` | 🗄️ **BD** | migración nueva | 🟢 nulo (nadie lo escribe hoy) |
| **#5** | Idempotencia de webhooks + `grace_day` | 🗄️ **BD** + ⚡ **2 functions** | migración + redeploy `stripe-webhook` y `subscriptions` | 🟡 medio |
| **#7** | JWT en `ensure_customer`/`create_setup_intent` | ⚡ **function** | redeploy `payments` | 🟢 bajo |
| **#6** | Recalcular modificadores en `payments` | ⚡ **function** + 📱 **cliente** | redeploy `payments` + cambio mobile | 🟡 medio |

**Orden recomendado de aplicación:** #8 → #9 (migraciones puras, aisladas, riesgo nulo) →
#7 (function aislada, sin cambio de cliente) → #5 (tabla + 2 webhooks) → #6 (function + cliente,
el único que toca el cálculo de dinero y requiere coordinar mobile).

---

## FIX #8 — `UNIQUE` parcial en `orders.stripe_pi_id`  🗄️ BD

### Estado actual (verificado)
- `orders.stripe_pi_id`: `text`, **`NULL`-able** (`is_nullable = YES`).
- Índices en `orders`: `orders_pkey`, `idx_orders_business_id/user_id/room_id/status/created_at`.
  **No hay UNIQUE ni índice sobre `stripe_pi_id`.**
- El webhook de órdenes (`stripe-webhook/index.ts:115-126`) hace un **SELECT-guard**
  (`select id where stripe_pi_id = PI`) antes de insertar → ventana de carrera si Stripe
  reentrega el evento en paralelo (dos ejecuciones pasan el SELECT antes de que la otra inserte).
- **`orders` tiene 0 filas hoy** → `null_pi = 0`, `dup_pi_groups = 0`. No hay duplicados que limpiar.

### ¿Puede `stripe_pi_id` ser NULL legítimamente? → **SÍ**
El webhook siempre setea `stripe_pi_id`, pero:
- Órdenes **demo/gratis** (`CheckoutScreen` en modo demo, `createOrderRecord`) no pasan por Stripe.
- Órdenes futuras "en local / efectivo" (POS) podrían no tener PI.
Por eso el UNIQUE **debe ser parcial** (`WHERE stripe_pi_id IS NOT NULL`); un UNIQUE total
rompería al insertar la 2ª orden con `stripe_pi_id = NULL` (en Postgres varios NULL son
distintos en un UNIQUE normal, PERO el índice parcial es la forma explícita y correcta de
declarar la intención y evitar sorpresas).

### Diseño
Migración nueva `037_orders_stripe_pi_unique.sql`:
```sql
create unique index if not exists orders_stripe_pi_id_uniq
  on public.orders (stripe_pi_id)
  where stripe_pi_id is not null;
```
- Tabla vacía → creación instantánea, sin `CONCURRENTLY` (no aplica dentro de migración).
- **Endurecer el webhook** (`stripe-webhook`, redeploy junto con #5): tras el insert, capturar el
  error de violación de unicidad (`code === '23505'`) y tratarlo como "ya procesado" → `return`
  con 200, en vez de propagar 500. Así la carrera se resuelve limpia: el perdedor de la carrera
  no crea orden duplicada ni ensucia logs con 500. (Con #5 aplicado, el dedup por `event.id` ya
  evita que la reentrega llegue al insert; el índice es la **red de seguridad** a nivel BD.)

### Qué podría romper
- 🟢 Nada hoy (tabla vacía). A futuro, si algún flujo intentara reusar un PI para dos órdenes
  (no debería: 1 PI = 1 orden), fallaría el insert — que es exactamente lo deseado.
- ⚠️ Solo si en el futuro se crean órdenes con `stripe_pi_id = ''` (cadena vacía) en vez de NULL:
  el índice parcial las trataría como colisión. **Mitigación:** el webhook nunca escribe `''`
  (siempre `paymentIntent.id`); mantener esa invariante.

---

## FIX #9 — Proteger `businesses.is_verified`  🗄️ BD

### Estado actual (verificado)
- Privilegios de columna en vivo: **`authenticated` tiene `UPDATE` sobre `is_verified`** (además de
  `anon` sin UPDATE pero el `authenticated` es el que importa). Está en la **allow-list de la
  migración 036** (línea 13: `... is_temporary, is_verified, lat, ...`).
- RLS `businesses: owner update` → `USING (auth.uid() = owner_id)`. **Conclusión: un dueño puede
  auto-ponerse `is_verified = true`** por UPDATE directo desde el cliente → **badge de "verificado"
  falso** sin pagar/validar. Mismo patrón que las columnas financieras que ya cerramos.
- **¿Quién escribe `is_verified` hoy?** Grep en `web/` + `mobile/` + `supabase/`: **ningún
  `.update({ is_verified })`**. Solo lecturas (`select ... is_verified`, `<VerificationBadge>`).
  El flujo `web/app/api/verify/route.ts` es verificación de teléfono/identidad de usuario, **no**
  toca `businesses.is_verified`. Es decir: **hoy nada lo setea legítimamente** (queda en su default
  `false` de `001`). El badge probablemente se pensaba ligar al plan "verified" o a acción de
  super-admin, aún no cableado.

### Diseño
Migración nueva `038_businesses_protect_is_verified.sql` — replicar el patrón de columnas
financieras (034/036): **quitar `is_verified` de la allow-list de UPDATE**.
```sql
-- Re-grant de la allow-list SIN is_verified (revoca implícitamente esa columna).
revoke update on public.businesses from authenticated, anon;
grant update (
  address, category, city, country, cover_url, created_at, dashboard_theme_id,
  description, event_ends_at, event_starts_at, external_menu_url, gallery_urls,
  geofence_polygon, geofence_radius_m, hours, icon_emoji, id, is_active,
  is_temporary, lat, latitude, lng, logo_url, longitude,          -- ← is_verified fuera
  menu_card_effect, menu_enabled, menu_mode, menu_palette_id, menu_template_id,
  name, payout_frequency, phone, radius_m, slug, state, tip_percentages,
  tips_enabled, updated_at, website
) on public.businesses to authenticated;
```
- Para el **flujo legítimo futuro** (verificación por super-admin o al activar plan "verified"):
  que lo escriba **`service_role`** (webhook `subscriptions` al confirmar plan verified) **o** una
  **RPC `SECURITY DEFINER` con guard `is_platform_admin()`**, igual que `admin_set_business_status`
  de la migración 034. **No** re-otorgar la columna a `authenticated`.

### Qué podría romper
- 🟢 Nada hoy: no hay escritor cliente de `is_verified`. Cero flujos que dependan del UPDATE directo.
- ⚠️ Si existiera una pantalla que hace `update({ is_verified: true })` desde el cliente (no la hay
  hoy), empezaría a fallar silenciosamente (RLS/grant). Confirmado que **no existe**.
- Nota: `is_verified` sigue siendo **legible** (SELECT intacto) → el badge se muestra igual.

---

## FIX #7 — JWT en `ensure_customer` / `create_setup_intent`  ⚡ payments

### Estado actual (verificado)
- `payments` tiene `verify_jwt = true` en `config.toml` → **la plataforma ya rechaza invocaciones
  anónimas** de las 3 acciones. El JWT existe; el problema es que dos handlers **no lo leen**.
- `handleCreatePaymentIntent` ✅ ya verifica el JWT (bloque en `Deno.serve`, líneas 313-334) y usa
  `authUserId`; `body.user_id` es solo traza.
- `handleEnsureCustomer` (67-80) y `handleCreateSetupIntent` (281-299): toman `body.user_id`
  **sin verificar el JWT** y crean/leen el Stripe customer + `ephemeralKey` de ESE id. Un usuario
  logueado (A) puede pasar `user_id = B` → **IDOR sobre el customer de Stripe de B** (crear/vincular
  su customer, obtener ephemeralKey → listar/adjuntar métodos de pago). Severidad media (requiere
  estar logueado, pero permite operar sobre otra cuenta).
- **Callers reales:**
  - `ensure_customer`: **CERO callers** en `web/` + `mobile/` (código muerto hoy).
  - `create_setup_intent`: `mobile/services/stripe.ts:239` → `saveCard(userId)` con
    `body: { action:'create_setup_intent', user_id: userId }`. La invocación de supabase-js
    **ya adjunta el header Authorization** del usuario logueado.

### Diseño
- Extraer el bloque de verificación de JWT de `Deno.serve` a un helper **`verifyCaller(req)`**
  (idéntico al que ya existe en `subscriptions/index.ts:107-124`) que devuelve `{ authUserId }`
  o un `Response` 401.
- Aplicarlo a **las 3 acciones** (no solo `create_payment_intent`). Pasar `authUserId` a
  `handleEnsureCustomer` y `handleCreateSetupIntent`, y que usen `authUserId` en vez de
  `body.user_id` para el lookup y el `metadata.supabase_user_id`. Eliminar el parámetro
  `body.user_id` de la ruta de autenticación (dejarlo, a lo sumo, como traza).
- Resultado: las 3 acciones operan solo sobre la identidad verificada del token.

### Qué podría romper
- 🟢 `ensure_customer`: sin callers → cambiar su firma no rompe nada en cliente.
- 🟢 `create_setup_intent` / `saveCard`: hoy pasa `user_id` en el body **igual al usuario logueado**
  (es `session.user.id`), y el header Authorization ya viaja. Tras el fix el server ignora
  `body.user_id` y usa el uid del token → **mismo valor, sigue funcionando**. Solo rompe el caso
  malicioso (pasar el id de otro), que es justo lo que queremos.
- ⚠️ Verificar que `SUPABASE_ANON_KEY` esté en los secrets de la función (ya lo usa
  `create_payment_intent`, así que está presente). Si faltara, las 3 acciones darían 500.
- ⚠️ Nota menor: si algún backend/servicio interno invocaba `ensure_customer` con service-role sin
  JWT de usuario, empezaría a dar 401. No hay tal caller hoy.

---

## FIX #5 — Idempotencia de webhooks + `grace_day` derivable  🗄️ BD + ⚡ 2 functions

### Estado actual (verificado)
- **Ninguno de los dos webhooks revisa `event.id`.** `stripe-webhook` dedup por SELECT sobre
  `orders.stripe_pi_id` (solo para `payment_intent.succeeded`); `subscriptions` no tiene dedup
  alguno. `to_regclass('processed_stripe_events')` = **null** (la tabla no existe).
- **`grace_day` es `+1` ciego** (`subscriptions/index.ts:447-448`):
  `prevGraceDay + 1` en cada `invoice.payment_failed`. Si Stripe **reentrega el mismo evento**
  (misma `event.id`), incrementa dos veces → `newGraceDay >= 3` prematuro → **suspende el negocio
  antes de tiempo** (Day 3 falso).
  - Importante: Stripe emite un `invoice.payment_failed` **distinto** (nueva `event.id`) por cada
    reintento real de cobro → esos SÍ deben contar. Solo las **reentregas de la MISMA `event.id`**
    (reintentos de entrega del webhook, no de cobro) son las que no deben re-incrementar.

### Diseño
**1. Tabla común** (una sola, compartida por ambos webhooks — misma BD, `event.id` es único global
por cuenta Stripe, no colisiona entre endpoints). Migración `039_processed_stripe_events.sql`:
```sql
create table if not exists public.processed_stripe_events (
  event_id     text primary key,
  type         text,
  processed_at timestamptz not null default now()
);
alter table public.processed_stripe_events enable row level security;
-- Sin policies → solo service_role (los webhooks) accede. Cliente sin acceso.
```

**2. Guard de idempotencia al inicio de CADA webhook**, *después* de verificar la firma y *antes*
de procesar. Insert-first atómico (resuelve la carrera sin SELECT-then-insert):
```ts
const { data: fresh, error } = await db
  .from("processed_stripe_events")
  .insert({ event_id: event.id, type: event.type })
  .select("event_id")
  .maybeSingle();
if (error && error.code === "23505") {
  // Ya visto (reentrega) → 200 sin reprocesar.
  return jsonResponse({ received: true, duplicate: true });
}
if (error) { /* error real de BD → 500 para que Stripe reintente */ }
// fresh != null → primera vez, continuar al switch(event.type)
```
Aplicar en **`stripe-webhook`** (tras `constructEventAsync`, línea ~242) y en
**`subscriptions.handleWebhook`** (tras `constructEventAsync`, línea ~296).

**3. `grace_day` idempotente.** Con el guard #2, `invoice.payment_failed` **solo se procesa una vez
por `event.id`** → el `+1` deja de doblarse en reentregas. **Se mantiene `prevGraceDay + 1`** (es
correcto para reintentos de cobro reales, que traen event.id distintos), ahora protegido por el
dedup. Esta es la forma **más robusta y uniforme** (misma barrera que ordena todo el webhook).
  - *Alternativa evaluada y descartada como primaria:* derivar el día desde
    `invoice.attempt_count` de Stripe. Es más frágil — `attempt_count` sigue el calendario de
    reintentos de Stripe (Smart Retries), que no mapea 1:1 a "días de gracia" del negocio, y
    complica el mapeo a `>= 3`. Se puede añadir como defensa en profundidad después, pero el dedup
    por `event.id` ya cierra el bug reportado con cero cambios de lógica de negocio.

**Orden interno importante:** el guard va **después** de `constructEventAsync` (nunca insertar
`event.id` de un evento con firma inválida) y **antes** del `switch`.

### Qué podría romper
- 🟡 **Reprocesos legítimos que hoy "funcionan por reentrega":** si algún evento falló a mitad
  (ej. insertó `orders` pero no `order_items`) y hoy se "arreglaba" en la reentrega, con el dedup
  la reentrega se salta. **Mitigación:** el guard debe insertarse en `processed_stripe_events`
  **solo si el handler no lanzó** — o aceptar que un fallo parcial no se auto-cura por reentrega.
  **Decisión de diseño:** insertar el `event.id` **al inicio** (marca "visto") pero si el handler
  lanza, hacer `throw` → devolver 500 → Stripe reintenta **con la misma event.id**, que ahora
  está marcada… ⚠️ esto la bloquearía. **Solución correcta:** insertar el marcador **al inicio**,
  y en caso de error del handler, **borrar el marcador** (`delete where event_id`) antes de
  devolver 500, para que el reintento de Stripe sí reprocese. Documentar este patrón en el código.
  (Alternativa más simple: marcar `processed_at` solo al final, con un SELECT-guard al inicio —
  pero eso reintroduce la carrera. El insert-first + delete-on-error es el balance correcto.)
- 🟡 `stripe-webhook`: hoy su dedup es por `orders.stripe_pi_id`. Con el nuevo guard por `event.id`,
  ambos coexisten (defensa en profundidad). Un mismo PI puede generar `payment_intent.succeeded`
  con distinta `event.id` en teoría (no en práctica); el guard de `stripe_pi_id` (+ #8) sigue
  cubriendo ese caso.
- 🟢 `subscriptions`: gana idempotencia que hoy no tiene. Sin efectos en el path `create_checkout`.
- ⚠️ Ambos webhooks deben tener `SUPABASE_SERVICE_ROLE_KEY` (ya lo tienen) para escribir la tabla.

---

## FIX #6 — Recalcular modificadores en `payments`  ⚡ payments + 📱 cliente

### Estado actual (verificado) — **la premisa del diagnóstico era incorrecta**
El diagnóstico asumía una tabla `modifier_options(price_cents)`. **No existe.** El esquema real:
- **Legacy (lo que usa el checkout mobile):** `menu_items.options` (jsonb) con forma
  `{ sizes: [{label, price_cents}], extras: [{label, price_cents}] }`. Es **columna del menú del
  negocio → server-owned y confiable**. `ProductDetailScreen` calcula
  `unitPriceCents = item.price_cents + size.price_cents + Σ extras.price_cents`.
- **Nuevo (solo web dashboard, migración 032):** `modifier_groups(choices jsonb)` +
  puente `menu_item_modifier_groups`. `choices` = `[{label, price_cents}]` (samples reales:
  `[{"label":"Sencillo","price_cents":0},{"label":"Doble","price_cents":500}]`). **No está cableado
  al checkout mobile ni a `payments`.**
- **El bug real es peor que "subcobro parcial":** en `CheckoutScreen.tsx:528-535` el payload a
  `payments` manda **`options: {}` vacío** por línea, y el server **ignora** `price_cents` del
  cliente y recalcula solo `menu_items.price_cents` (base). ⇒ **el precio de size + extras se pierde
  por completo** en el path de cobro. El cliente ve el total con extras, pero **Stripe cobra solo
  la base**. Subcobro del 100% del modificador.

### Diseño (basado en el sistema **legacy** `menu_items.options`, que es el que cobra hoy)
**A. Cliente** (`mobile/screens/checkout/CheckoutScreen.tsx` + `mobile/services/stripe.ts`):
forwardear la selección (solo **labels**, nunca precios) en `options`:
```ts
options: {
  size: l.size?.label ?? null,
  extras: l.extras.map((e) => e.label),
}
```
(hoy `CartLine` ya tiene `size`/`extras`; solo se está tirando la info al mandar `{}`.)

**B. Server** (`payments/handleCreatePaymentIntent`): además de `id, price_cents, is_available,
business_id, name`, **traer `options`** de `menu_items`. Para cada línea, resolver el precio de los
modificadores **desde la BD** (nunca del cliente):
```ts
// row = menu_items del ítem (incluye options jsonb, server-owned)
let modifierCents = 0;
const sel = it.options ?? {};
if (sel.size) {
  const s = (row.options?.sizes ?? []).find((x) => x.label === sel.size);
  if (!s) return errorResponse(`Invalid size "${sel.size}" for ${row.name}`);
  modifierCents += s.price_cents;
}
for (const label of sel.extras ?? []) {
  const e = (row.options?.extras ?? []).find((x) => x.label === label);
  if (!e) return errorResponse(`Invalid extra "${label}" for ${row.name}`);
  modifierCents += e.price_cents;
}
const lineUnitCents = row.price_cents + modifierCents;
serverSubtotal += lineUnitCents * it.qty;
```
- El `p` (precio) que se empaqueta en metadata (línea 201) debe pasar a ser `lineUnitCents`
  (base + modificadores) para que `order_items.price_cents` snapshot sea correcto en el webhook.
- Validar que los labels existan en el menú del ítem (si no → 400), para que un cliente no meta
  labels inventados con precio 0.
- **Tax** se recalcula sobre el nuevo `serverSubtotal` (ya lo hace). **Tope de tip** (200%) también
  se re-evalúa sobre el subtotal correcto.

**C. Sistema nuevo `modifier_groups` (fuera de alcance de esta tanda, dejar nota):** cuando el
checkout adopte `modifier_groups`, el server deberá, por ítem: `menu_item_modifier_groups → group.
choices`, y matchear la selección por `key`+`label` contra `choices[].price_cents`. Diseñar cuando
mobile use ese sistema; hoy no cobra por ahí.

### Qué podría romper
- 🟡 **Coordinación cliente↔server:** el fix requiere **desplegar el cliente y la función juntos**.
  Si solo se despliega el server (que ahora suma modificadores) sin que el cliente mande labels,
  no cambia nada (options vacío → 0 modificadores → igual que hoy). Si se despliega el cliente
  (manda labels) con server viejo, se ignoran → igual que hoy. **No hay ventana de doble cobro**,
  solo de "sigue sin cobrar extras" hasta que ambos estén. Orden seguro: server primero, cliente
  después.
- 🟡 **Discrepancia total cliente vs server:** hoy el cliente muestra un total con extras y el
  server cobra menos; tras el fix **coinciden** (el server ya devuelve `serverTotalCents` +
  `serverBreakdown` que el cliente puede reconciliar). Verificar en test mode que el monto de
  Stripe = total mostrado.
- ⚠️ **Ítems con `options` mal formados en BD:** si algún `menu_items.options` tiene una forma
  inesperada (no `{sizes,extras}`), los `?.` y el fallback `[]` evitan el crash y tratan como
  "sin modificadores". Aceptable.
- ⚠️ **Labels duplicados** dentro de `sizes`/`extras` (dos con el mismo label): `find` toma el
  primero. El menú no debería permitir labels duplicados; no bloqueante.
- 🟢 No toca BD. Solo redeploy `payments` + cambio mobile.

---

## Verificación en vivo (tras aplicar, en test mode)
- **#8:** `\d orders` muestra `orders_stripe_pi_id_uniq` parcial; insertar 2 órdenes con el mismo
  PI vía service_role → la 2ª falla con `23505`.
- **#9:** con un token de dueño, `update businesses set is_verified=true where id=<suyo>` → 0 filas
  afectadas / error de permiso; el badge sigue leyéndose.
- **#7:** invocar `create_setup_intent` con `user_id` de otro usuario → server usa el uid del token
  (no el del body); sin token → 401.
- **#5:** reenviar el mismo `event.id` (Stripe CLI `stripe events resend <id>`) a ambos webhooks →
  2ª entrega responde `{duplicate:true}`, `grace_day` no se dobla, no se crea orden duplicada.
- **#6:** pedir un ítem con size "Doble" (+$5) y un extra → el PaymentIntent en Stripe = base + 5 +
  extra + tax; `order_items.price_cents` refleja base+modificadores.

---

## Notas de despliegue
- **Migraciones (BD):** `037` (#8), `038` (#9), `039` (#5 tabla). Aplicar con `supabase db push`
  (o `apply_migration`). Aisladas entre sí.
- **Redeploys (Edge Functions):** `payments` (#6, #7), `stripe-webhook` (#5, #8-guard),
  `subscriptions` (#5). `supabase functions deploy <name>`.
- **Cliente mobile:** solo #6 (CheckoutScreen + stripe.ts). Desplegar **después** del redeploy de
  `payments`.
- Sin cambios de secrets nuevos. Todo sigue en test mode.
