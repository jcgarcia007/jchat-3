# JChat 3.0 — Continuity Index

> New chat session? Start here. Tell Claude: "Estoy retomando JChat 3.0. Lee docs/CONTINUITY.md en jcgarcia007/jchat-3 y dame el estado."

This /docs/ folder is the durable knowledge base for JChat 3.0 so work continues across chat sessions without losing context (chats fill with images and must restart).

## Read these in order
1. PROJECT_STATUS.md — Where the project is right now, what's deployed, the prioritized plan. Read first when resuming.
2. SPEC.md — Product spec: flows, screens, business rules (converted from MASTER_SPEC.docx).
3. DESIGN_SYSTEM.md — Colors, themes, tokens, components (converted from DESIGN_SYSTEM.docx).
4. ARCHITECTURE.md — Reusable technical patterns (menu device-frame, chat scroll web/mobile, multi-presence, sub-chats, image viewer, iOS/Android fixes).
5. BACKLOG.md — Unified prioritized backlog (chat + POS + web Fase 3).
6. DECISIONS.md — Every significant technical/product decision and why.
7. PLAN_MAESTRO_SOCIAL.md — Social system design (Stage 1, Instagram-style): follow / private accounts, profile + privacy, posts + feed, DM gate. Audit of existing scaffolding + 4-module plan.
8. PROJECT_ORIGIN.md — Founding definitions: what JChat is, stack, markets, business model.
9. DEPLOYMENT_CHECKLIST.md — Launch runbook (10 phases).
10. design-references.md — Reference designs as SVG/HTML.
11. **PLAN_LANZAMIENTO.md — Hoja de ruta ACTIVA hacia el lanzamiento (fases 0-6, 3 escenarios A/B/C, quién hace qué).** Es el mapa de trabajo actual. Evidencia: los 3 informes de la auditoría senior 2026-07-09 — `AUDITORIA_SEGURIDAD_ESCALABILIDAD_2026.md`, `AUDITORIA_MOVIL_2026.md`, `AUDITORIA_WEB_POS_MAPA_2026.md` (prompts de remediación en `PROMPT_CLAUDE_CODE_seguridad.md`).

**Archived in `docs/archive/` (historical, read only if needed):** DEV_PLAN (68 tasks done),
the resolved chat diagnostics / inventories / designs, the two original backlogs,
WEB_CLIENT_PLAN, and the original `.docx` of every spec + the deployment guide.

## How Claude should resume a session
1. Read PROJECT_STATUS.md to load current state + next steps.
2. Skim DECISIONS.md so you don't re-litigate settled choices.
3. Use MCP tools (GitHub, Supabase klfsgcfoahdtkojyqspd, Vercel prj_sGiwIjcnfUbrdzuITqY7ikEMI9tI) to verify live state before acting.
4. Continue from "What's next" in PROJECT_STATUS.md.

## Working agreement (to keep chats long-lived)
- Prefer pasting text/errors over screenshots. Claude reads code directly from GitHub via MCP. Screenshots only for genuinely visual UI matters.
- Local repo: /Users/jcgarcia/Projects/JchatVer3.0 (NO space — has web/ + mobile/). If Claude Code lands in mobile/ and can't find web/, run: git rev-parse --show-toplevel and cd to root.
- Planning Claude (web/app): writes specs, audits every SHA via GitHub MCP, checks Vercel deploys. Its GitHub WRITE returns 403 → ALL commits via Claude Code CLI.
- Claude Code (CLI): implements, commits, migrates, builds (Supabase MCP + GitHub write + XcodeBuildMCP).
- With ignoreBuildErrors active, build won't catch type errors — run npx tsc --noEmit manually on touched files.
- Audit every Claude Code diff: it sometimes adds unrequested features (e.g. gift toggle) or drops safety nets (min-validation). Flag deviations.
- Keep this /docs/ set updated as milestones complete.

## Aprendizajes 2026-07-11 (device testing)
- **RN/Hermes upload:** `fetch(localUri).blob()` sube 0 bytes. Patrón correcto y único: `services/storage.ts uploadImage` (expo-file-system/legacy readAsStringAsync base64 → base64-arraybuffer decode → upload ArrayBuffer). Reusar SIEMPRE, no reimplementar.
- **Chat lee perfiles de otros desde `public_profiles`**, no de `users` (RLS own-row+admin bloquea joins). Cualquier campo nuevo que el chat necesite (nombre, avatar) se añade al batch select de public_profiles + al cache.
- **Presencia (usePresenceChannels) usa `user_metadata.avatar_url`**, no public.users. Los cambios de avatar deben sincronizar auth metadata (auth.updateUser) además de la tabla.
- **Divergencia web/móvil (patrón recurrente):** el móvil se queda atrás de features que la web ya migró. Casos vistos: (a) customizador de menú gateado por `options.sizes` viejo en vez de modifier groups (arreglado 6a0b055); (b) plantillas de menú que el móvil ignora (pendiente, D-27). Al tocar features de menú, revisar SIEMPRE paridad web/móvil.
- **Antes de confiar en un embedded count/join, verificar la RLS de la tabla embebida** (p. ej. menu_item_modifier_groups era public-read → el count funcionó). Un fallo de RLS da count 0 silencioso (mismo patrón que mordió con `users`).
- **Supabase Google provider:** requiere Web Client ID + su Client Secret (GOCSPX-) para el intercambio server-side. Vacío → "missing OAuth secret"; mismatch → "Unable to exchange external code".
- **Las órdenes las crea el SERVIDOR, no el móvil.** Cadena real: móvil → EF `payments` → metadata del PaymentIntent → Stripe cobra → EF `stripe-webhook` → INSERT en `orders` (service_role; migración 033 prohíbe insert desde el cliente). Cualquier campo nuevo de orden debe atravesar: migración + móvil + `services/stripe` + EF payments (metadata) + EF stripe-webhook (insert) + REDESPLIEGUE de ambas EF.
- **Supabase Realtime:** `supabase.channel(topic)` devuelve el canal EXISTENTE si el topic se repite, y `.on()` sobre un canal ya suscrito LANZA. `removeChannel` es async → un remonte rápido reutiliza el viejo. postgres_changes → topic único. Presencia → topic compartido obligatorio + purgar/AWAITar el stale.
- **Stripe idempotency:** la clave debe ser única POR INTENTO. Derivarla del carrito (user+business+total+items) rompe los pedidos repetidos idénticos.
- **Edge Functions:** tras `supabase secrets set` hay que REDESPLEGAR para que las tomen. Los logs de EF vía MCP van con retraso y solo muestran la línea HTTP; el Dashboard de Supabase muestra el cuerpo del error completo (fue la única vía para ver el StripeIdempotencyError).
- **P0-2 / P0-3 parecen YA RESUELTOS** (ver PENDIENTES): la EF `payments` recalcula todos los montos desde la BD e ignora los del cliente (solo acepta `tip_cents`, validado y capado), y verifica el JWT ignorando `body.user_id`. Evidencia en datos: impuesto = 8% exacto sobre el subtotal calculado por el servidor. FALTA auditoría formal + actualizar el estado en los docs.
- **La metadata de Stripe NO sirve como almacén del carrito.** Límite de 500 chars por valor. Cualquier dato de pedido que crezca (modificadores, notas) debe ir a una tabla de la BD keyed por el PaymentIntent, no a la metadata. Fallo silencioso si se ignora: orden creada sin ítems (el webhook no puede parsear el JSON truncado).
- **Patrón de dinero:** el cliente envía IDs y ETIQUETAS; el servidor resuelve TODOS los precios desde la BD. Aplica igual a sizes/extras (legacy, `menu_items.options`) y a los modifier groups (`modifier_groups.choices`).
- **Un fix de dinero puede destapar otro fallo:** al añadir modificadores al payload se descubrió el desbordamiento de metadata. Antes de cambiar la ruta de pagos, verificar también los LÍMITES de lo que se transporta, no solo el cálculo.
- **Proteger el total no basta: hay que proteger los ÍTEMS.** La EF recalculaba el total correctamente (P0-2), pero una política de RLS permitía al cliente insertar `order_items` extra en su orden ya pagada → la cocina los prepararía gratis. Al auditar la ruta de dinero, revisar TODAS las tablas que el cliente puede escribir, no solo el cálculo.
- **P0-2 y P0-3 estaban resueltos en el código desde 2026-06-24 pero los docs seguían listándolos como bloqueantes.** Auditar el código antes de asumir que un pendiente sigue abierto.
- **CORS en Edge Functions:** supabase-js SIEMPRE envía `apikey` + `x-client-info`. Si `Access-Control-Allow-Headers` no los permite, el navegador bloquea el POST tras un preflight exitoso (en los logs solo se ve `OPTIONS 204`, ningún POST). Las apps NATIVAS no aplican CORS → un bug de CORS solo se manifiesta en web. Set correcto: `"authorization, x-client-info, apikey, content-type"`.
- **Bugs invisibles para el super_admin:** la RLS de `users` es `fila propia + is_platform_admin()`. Juan (super_admin) VE los nombres que un usuario normal NO ve. Al probar features de lectura de perfiles ajenos, hay que probar con una cuenta NORMAL (test1), no con la de admin.
- **El dashboard asume 1 negocio por dueño** (`.maybeSingle()` sobre `owner_id`) → ERROR con múltiples negocios. Juan tiene 5; el plan Pro permite 10. `payments` ya está arreglado con selector; **`billing/page.tsx` SIGUE ROTO** (ver PENDIENTES).
- **Anonymous sign-in de Supabase:** el trigger `handle_new_auth_user` NO se rompe (la función `derive_username` cae al fallback 'user'), PERO el bucle de dedupe es SECUENCIAL (una query por intento: user1, user2, user3…) → O(n) queries por registro cuando los invitados se acumulan. Para invitados hay que derivar el username del UUID (único por construcción). **Supabase NO ofrece limpieza automática de usuarios anónimos** → hay que construirla.
- **El riesgo de abuso NO lo crea el checkout de invitado.** El endpoint `/auth/v1/signup` YA es público (la anon key está en el bundle JS). Un atacante puede crear usuarios basura HOY, sin pagar ni pasar por el menú. El CAPTCHA protege TODO el auth, no solo la feature nueva.
- **El CAPTCHA de Supabase es GLOBAL** (registro, login, reset). Activarlo SIN implementarlo en el móvil ROMPERÍA el login de la app ("Captcha verification failed"). No hay forma de proteger solo un endpoint: envolver el registro en una Edge Function propia NO sirve, porque el atacante llama a Supabase directamente.

## Aprendizajes 2026-07-22 (rediseño checkout invitado + captcha)
- **El secreto de hCaptcha vive en DOS sitios de Supabase, independientes (D-65):** Edge
  Functions→Secrets→`HCAPTCHA_SECRET` (lo usa `guest-pay`) y Authentication→Attack
  Protection→CAPTCHA→secret (lo usa el login con contraseña). Cambiar uno no cambia el otro.
  Síntomas al desincronizarse: `guest-pay` 403 (pago) y/o `sitekey-secret-mismatch` en
  `POST /token grant_type=password` (login). Los logins OTP/magic-link no llevan captcha → dan
  200 aunque el de contraseña esté roto (despista al diagnosticar).
- **Los logs correctos para cada fallo del captcha:** el pago de invitado se depura con los logs
  de **Edge Functions** de Supabase (`guest-pay` POST 200/403), NO con los de Vercel — `guest-pay`
  corre en Supabase, no en Vercel. El login se depura con los logs de **Auth** de Supabase
  (`get_logs service=auth`), donde sale el `error_code=captcha_failed` y el mensaje exacto.
- **Tras cambiar `HCAPTCHA_SECRET` en Edge Functions, REDESPLEGAR** (`supabase functions deploy
  guest-pay`) para que la instancia caliente lo tome; el secreto de Authentication aplica al
  Guardar (sin deploy). Mismo patrón que el ya anotado de "REDESPLEGAR tras secrets set".
- **El captcha invisible del pago de invitado se dispara al montar la pantalla, no tras click**
  (D-66) → hay que esperar al `onLoad` del widget antes de `execute()`, o el primer intento falla
  en falso y solo "Reintentar" funciona. Componente compartido con el login (que sí es tras click),
  el fix es retrocompatible.
- **La integración Supabase↔Vercel duplica variables de entorno con nombres nuevos** (crea
  `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `POSTGRES_*`, `SUPABASE_JWT_SECRET`) SIN sobrescribir las que ya usa el código
  (`NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). No rompe nada mientras el
  código no lea los nombres nuevos, pero deja dos juegos de credenciales → deuda silenciosa. Antes
  de asumir daño, verificar a qué proyecto apunta la `SUPABASE_URL` nueva (aquí seguía siendo
  klfsgcfoahdtkojyqspd).

## Aprendizajes 2026-07-22 (códigos promocionales + tipos)
- **Sistema de códigos promocionales (migración 086 + página super-admin 2a/2b, D-67):** un código
  de 12 chars por usuario, un solo uso, OTORGA plan de prueba (Pro/Business); solo 'regular' canjea.
  RPCs `create_promo_code` / `redeem_promo_code`. Verificado end-to-end. FALTA la pantalla donde el
  usuario escribe el código para canjear (móvil/web) — el RPC existe, falta la UI. El "mes gratis" y
  los afiliados son tandas futuras.
- **Regenerar `database.types.ts` es parte de TODA migración de schema (D-68):** no se regenera solo;
  llevaba 4+ migraciones sin sincronizar. Sin regenerar, el cliente tipado rechaza la tabla/RPC nuevos
  y `tsc` falla.
- **Los tipos generados pueden ser MÁS estrictos que la BD (D-68):** no ven triggers (columnas que
  parecen requeridas pero las llena la BD, ej. `tables.qr_token`) ni la nulabilidad de args de un RPC
  (ej. `attach_order_to_tab(p_tab_id)` acepta null). Al fallar `tsc` tras regenerar, LEER la migración
  antes de tocar el runtime — el fix es de TIPO, no de valor, o metes un bug.
- **Las migraciones de este repo se aplican por MCP `apply_migration`, NO por `supabase db push`:** el
  tracking de la CLI está desincronizado (archivos numéricos `085` vs versiones timestamp en
  `schema_migrations`), así que `db push` intentaría re-aplicar 001–085. Aplicar por MCP y luego
  guardar el archivo `.sql` en git (fuente de verdad).

Last updated: 2026-07-22
