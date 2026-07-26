# JChat 3.0 — Estado

Last updated: 2026-07-25
Fuente de verdad de "cómo está la app HOY". La bitácora histórica (sesión por sesión) vive en
`docs/archive/PROJECT_STATUS_historico.md`. Las decisiones, en `docs/DECISIONS.md` (D-75).

Convención: ✅ verificado contra código/BD · 📼 según bitácora, sin reconfirmar · ⚠️ riesgo · 🔴 bloqueante

---

## Qué es

App social + comercio basada en ubicación. Chats de grupo por local físico, pedidos/pagos en el
local vía Stripe, UI centrada en mapa, suscripciones de negocio en tres niveles.
Mercados declarados: **USA + República Dominicana** (ver bloqueante RD abajo).

## Números reales (BD, 2026-07-24)

| | |
|---|---|
| Tablas (public) | 60 |
| Última migración | 102 (`102_pinned_messages_update_allowlist`) |
| Usuarios | 67 (regular + 3 pro + 1 business) |
| Negocios | 18 — **solo 1 con Stripe conectado** |
| Pedidos | 17, todos pagados |
| Códigos promocionales | 5 |
| Edge Functions | 8 · `payments` v39 (jwt on) · `stripe-connect` v27 (on) · `stripe-webhook` v34 (off) · `subscriptions` v34 (off) · `delete-account` v14 (on) · `stripe-refund` v5 (on) · `tab-pay` v4 (off) · `guest-pay` v5 (off) |

Stripe está en **modo prueba** (tarjeta 4242). Producción web: `jchat.cloud` (Vercel).
Repo: `jcgarcia007/jchat-3` · Local: `/Users/jcgarcia/Projects/JchatVer3.0`.

---

## Funciona (verificado con evidencia real)

- ✅ **Pagos end-to-end** (móvil): menú → modificadores → carrito → mesa → Stripe → webhook → orden
  en BD con impuesto y propina. Totales recalculados server-side (P0-2/P0-3 cerrados).
- ✅ **Checkout de invitado** (web, sin cuenta): `guest-pay` + hCaptcha + red de huérfanos. 3 pagos
  de invitado reales, 0 huérfanos.
- ✅ **Suscripciones con tarjeta + cobro automático**: Stripe Checkout pide tarjeta, prueba de N
  días, cobra al vencer, Portal de Cliente para cancelar. Verificado con prueba de 60 días real.
- ✅ **Códigos promocionales**: super-admin genera/gestiona; alimentan `trial_period_days` en
  Stripe (no regalan plan). Verificado de punta a punta.
- ✅ **Consentimiento de renovación automática** antes de la tarjeta (D-73).
- ✅ **Stripe Connect operativo**: Bar XZX recibe el dinero (verificado, $37.92 netos de $39.36).
- ✅ **Gate de plan** en el dashboard, con caducidad de prueba (verificado en vivo).
- ✅ **Bienvenida post-registro** (arregla el bucle registro→dashboard).
- 📼 **Chat**: presencia + realtime en iOS/Android/web, sub-chats, TTL 24h, fotos, temas.
- 📼 **Menú web público** `/m/[slug]` con modificadores estilo Uber Eats.
- 📼 **Social** (seguir/privacidad/bloqueo/DM), **mesas/meseros/cocina (KDS)**.
- ✅ **Seguridad base**: RLS, allow-lists de columnas, JWT en las 8 EF, revocaciones a anon.

---

## Roto o que engaña al usuario (prioridad alta)

- ✅ **Analytics — ahora 100% honesto** (2026-07-24, commits `dbde566` + `9b9afa6`): se quitaron las
  pestañas con datos inventados (Forecast, Customers, Chat, API) y el ROI falso de Loyalty. Quedan
  Revenue, Products y Loyalty (solo puntos), más la banda "Overview — live" — todo desde la BD real.
  El PDF también se limpió. Ya enlazada en el menú (2026-07-24). Falta verificación visual en vivo
  (requiere sesión de dueño con negocio).
- ✅ **Disputas — "Approve Refund" SÍ reembolsa** (verificado leyendo el código en `main`, 2026-07-24):
  `handleApprove()` invoca la Edge Function `stripe-refund` (`{dispute_id, amount_cents}`) y NO escribe
  `status='approved'` a mano — la EF y el webhook son autoritativos. Reembolso completo = total real del
  pedido (`orders.total_cents` vía join); multi-negocio con selector sin mezclar; muestra el error real
  del servidor. La nota 🔴 anterior era vieja (6º caso de doc-que-miente). Ya enlazada en el menú.
- 🟠 **SMS de verificación comentado** 📼: los secretos de Twilio existen (el kill-switch no salta),
  pero el envío está en TODO. El usuario nunca recibe el código. Decidir: conectar Twilio o eliminar
  el paso (hoy la verificación la hace el super-admin a mano).

---

## Bloqueantes de lanzamiento

### No son código (decisiones / paneles)

- 🔴 **República Dominicana**: Stripe Connect NO opera en RD. Con mercado USA+RD declarado, un
  negocio dominicano no puede cobrar hoy. **Pendiente de decisión desde el 2026-07-13.** Condiciona
  el plan entero. Opciones: (a) lanzar USA con pagos + RD solo social; (b) procesador local
  (Azul/CardNet) — proyecto propio; (c) aparcar RD.
- 🔴 **SMTP propio** (Resend/SendGrid) 📼: Supabase limita a 2 correos/hora → el 3er registro de la
  hora no recibe nada. Necesario ANTES de activar verificación de correo.
- 🔴 **Stripe a modo vivo**: recrear los DOS endpoints de webhook, sus eventos y secretos; rotar
  claves; redesplegar las EF; recorrer el Go-Live Checklist.
- 🟠 **Verificación de correo** (hoy apagada → cualquiera se registra con correo falso).
- 🟠 **Correos de Stripe** (aviso de fin de prueba + renovación): interruptor en el panel; requiere
  completar datos del negocio. **Requisito legal en modo vivo.**
- 🟠 **Supabase Pro** ($25/mes) para protección de contraseñas filtradas (y para subir el límite de
  correos). Hará falta igual antes de lanzar.
- ⚠️ **`.p8` de Apple**: el client secret (JWT) CADUCA ~enero 2027 → el login con Apple se romperá
  en silencio. Regenerar antes. (La clave NUNCA estuvo comprometida — la premisa vieja era falsa.)

### Sí son código

- ✅ **D-54 — barrido de column-grants COMPLETO** (D-75, migraciones 089–102, 2026-07-25): las ~44
  tablas con grant de escritura de tabla completa a `authenticated`/`anon` quedaron con allow-lists de
  columnas verificados contra el código; escritura de `anon` en todo `public` = 0. Queda solo
  `room_access_attempts` (🔴 fix de arquitectura: lockout de contraseña de sala auto-reseteable) y tres
  flujos rotos por falta de política RLS de UPDATE (invitación de empleado, dismiss-report), en arreglo
  aparte.
- 🟠 **Selector global de negocio** en el dashboard: sin él, el plan Pro (10 negocios) no es usable.
- 🟠 **i18n EN/ES completo**: el bloque más grande. La base está puesta (welcome bilingüe); falta el
  barrido de dashboard, móvil, super-admin y correos.

---

## Falso en el doc viejo (corregido al verificar 2026-07-24)

- ~~"No existe usuario con plan business"~~ → **sí existe 1** (`test1`).
- ~~"~47 tablas"~~ → **60**.
- ~~"migraciones hasta 086 / subscriptions v29"~~ → **088 / v34**.
- ~~"borrar cuenta con pedidos FALLA (NOT NULL vs SET NULL)"~~ → **ya está arreglado**: `orders.user_id`
  es nullable con `ON DELETE SET NULL`, coherentes.
- ~~aviso de arriba "revocar .p8 ANTES de producción"~~ → **ya rotada; la premisa era falsa**.

---

## Backlog (no bloqueante)

Afiliados (greenfield) · `UserProfileScreen` (hoy placeholder) · plantillas de menú en móvil (D-27) ·
GC de fotos huérfanas en `post-media` · 4 bloques de pruebas manuales en device (social, modificadores,
DM gate, TTL) · registro auditable del consentimiento en BD · consolidar la regla de prueba vencida
(duplicada gate/welcome) · limpiar env vars duplicadas + rama `feat/guest-checkout-ui`.

---

## Estimación al lanzamiento (USA, RD fuera del alcance inicial)

**12–18 sesiones (~50–75 h)**, dominadas por: i18n, migración a Stripe live, auditoría de las tablas
restantes, arreglar/quitar lo que engaña (Analytics, refund UI, SMS), y los requisitos de panel
(SMTP, correos, verificación). NO incluye la revisión de Apple (1–3 semanas de espera externa).

Riesgo que mueve el número: **no hay pruebas automatizadas** (todo se verifica a mano) y varias cosas
están marcadas 📼 sin reconfirmar — cada verificación puede revelar trabajo hecho (ahorra) o roto
(cuesta). El patrón de estas semanas: aparecen ~2-3 sorpresas por sesión en ambas direcciones.
