# Diagnóstico de seguridad de flujos de pago (2026-07-07)

> Auditoría del estado ACTUAL, sin cambios de código. Alcance: las 4 Edge Functions
> (`payments`, `stripe-connect`, `stripe-webhook`, `subscriptions`), RLS de
> `businesses`/`orders`/`subscriptions`, privilegios por columna, y cálculo de totales.
> Veredicto por punto: ✅ seguro · ⚠️ parcial/riesgo · 🔴 vulnerable · ❓ no aplica aún.
>
> **TL;DR:** el `create_payment_intent` de `payments` está bien hecho (JWT + recálculo +
> idempotencia). PERO hay **4 huecos críticos alrededor** que lo dejan sin valor si no se
> cierran: (1) el cliente puede **insertar órdenes "pagadas" directo por RLS** sin pasar por
> Stripe; (2) el dueño puede **auto-cambiar su `plan`/`tax_rate`/`stripe_account_id`** por
> UPDATE directo; (3) `stripe-connect` no verifica propiedad → **login link al Stripe de otro
> negocio**; (4) `subscriptions.create_checkout` es **anónimo** (verify_jwt=false, sin checks).

---

## Config `verify_jwt` (config.toml)

| Función | verify_jwt | Correcto? |
|---|---|---|
| payments | `true` | ✅ |
| stripe-connect | `true` | ✅ (pero no usa la identidad — ver abajo) |
| stripe-webhook | `false` | ✅ (webhook de Stripe, verifica firma) |
| subscriptions | `false` | 🔴 sirve TAMBIÉN al `create_checkout` de la app → ese path queda **sin auth** |

---

## `payments/index.ts`

**1. Qué recibe del cliente:** `{ action, order: { business_id, user_id, order_type, items[],
tip_cents, subtotal_cents, tax_cents, discount_cents, total_cents, promo_code, ... } }`. Recibe
montos **y** IDs.

**2. Recálculo (P0-2):** ✅ **Recalcula server-side.** `serverSubtotalCents` = Σ
`menu_items.price_cents` (BD) × qty; ignora `price_cents`/`total_cents`/`subtotal_cents` del
cliente. Tax = `business.tax_rate` (fallback 8%). Tip = único monto del cliente, validado y
**capado al 200%** del subtotal. Discount forzado a 0. El `amount` del PaymentIntent usa
`serverTotalCents` (línea 243). Idempotency key presente (línea 234, 260).
  - ⚠️ **GAP: los modificadores NO se recalculan.** `items[].options` se guarda en metadata
    pero **no suma su precio** al subtotal (solo `menu_items.price_cents`). Si un ítem tiene
    modificadores con costo (ej. +shot), el total server los **omite → subcobro**. Para P0-2
    correcto hay que leer `modifier_options` server-side.

**3. Permisos (P0-3):**
  - ✅ `create_payment_intent`: verifica el JWT (`userClient.auth.getUser()`), usa `authUserId`
    para todo; `body.user_id` solo es traza. Correcto.
  - ⚠️ `ensure_customer` y `create_setup_intent`: usan `body.user_id` **sin verificar JWT**
    (TODO reconocido en el código). Con `verify_jwt=true` el caller debe estar logueado, pero
    puede pasar el `user_id` **de otro** → crea/lee el Stripe customer + `ephemeralKey` de otro
    usuario (IDOR sobre métodos de pago). Severidad media.

**4. Firma webhook:** ❓ no aplica (no es webhook).
**5. Idempotencia:** ✅ `idempotencyKey` en `paymentIntents.create`.
**6. verify_jwt:** `true` ✅.

---

## `stripe-connect/index.ts`

**1. Qué recibe:** `{ action, business_id, email, business_name, country }`. IDs.
**2. Recálculo:** ❓ no maneja montos de orden.
**3. Permisos (P0-3):** 🔴 **VULNERABLE (IDOR).** `verify_jwt=true` (requiere login) pero la
función **nunca lee el JWT ni verifica que el caller sea dueño del `business_id`**. Opera sobre
el `business_id` del body con service_role:
  - `create_login_link` → devuelve un **login link al dashboard de Stripe Express de CUALQUIER
    negocio** (acceso a su cuenta financiera). 🔴🔴
  - `create_connect_account` → crea/liga `stripe_account_id` para un negocio ajeno (si no tiene
    uno, un atacante podría anclar su propio onboarding → **redirigir payouts**). 🔴
  - `get_account_status` → filtra estado de la cuenta Stripe de cualquier negocio.
**4. Firma:** ❓ no aplica.
**5. Idempotencia:** sin idempotency key en creación de cuenta/link (menor).
**6. verify_jwt:** `true` (necesario) pero **insuficiente sin check de propiedad**.

---

## `stripe-webhook/index.ts` (órdenes)

**1. Qué recibe:** evento Stripe crudo + firma. Los montos salen de `paymentIntent.metadata`
(que `payments` llenó **server-side**), no del cliente.
**2. Recálculo:** ✅ escribe en `orders` los montos de la metadata (confiable, seteada por
`payments`). Correcto **siempre que las órdenes solo se creen por aquí** (ver hueco RLS abajo).
**3. Permisos:** ❓ invocado por Stripe.
**4. Firma webhook:** ✅ **ACTIVA** — `stripe.webhooks.constructEventAsync(rawBody, sig,
webhookSecret)` (línea 236). NO está stubbed. (El `// TODO(security)` de la guía de deployment
ya NO aplica al código actual.)
**5. Idempotencia:** ⚠️ guard por `SELECT ... where stripe_pi_id = PI` antes de insertar (línea
115). Funciona, pero **no hay UNIQUE constraint en `orders.stripe_pi_id`** (confirmado en BD) →
ventana de carrera si Stripe reentrega el evento en paralelo. Sin tabla de `event.id` procesados.
**6. verify_jwt:** `false` ✅ + firma ✅.

---

## `subscriptions/index.ts`

**1. Qué recibe:** path app `{ action:"create_checkout", business_id, plan, success/cancel_url }`;
path webhook = evento Stripe crudo. Distingue por el header `stripe-signature` (línea 528).
**2. Recálculo:** ✅ el monto es el **Stripe Price ID** del catálogo server-side (`PLANS`), no
un monto del cliente. Correcto para el cobro.
**3. Permisos (P0-3):** 🔴 **CRÍTICO.** `verify_jwt=false` y `handleCreateCheckout` **no
autentica ni verifica propiedad** — lee `business_id`/`plan` del body directo. Peor: el path de
**downgrade a plan gratis** (líneas 149-172) **escribe con service_role** `subscriptions.upsert`
+ `businesses.update({plan:'regular'})` para CUALQUIER `business_id`, **sin JWT**. → Un atacante
**anónimo** puede degradar el plan de cualquier negocio (tampering/DoS) con
`{action:"create_checkout", business_id:<víctima>, plan:"regular"}`.
**4. Firma webhook:** ✅ ACTIVA (`constructEventAsync`, línea 242) para el path webhook.
**5. Idempotencia:** 🔴 `invoice.payment_failed` hace `grace_day = prevGraceDay + 1` (líneas
398-399) **no idempotente**: si Stripe **reentrega** el evento, incrementa dos veces → puede
**suspender el negocio antes de tiempo** (Day 3 prematuro). Sin tabla de `event.id`. `checkout.
sessions.create` sin idempotency key.
**6. verify_jwt:** `false` — ✅ correcto para el webhook, 🔴 **incorrecto para `create_checkout`**
(que queda expuesto). Una función sirve a ambos: hay que verificar el JWT manualmente en el path
de la app, o partir la función en dos.

---

## Puntos transversales

**7. ¿Dónde se calcula el total HOY?**
- El **cliente** calcula una estimación en el checkout; el **servidor** (`payments`) recalcula el
  monto autoritativo del PaymentIntent desde precios de BD. ✅ para el cobro Stripe.
- PERO ese recálculo **solo protege el path de cobro**. La creación de la orden tiene un camino
  paralelo inseguro por RLS (ver punto 8).

**8. RLS de `businesses` / `orders` / `subscriptions`:**
- 🔴 **`orders: customer insert`** → `WITH CHECK (auth.uid() = user_id)`. Un usuario autenticado
  puede **INSERTAR una orden `status='confirmed'` con cualquier `total_cents`** directo por el
  cliente Supabase, **sin pasar por Stripe ni el webhook**. Fabrica una orden "pagada" gratis; el
  KDS la muestra. **El webhook NO es el único que puede crear órdenes.** CRÍTICO P0-2.
- 🔴 **`businesses: owner update`** → `USING (auth.uid() = owner_id)`, **sin `WITH CHECK`**, y el
  rol `authenticated` tiene **UPDATE por columna** en `plan`, `tax_rate`, `stripe_account_id`,
  `status`, `owner_id` (confirmado en BD). Un dueño puede, por UPDATE directo sobre SU negocio:
  auto-ponerse `plan='pro'` (upgrade gratis / saltar suscripción), `tax_rate=0` (subcobrar
  impuesto), `stripe_account_id=<atacante>` (**redirigir payouts**), `status='active'`
  (auto-des-suspenderse). Estas columnas deben ser **solo service_role**. CRÍTICO.
- ✅ **`subscriptions`**: solo políticas SELECT (owner/admin). **No hay política de escritura para
  el cliente** → la tabla está bloqueada a service_role. Bien. (Pero el bypass real es
  `businesses.plan`, que sí es escribible por el dueño.)
- ⚠️ **`orders` UPDATE**: dueño o cliente, sin `WITH CHECK` → el cliente podría modificar
  `total_cents`/`status` de su propia orden.
- ⚠️ Sin **UNIQUE** en `orders.stripe_pi_id`.

**9. ¿Autorización basada en `raw_user_meta_data`?** ✅ **No.** Grep en functions + migrations sin
coincidencias; la autorización usa `auth.uid()` + tablas (`owner_id`, `is_platform_admin()`).

---

## Veredicto por objetivo

| Objetivo | Veredicto | Motivo |
|---|---|---|
| **P0-2 — recálculo server-side** | 🔴 **VULNERABLE** (globalmente) | El PI se recalcula ✅, pero el cliente puede **crear órdenes directo por RLS** saltándose el cobro; y los **modificadores no se recalculan**. |
| **P0-3 — functions no confían en el cliente** | 🔴 **VULNERABLE** | `subscriptions.create_checkout` anónimo; `stripe-connect` sin check de propiedad (IDOR, login-link ajeno); `payments` ensure_customer/setup_intent sin JWT. |
| Firma de webhooks | ✅ Activa en ambos webhooks | `constructEventAsync` presente. |
| Idempotencia de cobro | ✅ (payments) / ⚠️ (webhooks) | PI con key ✅; orders sin UNIQUE; grace_day no idempotente 🔴. |
| Escritura de columnas financieras | 🔴 Abierta al cliente | `plan`/`tax_rate`/`stripe_account_id`/`status` UPDATE-ables por el dueño. |
| Auth vía metadata mutable | ✅ No se usa | — |

---

## Lista priorizada de qué arreglar

### P0 — bloqueante antes de dinero real
1. **`orders` — cerrar la inserción directa del cliente.** Quitar/endurecer la política
   `orders: customer insert`: las órdenes deben crearse **solo por service_role** (el webhook).
   (Alternativa: `WITH CHECK` que el cliente no pueda satisfacer, o trigger que exija
   `stripe_pi_id` + estado no confirmable por el cliente.)
2. **`businesses` — proteger columnas financieras.** `REVOKE UPDATE (plan, tax_rate,
   stripe_account_id, status, owner_id)` a `authenticated`/`anon` (dejarlas service_role-only),
   o política/trigger con `WITH CHECK` que impida cambiarlas por el dueño. El dueño sigue
   editando name/hours/etc.
3. **`subscriptions.create_checkout` — autenticar + autorizar.** Verificar el JWT manualmente en
   el path de la app y comprobar que `auth.uid()` es dueño del `business_id` antes de crear
   checkout o hacer el downgrade. (O partir en dos funciones: webhook `verify_jwt=false` +
   checkout `verify_jwt=true`.)
4. **`stripe-connect` — check de propiedad en las 3 acciones.** Leer el JWT y exigir
   `auth.uid() = businesses.owner_id` (o admin) antes de crear cuenta / status / **login link**.

### P1 — correctitud e integridad
5. **`payments` ensure_customer / create_setup_intent** — verificar JWT y usar `authUserId`, no `body.user_id`.
6. **Idempotencia de webhooks** — tabla `processed_stripe_events(event_id UNIQUE)` chequeada al
   inicio de ambos webhooks; y volver `grace_day` derivable (no `+1` ciego) para que la
   reentrega no suspenda de más.
7. **UNIQUE en `orders.stripe_pi_id`** — endurece el guard de idempotencia del webhook de órdenes.
8. **`payments` — recalcular modificadores** desde `modifier_options` (sumar su precio al subtotal server).

### P2 — hardening
9. Idempotency key en `subscriptions` `checkout.sessions.create`.
10. `WITH CHECK` en `orders`/`businesses` UPDATE para evitar reasignar `owner_id`/`user_id`/montos.

---

## Nota para el checkout web (Fase 3) que viene
Antes de activar "comprar" en `/c/[token]`, los P0 #1 (orders RLS) y #3/#4 (Edge Functions con
auth+ownership) deben estar cerrados — de lo contrario el checkout web hereda exactamente los
mismos huecos. El path correcto: menú → `payments.create_payment_intent` (ya seguro) → webhook
crea la orden; **nunca** insertar la orden desde el cliente.
