# Plan: Cadena de suscripción (monetización)

**Estado:** DISEÑO CERRADO, implementación PENDIENTE. No empezar sin releer esto.
**Fecha:** 2026-07-14
**Método de cobro decidido:** Stripe Checkout (página alojada por Stripe), NO Elements.
Razón: mínima superficie PCI (SAQ A), maneja trial/reintentos/prorrateo/Customer Portal
nativamente, es código de Stripe y no nuestro (menos deuda). El Customer Portal cubre casi
todo el botón "Cuentas" del perfil.

## Decisión de modelo (Juan, 2026-07-14)
La suscripción Business/Pro la paga el USUARIO, no el negocio. UNA suscripción por persona
cubre TODOS sus negocios (Pro = hasta 10 negocios+eventos con una sola cuota de $99).

## Arquitectura decidida: OPCIÓN B — solo `users`, jubilar `subscriptions`
- El estado del plan vive ENTERO en la tabla `users`, que YA tiene las columnas:
  `plan`, `plan_status`, `plan_trial_end`, `stripe_customer_id`.
- La tabla `subscriptions` (hoy indexada por business_id) se JUBILA para el flujo de plan
  de usuario. NO se borra sin verificar antes que nada más la use (grep obligatorio).
- El gate del dashboard (web/app/dashboard/layout.tsx) YA lee users.plan + users.plan_status
  y YA está correcto (verificado 2026-07-14): exige plan IN ('business','pro') y
  plan_status IN ('active','trialing'), admins exentos. NO TOCAR el gate.

## El problema que esto arregla
La Edge Function `subscriptions` (v22) actual está construida sobre el modelo VIEJO
(business_id): su create_checkout recibe business_id, y su webhook escribe
subscriptions.business_id + businesses.plan. Pero el GATE lee users.plan. Nunca se tocan
→ alguien podría pagar y el webhook haría todo su trabajo en las tablas equivocadas, y el
gate seguiría rechazándolo. Hay que realinear la EF al eje user_id/users.

## Trabajo pendiente (en orden), para la próxima sesión
1. REESCRIBIR la Edge Function `subscriptions` alrededor de user_id (no business_id):
   - create_checkout: recibe { plan } + el user_id del JWT (ya verifica JWT). Crea/reusa
     el Stripe Customer (guardar users.stripe_customer_id). mode:'subscription'. metadata
     con user_id + plan. trial_period_days: 30 (hoy pone 7 — CORREGIR a 30). Sin tarjeta en
     el trial (Checkout lo soporta).
   - webhook: en checkout.session.completed / customer.subscription.updated/deleted /
     invoice.payment_failed/succeeded / trial_will_end → escribir users.plan,
     users.plan_status, users.plan_trial_end (NO businesses.plan). Resolver el usuario por
     metadata.user_id o por users.stripe_customer_id.
   - Mantener la idempotencia insert-first en processed_stripe_events (ya está bien).
   - Al vencer trial sin pago → users.plan='regular' (auto-downgrade del spec).
2. STRIPE DASHBOARD (manual, Juan): crear los Productos + Precios recurrentes mensuales
   (Business $49, Pro $99, Verified $1.99) en la cuenta de TEST primero. Copiar los Price
   IDs a los secrets STRIPE_PRICE_BUSINESS / STRIPE_PRICE_PRO / STRIPE_PRICE_VERIFIED de la
   Edge Function.
3. WEBHOOK de Stripe: suscribir los eventos de suscripción en el endpoint
   (checkout.session.completed, customer.subscription.updated, customer.subscription.deleted,
   invoice.payment_failed, invoice.payment_succeeded, customer.subscription.trial_will_end).
   Nota: hoy el endpoint del sandbox solo escucha 3 eventos de payment_intent.
4. PRICING PAGE (web + móvil), estilo claude.ai/pricing. Botón por plan → llama a
   create_checkout → redirige a la url de Checkout.
5. Column allow-list: users.plan/plan_status/plan_trial_end NO son escribibles por el
   cliente (migr 066 ya lo garantiza). Solo la EF (service_role) los escribe. Verificar que
   sigue así tras cualquier cambio.

## Casos aparte (no en esta cadena)
- Plan `verified` ($1.99): es de USUARIO (badge en perfil, sin dashboard). NO encaja en la
  lógica de negocios. Puede reusar la misma EF por user_id, pero su "beneficio" es un flag
  de perfil, no acceso al dashboard. Diseñar por separado.
- Límites combinados server-side (business=1, pro=10 negocios+eventos): trigger como el de
  empleados (migr 062). Va DESPUÉS de que la cadena de pago funcione.
- Promo codes y afiliados: al final, sobre una base que ya cobra.

## Lo que YA está hecho (no rehacer)
- Gate del dashboard por plan (layout.tsx) ✅ verificado.
- migr 066: users.plan/role/etc no auto-escribibles por el cliente ✅.
- Datos actuales: 61 users regular/active, 2 pro/active, 0 business, 0 trialing. El tier
  business y el estado trialing NUNCA se han ejercitado.
