# JChat 3.0 — Estado

Last updated: 2026-07-30
Fuente de verdad de "cómo está la app HOY". La bitácora histórica (sesión por sesión) vive en
`docs/archive/PROJECT_STATUS_historico.md`. Las decisiones, en `docs/DECISIONS.md` (D-79).

Convención: ✅ verificado contra código/BD · 📼 según bitácora, sin reconfirmar · ⚠️ riesgo · 🔴 bloqueante

---

## Qué es

App social + comercio basada en ubicación. Chats de grupo por local físico, pedidos/pagos en el
local vía Stripe, UI centrada en mapa, suscripciones de negocio en tres niveles.
Mercados: **USA en el lanzamiento; República Dominicana diferida a una fase final** (ver D-77).

## Números reales (BD, 2026-07-24)

| | |
|---|---|
| Tablas (public) | 60 |
| Última migración | 114 (`114_platform_config_min_1m`) · 118 aplicadas en BD |
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
- ✅ **Menú web público** `/m/[slug]` con modificadores estilo Uber Eats. **Altura reactiva en iOS**
  (2026-07-30, merge `b157025`): hook `visualViewport` en `MenuPageClient` publica `--menu-vh`; 18
  plantillas usan `var(--menu-vh, 100vh)` + `env(safe-area-inset-bottom)` en 11 CTAs inferiores (D-78).
  Fix de pago: `CheckoutStep.Sheet` usa `createPortal(…, document.body)` — escapa el transform del
  shell, el sheet de pago cubre la pantalla donde está el usuario aunque el menú esté scrolleado (D-79).
  Editor del menú (preview iPhone render-directo, paleta correcta, reset al cambiar plantilla) en
  producción desde `83bdaa1` (2026-07-30). **Pendiente:** plantilla "bottom-nav" NO implementada —
  cae al `Classic` vía default del `MenuTemplateRenderer`; marcada "Próximamente" en el selector.
  Construirla es trabajo nuevo. Fotos de menú de Bar XZX migradas al bucket (one-shot, producción).
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

- 🟢 **República Dominicana — DIFERIDA al último paso** (decisión 2026-07-26, D-77): Stripe Connect no
  opera en RD, así que RD NO entra en el lanzamiento inicial. Se lanza **USA primero, con pagos**; RD se
  aborda como fase FINAL (RD solo-social, o un procesador local tipo Azul/CardNet como proyecto propio).
  Ya NO bloquea el plan.
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
  columnas verificados contra el código; escritura de `anon` en todo `public` = 0. **Cerrado del todo
  (2026-07-26):** `room_access_attempts` ya NO es auto-reseteable (código `9cacf79` + migr `103`: el
  cliente solo lee su fila; la RPC `verify_room_password` SECURITY DEFINER gobierna el lockout
  server-side y hashea la contraseña de sala). Los dos flujos que quedaron sin política RLS de UPDATE —
  invitación de empleado y dismiss-report — están arreglados (política + grant de `status`; reconciliados
  en git como migr `104`/`105`). Migraciones en disco hasta la 110 (103 = lockdown; 104–110 =
  reconciliación BD↔git).
- ✅ **Selector global de negocio — YA CONSTRUIDO** (verificado en código 2026-07-26):
  `resolveActiveBusiness()` (web/lib/business.ts) lee `users.active_business_id` con fallback al negocio
  más reciente; hay switcher funcional (en el `TopBar` del shell actual, y un `BusinessSwitcher` en el
  shell nuevo "4A" tras el flag `NEXT_PUBLIC_NEW_DASHBOARD`). Pendiente para darlo por cerrado: confirmar
  qué shell está en producción (env de Vercel) y, si es el 4A, cerrar un hueco de propagación (el
  contenido de página no se re-resuelve al cambiar sin recargar); + un test en vivo con cuenta de 2+
  negocios.
- 🟢 **i18n EN/ES — mayormente COMPLETADO** (sesión 2026-07-28, ~18 commits auditados full_patch): barrido completo de **móvil** (22 archivos, 1021 claves, 14 namespaces i18next), **dashboard web** (4A), **super-admin** (12 páginas + shell, namespace `superAdmin`, 316 claves next-intl), **menú público** (colorPalettes: 40 nombres + 8 familias). Frente de **fechas/moneda** locale-aware centralizado (web `lib/currency.ts` + `lib/relativeTime.ts`; móvil `utils/currency.ts`) — evitó bug 100x cents/dólares en analytics, CSV preservado por correctness. Pasada **es-DO** a español neutro-latino (el proyecto ya lo era en ~99%; solo se limaron outliers es-ES: TPV→POS, pulsado→presionado, Introduce→Ingresa, guillemets). Limpieza total de **dev-text** visible al usuario (Task X.X/TODO/is_banned/Edge Function fuera de la UI, 3 pasadas). Total claves: web 1877/1877 en/es, móvil 1023/1023. **FALTA:** correos/emails transaccionales (aún sin i18n) y una eventual pasada RD-específica (no urgente).
- 🟠 **Tres features Stage-3 a medio construir (UI por delante del backend) — construir o gatear antes de
  lanzar** (ver D-76): (1) **lealtad** (ganar puntos nunca cableado; canje sin RPC), (2) **force-refund de
  super-admin** (Task 3.6; hoy neutralizado, no llama a Stripe), (3) **gestión de equipo de admins** (Task
  3.13; add/remove sin RPC). Ninguna hace daño hoy (inertes/neutralizadas); todas necesitan backend
  server-side/RPC con guardas, NO parches de grants.
- ⚠️ **CSP en ENFORCE, sin validar** (verificado en `web/next.config.ts` 2026-07-26): el header se envía
  como `Content-Security-Policy` (modo enforce), NO Report-Only — los comentarios del archivo dicen
  "Report-Only" por un revert documentado que nunca cambió el `key`, y `middleware.ts` no lo sobreescribe.
  El allow-list está bien calibrado (Supabase, Maps, Stripe, hCaptcha, fuentes self-hosted), pero el
  walkthrough de validación en un preview NO se hizo y hay historial de que un enforce previo rompió prod.
  Antes de tráfico real: recorrer los flujos (login, mapa, checkout Stripe, hCaptcha) con la consola
  abierta en un preview; si se prefiere diferir, cambiar el `key` a `Content-Security-Policy-Report-Only`.
  Las violaciones CSP son client-side → NO aparecen en los logs de Vercel.
- 🟢 **Épico Geocerca y Control de Acceso al Chat — COMPLETO** (sesión 2026-07-28, 7 SHAs
  auditados full_patch). Diseño: `docs/EPICA_GEOCERCA_ACCESO_CHAT.md` + `docs/FASE3_BARRERA_SERVERSIDE.md`.
  **Regla de oro ABSOLUTA:** nadie fuera del radio entra al chat de un negocio, salvo el dueño. Ni QR
  ni contraseña eximen de la geo. Hecho y verificado de punta a punta:
  · **Fase 1.0** (`66b6939`, migr 111): trigger `sync_business_coords_radius` consolida coords/radio
    duplicados (lat/lng + geofence_radius_m primarios), 0 divergencias, sin tocar consumidores.
  · **Fase 1** (`ed925ee`): reverse-geocoding en LocationEditor (soltar pin → rellena Address);
    degrada con gracia si la Geocoding API no está habilitada.
  · **Fase 3.1** (`143cc93`, migr 112): barrera server-side — tabla `room_geo_presence` (aditiva) +
    RPC `check_geofence_and_join_room` (Haversine server-side atan2; el cliente REPORTA coords, el
    servidor DECIDE; default NO-acceso; dueño exento) + `can_access_room` revisado (sala sin
    contraseña ya NO da acceso libre; geo-presencia obligatoria; contraseña como AND adicional).
    `room_members`/verify_room_password/join_room_via_qr intactos.
  · **Fase 3.2** (`dff62d8`): cliente móvil — hook `useGeofenceGate` (permiso GPS 1 vez → RPC;
    heartbeat 5 min solo foreground+chat-abierto con doble guarda AppState, nunca lee GPS en
    background; gracia 2 min con rechecks 20s; degrada restrictivo sin crash; cleanup estricto).
    Dueño detectado por owner_id, entra sin GPS. Limitación conocida: sub-salas no geo-gateadas por
    separado en cliente (el server SÍ las gatea vía can_access_room — no es agujero, es deuda UX).
  · **Fase 2 / Chunk A1** (`3128262`, migr 113): tabla `platform_config` singleton (min/max radio,
    RLS SELECT-authenticated/UPDATE-admin); el trigger `enforce_business_radius_cap` lee el max de
    la config (con doble fallback a 50), no-retroactivo (bajar el cap no recorta radios existentes);
    overrides aprobados siguen ganando.
  · **Fase 2 / Chunk A2** (`11ce534`, migr 114): min global bajado a 1m (piso absoluto; 10m guía UX);
    panel super-admin `/super-admin/business-radius` (edita rango global, RLS admin-only); LocationEditor
    lee min/max de la config con fallback, slider min=config max=(config o override).
  · **Chunk B** (`986d5d6`): eliminada la sección legacy "Coverage Radius" solo-lectura de
    Configuration (era redundante y contradictoria con el LocationEditor, que ya deja al dueño
    ajustar su radio). Limpiados los huérfanos por grep (radiusM, radius_m del select+interface,
    IconLock, tCommon, 5 claves i18n). LocationEditor y la columna radius_m en BD intactos.
  **PENDIENTE (deuda menor, no bloqueante):** pulir la limitación de sub-salas (el heartbeat del
  cliente opera sobre la sala raíz; cambiar a una sub-sala con otro room_id no está geo-gateado por
  separado en cliente — el server SÍ la gatea vía can_access_room, no es agujero, es deuda UX).
  Fase 3.3 (web) DESCARTADA (chat de negocio web es solo vía QR). Fase 5 (QR-sin-GPS) ELIMINADA por
  la regla absoluta. **Operativo Juan:** habilitar Geocoding API en Google Cloud para el reverse-geo
  (Fase 1).

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
(duplicada gate/welcome) · limpiar env vars duplicadas + rama `feat/guest-checkout-ui` ·
bug de acentos en categoryMatches (Café) ARREGLADO (normalize NFD) ·
decisiones producto móvil: temas de perfil = marca (no traducir), DMsScreen huérfano BORRADO ·
2 dev-text menores restantes (inventoryEmailAlertsNote... resueltos; quedan 0 en UI visible) ·
brecha de presence: activeCount siempre 0 para negocios reales (falta sistema presencia en vivo — funcional, no i18n).

---

## Estimación al lanzamiento (USA, RD fuera del alcance inicial)

**12–18 sesiones (~50–75 h)**, dominadas por: i18n, migración a Stripe live, auditoría de las tablas
restantes, arreglar/quitar lo que engaña (Analytics, refund UI, SMS), y los requisitos de panel
(SMTP, correos, verificación). NO incluye la revisión de Apple (1–3 semanas de espera externa).

Riesgo que mueve el número: **no hay pruebas automatizadas** (todo se verifica a mano) y varias cosas
están marcadas 📼 sin reconfirmar — cada verificación puede revelar trabajo hecho (ahorra) o roto
(cuesta). El patrón de estas semanas: aparecen ~2-3 sorpresas por sesión en ambas direcciones.
