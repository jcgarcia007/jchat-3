# JChat 3.0 — Auditoría Senior · Parte 4 (Web) + 5 (POS vs Competencia) + 6 (MAPA MAESTRO pre-launch)

> Fecha: 2026-07-09 · Cierre de la auditoría completa. Las Partes 1-3 están en los
> otros dos documentos. Esta parte incluye el **mapa maestro con estimados en horas**
> (full-time), que es lo que pediste para planear el lanzamiento.

---

# PARTE 4 — WEB (Next.js dashboard + cliente público)

## Resumen

El `web/next.config.ts` está **completamente vacío** (`{}`). Para un dashboard que
maneja dinero, datos de negocio y un cliente público, eso significa **cero cabeceras
de seguridad**. Es el hallazgo central de web. Lo demás son cierres conocidos.

| # | Hallazgo | Sev |
|---|----------|-----|
| W1 | Sin security headers (CSP, HSTS, X-Frame-Options, etc.) — config vacía | 🔴 |
| W2 | Open-redirect `//evil.com` en guardia de login (`/c/[token]`) | 🟡 |
| W3 | Dos esquemas de QR coexisten (`/c/token` vs `/r/slug/slug`) sin reconciliar | 🟡 |
| W4 | `type 'image'` legacy leído junto a `'photo'` en mensajes viejos | 🟢 |
| W5 | Checkout web (Fase 3) NO existe aún — menú+carrito+Stripe en web | 🟡 |
| W6 | Sin CI real (solo `tsc`); cero tests automatizados | 🟡 |

## 🔴 W1 — Sin cabeceras de seguridad

`next.config.ts = {}`. Falta todo lo que un pentester marca de inmediato:
- **CSP** (Content-Security-Policy) — mitiga XSS, el riesgo #1 en web con UGC.
- **HSTS** (Strict-Transport-Security) — fuerza HTTPS.
- **X-Frame-Options / frame-ancestors** — anti-clickjacking.
- **X-Content-Type-Options: nosniff**, **Referrer-Policy**, **Permissions-Policy**.

**Fix:** añadir `async headers()` en `next.config.ts` con el set completo. CSP hay
que calibrarla (Supabase, Stripe, Google Maps, Mapbox necesitan allowlist de
dominios). Vercel también permite configurarlas. Es ~1-2h de trabajo + testing.

## 🟡 W2 — Open-redirect

Ya documentado en BACKLOG §4: la guardia `rawNext.startsWith('/')` no cubre
`//evil.com` (redirige fuera del sitio). **Fix:** `startsWith('/') && !startsWith('//')`.
15 minutos.

## 🟡 W3 — Dos esquemas de QR

`web/services/qr.ts` genera `/r/{slug}/{slug}` (Task 2.8) pero la Fase 1 usa
`/c/{token}` (el seguro). **Fix:** eliminar el esquema viejo y quedarse con
`/c/token` **antes de imprimir QRs reales** (si imprimes el esquema viejo, tendrás
QRs muertos). Se conecta con S1 de seguridad (el token firmado).

## 🟡 W5 — Checkout web pendiente

El cliente web (`/c/[token]`) tiene chat + llamar mesero, pero **no ordenar+pagar**.
Es la Fase 3 del web client. Con los P0 de pagos cerrados (orden solo por webhook),
esto ya se puede construir de forma segura. Estimado abajo.

## 🟡 W6 — Cero tests

Hoy el único gate es `npx tsc --noEmit`. Para código que mueve dinero, recomiendo
un mínimo de tests de las rutas críticas (webhook, recálculo de montos, RLS). No
hace falta 80% coverage; sí los caminos de dinero + auth. Vitest + un par de tests
de integración contra una branch de Supabase.

---

# PARTE 5 — POS SaaS: ¿está completo? ¿qué le falta? vs competencia

## Veredicto senior

**JChat NO es un POS de restaurante completo hoy, y está bien que no lo sea** — pero
hay que ser honesto sobre en qué categoría estás compitiendo. Tienes un **motor de
ordering + menú + KDS + pagos dentro de un chat social**, no un POS de piso de
restaurante. La brecha con Toast/Square es grande en profundidad operativa, pero tu
**diferenciador (POS pegado a chat de proximidad) no lo tiene nadie**.

## Lo que la competencia (Toast/Square 2026) trae de serie y tú NO

Comparado con lo que Toast y Square incluyen hoy (verificado, jul 2026):

| Capacidad | Toast | Square | JChat 3.0 | Gap |
|-----------|:---:|:---:|:---:|-----|
| Terminal staff-facing (tomar orden en piso) | ✅ | ✅ | ❌ | 🔴 falta |
| Table management / floor plan | ✅ | ✅ | ❌ (P2 en backlog) | 🔴 |
| Walk-in orders (sin usuario/cuenta) | ✅ | ✅ | ❌ (`orders.user_id` NOT NULL) | 🔴 |
| Split checks (÷N, por ítem, por monto) | ✅ | ✅ (plan pago) | ❌ (P1 backlog) | 🟡 |
| Propinas / tips en checkout | ✅ | ✅ | ⚠️ (campo existe, flujo parcial) | 🟡 |
| Course management / firing por tiempo | ✅ | ✅ (plan pago) | ❌ | 🟢 (no core JChat) |
| Cash / card-present / pre-auth de tab | ✅ | ✅ | ❌ | 🟡 |
| Refunds / disputes en dashboard | ✅ | ✅ | ⚠️ (spec sí, UI parcial) | 🟡 |
| 86-ing (marcar agotado en vivo) | ✅ | ✅ | ⚠️ (stock existe, 86 en vivo no) | 🟢 |
| Offline mode | ✅ | ✅ | ❌ (decisión consciente de NO) | 🟢 |
| KDS (kitchen display) | ✅ | ✅ | ✅ | — |
| Modificadores min/max | ✅ | ✅ | ✅ (migr 032) | — |
| Sin comisión por transacción | ❌ | ❌ | ✅ (solo suscripción) | ⭐ tu ventaja |
| Ordering dentro de chat social de venue | ❌ | ❌ | ✅ | ⭐⭐ único |
| Split por ítem ligado a quién pidió en el chat | ❌ | ❌ | ✅ (potencial) | ⭐⭐ único |

## Lectura estratégica

- **No persigas la paridad con Toast.** Perderías: ellos llevan 10+ años, hardware
  propio, coursing, offline nativo. El mercado ya tiene ganador en "POS profundo".
- **Doblá la apuesta en tu diferenciador:** el split-check por ítem que sabe **quién
  pidió qué desde el chat** es algo que Toast/Square estructuralmente no pueden hacer
  (no tienen la capa social). Ese es tu gancho de marketing y tu foso.
- **Lo mínimo para ser un POS usable** (no completo, usable) antes de vender a un
  venue real: (1) terminal staff-facing, (2) walk-in orders, (3) mesas, (4) split +
  tips server-side, (5) refunds desde dashboard. Sin esos 5, un dueño no puede operar
  un turno con JChat como su único sistema.

## Roadmap POS recomendado (ya alineado con tu backlog P0-P3)

**Fase POS-0 (bloqueante):** quitar `orders.user_id NOT NULL` → permitir walk-ins.
**Fase POS-1:** schema de mesas (`business_tables`) + `tabs` + terminal UI mínima.
**Fase POS-2:** pagos (cash, card-present, split, tips, refunds) server-side.
**Fase POS-3:** operaciones (shifts, Z-close, 86-ing en vivo).

Esto es tu migración `033_pos_core` ya diseñada — está bien encaminada.

---

# PARTE 6 — MAPA MAESTRO: qué falta para lanzar (con estimados full-time)

> Estimados en **días de trabajo full-time de un dev** (tú + Claude Code). Asumen
> foco, sin cambios de alcance. Rango = optimista–realista. "d" = día (~6-8h netas).

## LEYENDA de decisión de alcance de lanzamiento

Hay **dos lanzamientos posibles** y definirlos cambia el estimado radicalmente:

- **LANZAMIENTO A — App social + chat de venue (SIN POS de venta real).**
  Los usuarios entran a venues, chatean, ven menús, siguen gente. Los negocios
  aparecen y gestionan su sala/menú. **NO se cobra a clientes finales todavía** (o
  solo suscripciones de negocio). Mucho más rápido de lanzar.
- **LANZAMIENTO B — Todo lo anterior + comercio real (clientes pagan pedidos).**
  Requiere cerrar pagos live, checkout web/móvil pulido, refunds, y el mínimo POS.

Mi recomendación senior: **lanzar A primero** (beta), validar la parte social/venue
que es tu diferenciador, y activar B (comercio) con 2-3 venues piloto controlados.

---

## BLOQUE 1 — Seguridad crítica (bloqueante para CUALQUIER lanzamiento)

| Tarea | Est. |
|-------|------|
| S1 — Lockdown `rooms` (qr_token/password_hash) + RPC owner | 0.5–1 d |
| S2 — Revoke EXECUTE funciones + endurecer | 0.5 d |
| S3 — `public_profiles` security_invoker | 0.5 d |
| S4 — Rate limiting (Supabase Auth + Upstash/Cloudflare en Edge) | 1–2 d |
| S5/S6/S7 — leaked-pw toggle + buckets listing + stripe-events policy | 0.5 d |
| E1 — RLS initPlan wrap | 0.5 d |
| **Subtotal Bloque 1** | **3.5–5 d** |

## BLOQUE 2 — Web hardening (bloqueante para web pública)

| Tarea | Est. |
|-------|------|
| W1 — Security headers + CSP calibrada | 1–1.5 d |
| W2 — Fix open-redirect | 0.25 d |
| W3 — Reconciliar esquemas QR | 0.5 d |
| **Subtotal Bloque 2** | **1.75–2.25 d** |

## BLOQUE 3 — Móvil para stores (bloqueante para App Store / Play)

| Tarea | Est. |
|-------|------|
| M1 — Deep-link OAuth (Google + Apple funcional) | 1–2 d |
| M2 — Biometría resume sesión | 0.5–1 d |
| M4 — Sign in with Apple capability + provisioning | 0.5 d |
| M6 — Borrado de cuenta in-app | 1 d |
| M7 — Verificar flujo reportar/bloquear + doc moderación | 0.5–1 d |
| M8 — Permisos ubicación "when in use" | 0.25 d |
| M3 — Resolver Maps iOS | 0.5 d |
| M9 — OTA (runtimeVersion + canales) | 0.5 d |
| **Subtotal Bloque 3** | **4.75–6.75 d** |

## BLOQUE 4 — Notificaciones + emails (muy recomendado antes de usuarios)

| Tarea | Est. |
|-------|------|
| M5 — Push server-side senders (Edge Function/triggers) | 2–3 d |
| Emails transaccionales (confirmación orden, reset password) | 1–1.5 d |
| Cron jobs (grace de suscripción, expiry de trial, etc.) | 1–2 d |
| **Subtotal Bloque 4** | **4–6.5 d** |

## BLOQUE 5 — Pruebas manuales pendientes (ya en PROJECT_STATUS)

| Tarea | Est. |
|-------|------|
| 4 bloques de prueba (social A+B, modificadores, DM gate, TTL) | 1–2 d |
| **Subtotal Bloque 5** | **1–2 d** |

## BLOQUE 6 — Infraestructura de lanzamiento (config, no código)

| Tarea | Est. |
|-------|------|
| Stripe live mode (products, prices, webhooks prod, Connect) | 1–1.5 d |
| Google Maps keys prod + billing/budget | 0.5 d |
| Firebase FCM + APNs key + EAS credentials | 1 d |
| Twilio SMS real (verificación negocio) | 0.5 d |
| Vercel prod + dominio jchat.cloud + Supabase redirect URLs | 0.5 d |
| Sentry (crash/error monitoring) móvil + web | 0.5–1 d |
| **Subtotal Bloque 6** | **4.5–5.5 d** |

## BLOQUE 7 — Legal / compliance (BLOQUEANTE para stores, hoy inexistente)

| Tarea | Est. |
|-------|------|
| ToS + Privacy Policy (con 18+, UGC, CCPA/GDPR básico) | 1–2 d* |
| EULA con cláusula cero-tolerancia UGC (requisito Apple) | incluido |
| Página de privacidad enlazada en app + stores | 0.5 d |
| **Subtotal Bloque 7** | **1.5–2.5 d** |

\* Recomiendo un abogado o un generador serio (Termly/iubenda) + revisión. El tiempo
de dev es solo integrarlo; el legal en sí puede correr en paralelo.

## BLOQUE 8 — Comercio real (SOLO si vas a LANZAMIENTO B)

| Tarea | Est. |
|-------|------|
| W5 — Checkout web (menú+carrito+Stripe, atribución a usuario) | 3–5 d |
| Refunds/disputes UI en dashboard (2 niveles del spec) | 2–3 d |
| Pruebas E2E de pagos en test + live (smoke §9 del checklist) | 2–3 d |
| **Subtotal Bloque 8** | **7–11 d** |

## BLOQUE 9 — POS mínimo usable (SOLO si vendes a un venue que opere con JChat)

| Tarea | Est. |
|-------|------|
| POS-0 — walk-in orders (quitar user_id NOT NULL) | 1 d |
| POS-1 — mesas + tabs + terminal UI mínima | 4–6 d |
| POS-2 — cash/card-present/split/tips/refunds server-side | 5–8 d |
| POS-3 — shifts + Z-close + 86-ing en vivo | 3–5 d |
| **Subtotal Bloque 9** | **13–20 d** |

## BLOQUE 10 — Calidad / red de seguridad (recomendado, paralelizable)

| Tarea | Est. |
|-------|------|
| W6 — Tests de caminos críticos (webhook, montos, auth, RLS) | 2–4 d |
| E5 — Migrar campos sort a bigint | 0.5 d |
| Load-test presence (venue simulado 200-500) | 1 d |
| **Subtotal Bloque 10** | **3.5–5.5 d** |

---

## TOTALES por escenario

### Escenario 1 — LANZAMIENTO A (beta social + venues, sin comercio real)
Bloques 1+2+3+4+5+6+7+10 (parcial) =
**~25–33 días full-time** (≈ **5–7 semanas**).
Camino más corto a tener usuarios reales validando tu diferenciador.

### Escenario 2 — LANZAMIENTO B (comercio real, clientes pagan)
Escenario 1 + Bloque 8 =
**~32–44 días full-time** (≈ **6.5–9 semanas**).

### Escenario 3 — LANZAMIENTO B + POS operable por venues
Escenario 2 + Bloque 9 =
**~45–64 días full-time** (≈ **9–13 semanas**).

> Realismo senior: los estimados full-time asumen que Claude Code produce y tú
> auditas/pruebas. **Súmale un 20-30% de colchón** por lo imprevisto (review de
> Apple puede tomar días, un bug de pagos puede costar un día entero, el legal
> depende de terceros). Con colchón: A ≈ 6-9 semanas, B ≈ 8-12, C ≈ 12-17.

---

## Las 8 cosas MÁS importantes antes de lanzar (prioridad senior)

1. **S1 — cerrar la fuga del qr_token.** Es un IDOR de acceso total al chat. Sin
   esto, cualquiera entra a cualquier sala. Bloqueante absoluto.
2. **Legal (ToS/Privacy/EULA + 18+).** Sin esto Apple/Google te rechazan y quedas
   expuesto legalmente. Hoy no existe nada.
3. **OAuth + Sign in with Apple + borrado de cuenta.** Los 3 rechazos de review más
   comunes. M1/M4/M6.
4. **Security headers web (W1).** Config vacía = XSS/clickjacking abierto.
5. **Rate limiting (S4).** Sin esto, un script te tumba signups/DMs/verify_password.
6. **Push + emails (Bloque 4).** Una app social que no notifica se siente muerta.
7. **Stripe live + smoke tests de pago (si LANZAMIENTO B).** Nunca cobrar sin el
   smoke test §9 pasado.
8. **Sentry/monitoring.** Vas a lanzar solo; necesitas ver los crashes de usuarios
   reales sin que te los reporten.

## Lo que puedes DEJAR para después (no bloqueante)

- POS profundo (mesas, split, cash) — solo si vendes a un venue operativo.
- Offline mode (decisión consciente de NO — correcta).
- Denormalización de contadores, feed server-side, heatmap iOS.
- Stories/Reels, loyalty avanzado, analytics Pro, multi-location.
- Traducción de mensajes, smart replies, GIFs, mensajes de voz.

---

## Cómo sugiero proceder (un paso a la vez, tu estilo)

1. **Definir escenario** (A, B o C) — cambia todo el plan.
2. **Bloque 1 (seguridad) YA** — es barato, crítico, y no depende de nada más.
   Empezar por S1 aislado (prompt ya entregado).
3. En paralelo, **arrancar el legal** (corre por fuera del dev).
4. Luego Bloque 3 (móvil-stores) + Bloque 2 (web) — los bloqueantes de review.
5. Bloque 4 (push/emails) + Bloque 6 (infra) antes de abrir a usuarios.
6. Bloque 5 (pruebas pendientes) como verificación continua.
7. Bloque 8/9 solo según escenario.

Cada bloque lo convierto en prompts copy-paste para Claude Code cuando lo digas,
auditando cada SHA.
