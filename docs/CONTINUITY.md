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

Last updated: 2026-07-11
