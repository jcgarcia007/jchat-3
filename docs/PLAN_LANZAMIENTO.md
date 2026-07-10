# JChat 3.0 — PLAN DE LANZAMIENTO

> Hoja de ruta oficial hacia el lanzamiento, derivada de la auditoría senior
> completa del 2026-07-09 (seguridad, escalabilidad, móvil iOS/Android, web, POS).
> Los 4 informes de auditoría son la evidencia detrás de cada tarea.
>
> **Última actualización: 2026-07-10**

---

## ⚠️ CÓMO SE TRABAJA ESTE PLAN (leer antes de empezar)

Este documento es el **mapa compartido**, NO un guión que Claude Code ejecuta solo.
El trabajo se hace **UNA tarea a la vez**, con auditoría entre cada paso. Esto es la
red de seguridad: un error en una tarea de seguridad/dinero no debe arrastrarse a la
siguiente.

### Quién hace qué

| Tipo de trabajo | Responsable | Ejemplos |
|---|---|---|
| **Código** (implementar, migrar, commitear) | **Claude Code (CLI)** | RLS, RPCs, pantallas, Edge Functions, fixes |
| **Toggles / cuentas / dashboards** | **Juan (tú)** | Supabase toggles, Stripe products, Firebase, Twilio, App Store Connect, dominio Vercel |
| **Legal** | **Juan + abogado/servicio** | ToS, Privacy, EULA |
| **Auditar SHA + verificar + planear** | **Planning Claude (web)** | get_commit, verificar Supabase/Vercel, escribir el siguiente prompt, actualizar docs |

### El loop (SIEMPRE este orden)

1. Planning Claude escribe **un prompt acotado** (una tarea).
2. Juan lo pega en Claude Code → implementa SOLO eso → commitea → devuelve el **SHA**.
3. Juan pasa el SHA a Planning Claude → **auditoría** (¿hizo lo pedido? ¿algo no
   pedido? ¿rompió algo?) → verifica en Supabase/Vercel.
4. Solo si pasa: Planning Claude actualiza docs y escribe el **siguiente** prompt.

> ❌ NO hacer: "Claude Code, haz toda la Fase 1". Claude Code a veces agrega features
> no pedidas o quita validaciones (documentado en CONTINUITY.md). El commit pequeño +
> auditoría es lo que lo previene.
>
> ✅ Claude Code SÍ puede leer este plan al inicio de sesión para tener contexto, pero
> ejecuta solo el prompt puntual que se le da.

---

## OBJETIVO: 3 escenarios de lanzamiento

Definir el escenario cambia el alcance. Recomendación senior: **empezar por A**
(validar el diferenciador social/venue con usuarios reales antes de invertir en
comercio/POS que podrías ajustar según feedback).

| Escenario | Qué incluye | Estimado full-time | Con colchón 20-30% |
|---|---|---|---|
| **A — Social + venues** | App social, chat de venue, menús visibles, negocios gestionan sala/menú. SIN cobro a clientes finales. | ~25-33 d (5-7 sem) | **6-9 semanas** |
| **B — + Comercio real** | A + clientes pagan pedidos (checkout web/móvil, refunds). | ~32-44 d (6.5-9 sem) | **8-12 semanas** |
| **C — + POS operable** | B + un venue puede operar un turno con JChat (mesas, split, cash, refunds). | ~45-64 d (9-13 sem) | **12-17 semanas** |

---

## FASES (orden de ejecución)

> El legal y las cuentas (FASE 0) corren EN PARALELO desde el día 1 — no dependen de
> código, no deben ser el cuello de botella.

### FASE 0 — Paralelo desde día 1 (no bloquea código)
**Responsable: Juan (+ terceros)**
- [ ] Iniciar legal: ToS + Privacy Policy + EULA (con 18+, UGC cero-tolerancia,
      CCPA/GDPR básico). Abogado o Termly/iubenda. **Requisito de review Apple/Google.**
- [ ] Crear cuenta de Sentry (monitoring de crashes/errores).
- [ ] Reunir credenciales que harán falta (Apple Developer, Play Console activos).

### FASE 1 — Seguridad crítica  ·  ~3.5-5 d  ·  BLOQUEA TODO
**Responsable: Claude Code (prompts ya escritos) + 2 toggles de Juan**
- [x] **S1** — Lockdown `rooms.qr_token` + `password_hash` + RPC owner — `3172ae2`
- [x] **S2** — Revoke EXECUTE funciones — `af43587`
- [x] **S3** — `public_profiles` (se MANTIENE security_definer intencional + `is_private`) — `af43587`
- [x] **S6/S7** — menu-photos owner-scoped + stripe-events deny-all — `af43587`
- [x] **E1** — RLS initPlan wrap (6 policies SELECT) — `9a400cd`
- [ ] **S5** — *(Juan)* leaked-password protection — PENDIENTE (toggle de Juan)
- [ ] **S4** — Rate limiting: Supabase Auth nativo *(Juan)* + Upstash/Cloudflare *(Claude Code)* — DIFERIDO (no bloqueante para beta controlada; tracked)

> **Nota S3:** el linter marca `security_definer_view` como warning, pero se decidió
> MANTENER `public_profiles` como SECURITY DEFINER intencionalmente (es la compuerta de
> columnas públicas sobre `users`, cuya RLS es own-row only). Ver DECISIONS.md (D-15).

### FASE 2 — Bloqueantes de review de tiendas  ·  ~6.5-9 d
**Responsable: Claude Code + capabilities de Juan**
Web:
- [x] **W1** — Security headers + CSP (report-only, falta flip a enforce tras calibrar) — `1af2168`
- [x] **W2** — Fix open-redirect `//` — `89977e2`
- [x] **W3** — Reconciliar esquemas QR — YA reconciliado (sin commit; `/r/slug` ya no existía)
Móvil:
- [x] **M1** — Deep-link OAuth (scheme jchat:// + openAuthSessionAsync + setSession) — `34303ce` (+`f4ba64a`)
- [~] **M4** — Sign in with Apple: código listo (reusa `handleOAuth` de M1); FALTA capability en App Store Connect *(Juan)* + device test
- [x] **M6** — Borrado de cuenta in-app (Edge Function delete-account + Settings UI, hard delete) — `55eaa2d`
- [x] **M2** — Biometría real (LockScreen gate en cold start + toggle opt-in) — `c746796`
- [x] **M8** — Permiso ubicación "when in use" — `75dbfcf`
- [x] **M3** — Maps iOS = Apple Maps (decisión de producto; docs D-20) — `7051a34`
- [x] **M9** — OTA (runtimeVersion fingerprint + canales EAS Update) — `12fc1f7`

### FASE 3 — Que la app se sienta viva  ·  ~8.5-12 d
**Responsable: Claude Code + cuentas de infra de Juan**
- [ ] **M5** — Push server-side senders (Edge Function/triggers → Expo Push)
- [ ] Emails transaccionales (confirmación de orden, reset password)
- [ ] Cron jobs (grace de suscripción, expiry de trial, offer publish, reminders)
- [ ] **M7** — Verificar flujo reportar/bloquear en UI + documentar moderación 24h
- [ ] *(Juan)* Infra: Stripe live, Firebase FCM+APNs, Twilio, Google Maps prod,
      Vercel prod + dominio jchat.cloud, Sentry wiring

### FASE 4 — Verificación  ·  ~1-2 d
**Responsable: Juan prueba, Planning Claude audita**
- [ ] 4 pruebas manuales pendientes (social A+B, modificadores, DM gate, TTL)
- [ ] Smoke tests generales (auth, realtime, privacidad, RLS)
- [x] **E5** — migrar campos sort a bigint — `9a400cd`
- [ ] Load-test presence (venue simulado 200-500) *(recomendado)*

> **🎯 Fin de FASE 4 = LANZAMIENTO A listo.** (Beta social + venues.)

### FASE 5 — Comercio real  ·  ~7-11 d  ·  SOLO si vas a B o C
**Responsable: Claude Code + Stripe live de Juan**
- [ ] **W5** — Checkout web (menú+carrito+Stripe, atribución a usuario logueado)
- [ ] Refunds/disputes UI en dashboard (2 niveles del spec §9.3)
- [ ] Pruebas E2E de pagos (test + live, smoke §9 del DEPLOYMENT_CHECKLIST)

> **🎯 Fin de FASE 5 = LANZAMIENTO B listo.** (Clientes pagan.)

### FASE 6 — POS operable  ·  ~13-20 d  ·  SOLO si un venue opera con JChat
**Responsable: Claude Code**
- [ ] **POS-0** — walk-in orders (quitar `orders.user_id` NOT NULL)
- [ ] **POS-1** — `business_tables` + `tabs` + terminal UI mínima
- [ ] **POS-2** — cash / card-present / split / tips / refunds server-side
- [ ] **POS-3** — shifts + Z-close + 86-ing en vivo

> **🎯 Fin de FASE 6 = LANZAMIENTO C listo.** (Venue operable.)

### FASE PARALELA — Calidad (recomendado, cuando se pueda intercalar)
- [ ] **W6** — Tests de caminos críticos (webhook, montos, auth, RLS) — Vitest

---

## Checklist de tareas de JUAN (no-código) — para no perderlas

**Toggles Supabase:** leaked-password protection · rate limits de Auth ·
re-enable "Confirm email".
**Stripe:** enable Connect · crear Products/Prices ($1.99/$49/$99) · webhooks prod
(2 endpoints) · test cards antes de live.
**Google Cloud:** keys iOS+Android restringidas · Maps SDK iOS/Android · billing +
budget alerts.
**Firebase:** proyecto · google-services.json · APNs .p8 (¡se descarga una sola vez!)
· subir a EAS.
**Twilio:** número US · secrets.
**Apple:** App Store Connect app · Sign in with Apple capability · Apple Pay merchant
· usage strings · borrado de cuenta visible en review.
**Google Play:** app · signing · Google Pay.
**Vercel:** dominio jchat.cloud · Supabase redirect URLs.
**Legal:** ToS/Privacy/EULA publicados y enlazados en app + stores.
**Sentry:** cuenta + DSN.

---

## ⚠️ IMPORTANTE — ¿esto es TODO? ¿no falta mejorar nada?

Este plan cubre **lo necesario para lanzar seguro y con calidad**, NO "producto
terminado". Distinción clave:

**El plan SÍ garantiza:** app segura, pasa review de tiendas, no se cae, cobra bien,
se siente viva. Incluye las mejoras REALES que salieron de la auditoría (RLS
initPlan, security headers, biometría funcional, etc.).

**El plan deliberadamente DEJA fuera** (y está bien):
- Mejoras de producto que solo se saben **escuchando a usuarios reales**. Mejorar
  antes de tener usuarios = construir sobre suposiciones.
- Features "nice to have" del backlog (abajo).

**Filosofía senior: no se mejora en el vacío.** Lanzas lo sólido → ves qué usan los
usuarios → eso te dice qué mejorar.

---

## DESPUÉS DEL LANZAMIENTO (roadmap v3.1+, NO bloqueante)

Del BACKLOG.md, ordenado por probable valor post-lanzamiento:

**Escala (cuando crezcas):** denormalizar contadores (followers/likes por trigger) ·
feed server-side (RPC/fan-out) · heatmap iOS · presence throttling en venues grandes.

**Producto social:** reacciones a mensajes · reply/quote · typing indicator ·
editar/borrar mensajes propios · menciones @ · GIFs/stickers · mensajes de voz ·
stories/reels · saved posts.

**POS profundo (tier Pro):** floor plan · QR por mesa (scan-to-order) · recipe
costing · training mode · reportes CSV/PDF · centro de alertas por fases.

**Comercio:** PayPal · Google Pay · loyalty avanzado · analytics Pro · multi-location.

**Diferenciador a explotar (marketing):** el split-check por ítem que sabe **quién
pidió qué desde el chat** — nadie más (Toast/Square) puede hacerlo. Es tu foso.

**Descartado con razón (no reconsiderar sin motivo fuerte):** E2E en DMs (choca con
moderación) · ubicación en vivo compartida (regla #1) · llamadas voz/video (WebRTC
pesado) · offline mode (choca con arquitectura cloud-first).

---

## Estado de progreso (actualizar al cerrar cada tarea)

| Fase | Estado | SHAs |
|---|---|---|
| FASE 0 (legal/cuentas) | ⬜ no iniciado | — |
| FASE 1 (seguridad) | 🟨 en progreso | S1 3172ae2 · S2/S3/S6/S7 af43587 · E1/E5 9a400cd (falta S4/S5 de Juan) |
| FASE 2 (review tiendas) | 🟨 código completo (falta acción de Juan) | W1 1af2168 · W2 89977e2 · W3 (ya) · M1 34303ce · M2 c746796 · M6 55eaa2d · M8 75dbfcf · M3 7051a34 (docs) · M9 12fc1f7 — pendiente Juan: M4 capability/device, flip W1 enforce |
| FASE 3 (app viva) | ⬜ no iniciado | — |
| FASE 4 (verificación) | ⬜ no iniciado | — |
| FASE 5 (comercio) | ⬜ no iniciado | — |
| FASE 6 (POS) | ⬜ no iniciado | — |

Leyenda: ⬜ no iniciado · 🟨 en progreso · ✅ completo
