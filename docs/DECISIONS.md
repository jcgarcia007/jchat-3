# JChat 3.0 — Decision Journal

Why we did what we did. Read before reversing a choice.

Last updated: 2026-07-22

## Maps

### D-01 — Keep Google Maps on mobile (not native Apple/Google split)
Decision: Use Google Maps (PROVIDER_GOOGLE) on both iOS and Android.
Why: The custom pastel and dark map styles (customMapStyle) are Google-Maps-only — Apple Maps doesn't support custom styling. We nearly switched to native maps to escape the iOS blank-map bug, but once the real root cause was fixed (D-02) Google Maps worked, so we kept it and preserved the brand styling.
Consequence: Heat-map gradient overlays remain possible later (Google-only feature).
> ⚠️ ACTUALIZADO 2026-07-10 (D-20): esta decisión se revirtió para iOS — iOS ahora usa Apple Maps (sin estilo custom). Android mantiene Google Maps con customMapStyle. Ver D-20.

### D-02 — react-native-maps plugin MUST use the array form
Decision: Always declare ['react-native-maps', { iosGoogleMapsApiKey }], never the bare string 'react-native-maps'.
Why: The bare string makes the config plugin run Apple-Maps-only — it omits the Google Maps pod and strips GMSServices.provideAPIKey() from AppDelegate, causing a silent blank map on iOS. This cost a multi-hour debugging session; the key was never the problem.
> ⚠️ ACTUALIZADO 2026-07-10 (D-20): la premisa (forzar Google Maps en iOS vía array-form) ya no aplica en iOS — iOS usa Apple Maps. El array-form del plugin sigue siendo relevante solo para la key de Android. Ver D-20.

### D-03 — Platform-specific Maps API keys
Decision: Split into GOOGLE_MAPS_KEY_IOS and GOOGLE_MAPS_KEY_ANDROID (separate GCP-restricted keys), set in EAS as sensitive for prod+dev.
Why: Correct security posture (each key restricted to its platform/bundle/SHA). Also create EAS env vars BEFORE building — a build run before the vars existed picked up empty keys.

### D-04 — Heat zones deferred; if ever needed, circles not gradient
Decision: No heat zones for now; the Nearby tab already surfaces activity. If added later, prefer colored Circle overlays over a true Heatmap.
Why: Heatmap (gradient) is Google-Maps-only and buggy on iOS even via Google (AIRMapHeatmap not found errors). Circle/Polygon work on both providers, are tappable (enter chat), and map cleanly to each venue's geofence (point + radius) — discrete circles represent bounded geofences better than a diffuse gradient.

### D-20 — iOS usa Apple Maps (revierte la premisa de D-01/D-02 para iOS)
Decision: En iOS el mapa es **Apple Maps** (provider nativo por defecto de react-native-maps en iOS), NO Google Maps. Android sigue con Google Maps (PROVIDER_GOOGLE) y su customMapStyle pastel/dark. Decisión de producto 2026-07-10 (M3).
Why: Apple Maps es nativo, no requiere key adicional ni el pod de Google Maps en iOS, y evita la fricción de mantener GMSServices/keys iOS. El costo aceptado es que el estilo custom pastel/dark (customMapStyle) NO aplica en iOS — Apple Maps no soporta estilos custom. Se prioriza simplicidad e integración nativa sobre consistencia visual cross-platform del mapa.
Consequence: El mapa en iOS se ve con el estilo nativo de Apple (sin la paleta de marca); Android conserva el estilo custom. Esto REVIERTE para iOS la premisa de D-01 (que mantenía Google en ambos por el estilo) y hace que el problema que motivó D-02 (array-form del plugin para forzar Google en iOS) ya NO aplique en iOS — el config actual usa Apple Maps en iOS intencionalmente. D-03 (keys por plataforma) sigue vigente solo para la key de Android. D-04 (heat zones diferidas) sin cambios.

## Web map editor

### D-05 — Native google.maps drawing, not terra-draw / AdvancedMarker
Decision: Use native google.maps.Marker/Circle/Polygon via useMap(); removed terra-draw + adapter + AdvancedMarker.
Why: terra-draw's adapter cleanup and AdvancedMarker (invalid mapId) threw "Cannot read properties of undefined (reading remove)" under React StrictMode double-effect.

### D-06 — Uncontrolled map center for drag/pan
Decision: Use defaultCenter + imperative recenter (panTo/setZoom on load/search only), not a controlled center prop.
Why: A controlled center without an onCenterChanged handler snaps the map back and blocks panning.

### D-13 — Radio de geofence de negocio = 50 m (canónico), enforced server-side
Decision: El radio máximo de geofence de un negocio es 50 m. Radios mayores solo con radius_increase_requests aprobado por un platform admin.
Why: Decisión de producto de la sesión de diseño 2026-06-24. El código tenía 100 m (UI) y default 200 m (columna). Se unificó a 50 m. Para honrar la regla de oro de geo ("el servidor decide, nunca el cliente"), el cap se hace cumplir con un trigger en la BD (migración 021), no solo en la UI: permite >50 m únicamente si existe un request aprobado que cubra el valor, o si lo escribe un platform admin.
Consequence: businesses.geofence_radius_m default pasó de 200 a 50. LocationEditor BUSINESS_RADIUS_CAP pasó de 100 a 50. EVENT_RADIUS_CAP (1609 m) sin cambios.

## Chat

### D-07 — Presence = Supabase Realtime Presence (not check_ins)
Decision: The chat "who's here now" bar uses Supabase Realtime Presence, not the check_ins table.
Why: Presence reflects who has the room open right now (live join/leave) — the right semantic for a proximity chat. No new table. Critical impl detail: track() must run inside the .subscribe() callback gated on status==='SUBSCRIBED', else it fails silently; use config.presence.key=user.id for per-user dedup.

### D-08 — Menu icon gated by owner approval (businesses.menu_enabled)
Decision: The in-chat menu icon shows only when the business owner enables it via a dashboard toggle; default false.
Why: Owners control whether their venue exposes a menu/ordering surface in chat. The mobile menu reuses the existing Menu route (full POS flow, Task 3.2) — no separate read-only screen.

### D-09 — Chat work split into small tandas
Decision: Implement chat fixes in small, independently-testable batches (Tanda 1 quick wins -> Tanda 2 DM -> Tanda 3 profile/extras) rather than one big change.
Why: Easier to verify each piece; avoids a Claude Code rewrite touching everything at once. Mirrors the diagnose->fix->verify loop that resolved the maps issue.

### D-10 — TODO(schema) comments are obsolete; verify DB before building
Decision: Trust the live DB over code comments. Tables blocks, reports, follows, dm_conversations, dm_messages already exist with RLS.
Why: Audit (from code comments) claimed these were missing; direct Supabase MCP queries proved them present with policies. Always verify schema via MCP before assuming a table is missing.

### D-13 — Social system (Stage 1) — Instagram model (confirmed 2026-07-08)
Decision: Follow is UNIDIRECTIONAL; accounts are PUBLIC by default (18+). Private accounts use the existing `follow_requests` table (pending → accept/reject); `follows` stays = accepted edges only (no `status` column, preserves existing data). DM is gated by the receiver's `whoCanDMMe` setting (Everyone / Followers only = "my followers can DM me" / Nobody). Unfollow does NOT delete DMs; blocking is SOFT-HIDE (hides but keeps history, reappears on unblock). Posts get a separate permanent bucket `profile-media` (chat stays ephemeral on `post-media`, 24h TTL); DM photos go to a private `dm-media` bucket. No per-post `visibility` in v1 (global `whoSeesMyPosts` only). Follower/following counts via count-queries in v1 (denormalization deferred). Profile tabs v1: Posts / Places / Gifts / Saved (Stories/Reels hidden until their phase).
Why: The social layer was ~70% scaffolded but unenforced — the work is applying privacy in RLS + wiring the pending/DM/block flows, not rebuilding. Reuses `follow_requests`/`blocks`/`posts`/`comments` that already exist. Full audit + 4-module plan + phased order in `docs/PLAN_MAESTRO_SOCIAL.md`.

### D-14 — Chat TTL purge = pure pg_cron; photo GC deferred (confirmed 2026-07-08)
Decision: Room messages are purged 24h after their own created_at by a pure-SQL `pg_cron` job (`purge_expired_messages()` every 15 min) — NOT an Edge Function / pg_net. Pinned messages (`pinned_messages`) are EXCLUDED and survive; `reply_to` is ON DELETE SET NULL so replies survive. Photo binaries are NOT deleted for now (Option C): Supabase blocks direct `DELETE FROM storage.objects` (the `storage.protect_delete` trigger → "Use the Storage API instead"), so the function wraps that delete in an EXCEPTION block (logs + continues) and only purges message rows. Orphaned `post-media` binaries (unreferenced, unguessable path, bucket exclusive to ephemeral chat) remain until a future Storage-API GC.
Why: pg_cron keeps it server-side and dependency-free per the design. Bypassing the protect_delete guard (e.g. `session_replication_role='replica'`) works but deliberately circumvents a Supabase safety mechanism — not worth it for orphaned binaries that pose no privacy/correctness issue. The core value (messages disappear at 24h) ships now; photo GC is a storage-cost cleanup to revisit. Migration 043; design in `docs/DIAGNOSTICO_TTL_CHAT.md`.

## Process

### D-11 — Documentation set for cross-session continuity
Decision: Maintain this /docs/ set; resume new chats by reading docs/CONTINUITY.md.
Why: Chats fill with images (100-image cap) and must restart. The docs preserve state, decisions, origin, and design references so a fresh session continues seamlessly.

### D-12 — Prefer text/MCP over screenshots
Decision: Paste text/errors; let Claude read code via GitHub MCP. Screenshots only for genuine visual UI matters.
Why: Screenshots consume the image budget fast and shorten chat lifespan; MCP gives Claude direct, current source access.

## Security & Store-review (Sesión 2026-07-10)

### D-15 — public_profiles se mantiene SECURITY DEFINER (no invoker)
Decision: La vista `public_profiles` sigue siendo SECURITY DEFINER; NO se aplica `security_invoker=on` (contra la sugerencia del linter S3).
Why: La RLS de `users` es own-row + admin. La vista existe PARA exponer un subset público de columnas saltándose esa RLS — es el mecanismo de exposición pública controlada, no un bug. `security_invoker` rompería ver perfiles ajenos en toda la app. Se mantiene DEFINER, expone solo columnas públicas (nunca `city`/`privacy_settings`/`push_token`/`stripe`/`role`/`plan`) y se añadió `is_private` para el gate de privacidad del cliente.
Consequence: El warning `security_definer_view` del linter queda ACEPTADO intencionalmente. Commit `af43587`.

### D-16 — Borrado de cuenta = hard delete vía Edge Function (M6)
Decision: Borrado in-app con **hard delete** (no soft-delete ni anonimización), vía Edge Function `delete-account`.
Why: Apple 5.1.1(v) + Google exigen borrado in-app. La función extrae `user_id` del JWT (nunca del body — patrón P0-3), limpia `radius_increase_requests` (FKs NO ACTION que bloquearían el cascade) y llama `admin.deleteUser` → cascade de `auth.users` → `public.users` + todo el contenido personal. Las columnas SET NULL se anonimizan solas.
Consequence: Se eliminó el stub falso previo de "24h grace period". Commit `55eaa2d`.

### D-17 — Biometría = gate de lock en cold start, opt-in (M2)
Decision: La biometría es un GATE de bloqueo, no un mecanismo de restauración de sesión. Opt-in vía toggle en Settings.
Why: La sesión de Supabase ya persiste (AsyncStorage). La biometría NO restaura sesión; bloquea la entrada aunque la sesión sea válida (patrón banca). Se activa solo en **cold start** (nunca en `onAuthStateChange` ni al volver de background — un login fresco no queda bloqueado), con guard de `canUseBiometrics`. Sin passcode fallback propio: si Face ID falla, retry o signOut.
Consequence: `LockScreen` renderizado por `AppNavigator` cuando `isAuthenticated && locked`. Commit `c746796`.

### D-18 — OAuth deep-link con jchat:// scheme (M1)
Decision: OAuth móvil vía `signInWithOAuth({ redirectTo: Linking.createURL('auth/callback'), skipBrowserRedirect: true })` + `openAuthSessionAsync` para capturar el retorno.
Why: Sin handler del redirect el usuario nunca volvía autenticado. Se maneja implicit flow (fragment → `setSession`) y PKCE (`?code` → `exchangeCodeForSession`). Se usa `Linking.parse` para el scheme custom (`new URL` no es fiable en RN). `detectSessionInUrl:false` ya estaba.
Consequence: Requiere build EAS dev-client para probar (no funciona en Expo Go, que usa `exp://`). Commits `34303ce` (+`f4ba64a`).

### D-19 — CSP arranca en Report-Only (W1)
Decision: `next.config.ts` pasó de `{}` a `headers` con CSP calibrada; arranca en `Content-Security-Policy-Report-Only`.
Why: Report-Only permite calibrar (Supabase/Stripe/Maps allowlist) sin romper la app. Google Fonts se omitió del allowlist porque `next/font` auto-hospeda. Stripe pre-provisionado para W5.
Consequence: Flip a enforce (1 línea) tras verificar la consola sin violaciones legítimas. Commit `1af2168`.

## Device testing (Sesión 2026-07-11)

### D-21 — Username OAuth derivado del email/nombre
Al registrarse por OAuth, el trigger 048 deriva el username del email local-part (o nombre de Google), sanitizado a [a-z0-9_], 3-30 chars, dedupe con sufijo. Editable después. (Ref: migración 048, 3eef6e2.)

### D-22 — Botón Face ID del login: opt-in
El botón "Use Face ID / Touch ID" en LoginScreen solo aparece si el usuario activó el lock biométrico (flag @jchat/biometric_enabled). Sin sesión guardada, biometría no puede crear sesión → se ocultaba el callejón sin salida. (Ref: 2b31f27.)

### D-23 — Prompt de enrolamiento biométrico post-login
Tras el primer login exitoso (cualquier método), si hay hardware y no está activado ni preguntado, se ofrece activar el lock (una sola vez). Combina con el toggle de Ajustes. Sigue mejores prácticas (ofrecer post-login, opt-in de un toque, texto adaptativo). (Ref: 2b31f27.)

### D-24 — Quick card de usuario por tap
Tap (no long-press) en avatar/nombre —tanto en mensajes como en la fila de presencia— abre una tarjeta compacta anclada, fondo opaco. Reemplaza el long-press. El UserActionSheet grande se conserva como destino de "Silenciar" (duración de mute) y moderación de dueño, vía onOpenFull. (Ref: f807355, c73844f, d93f164.)

### D-25 — Fuente de avatar por superficie
Perfil y chat-mensajes leen avatar de `public.users`/`public_profiles`. La fila de presencia lee de `user_metadata.avatar_url`. Por eso EditProfileScreen sincroniza AMBOS al guardar (tabla users + auth.updateUser). (Ref: 3aa9e38, 7bcc661.)

### D-26 — Native sign-in DIFERIDO
Apple/Google nativos (expo-apple-authentication + @react-native-google-signin) eliminarían el diálogo "supabase.co", pero requieren build nativo y reabren el código de auth recién estabilizado. Diferido a una tanda dedicada.

### D-27 — Plantillas de menú en móvil: PENDIENTE (se implementará)
`businesses.menu_template_id` (ej. 'icon-rail') hoy solo lo respeta la web; el móvil tiene un layout fijo (MenuScreen ignora el campo). DECISIÓN: el móvil DEBE respetar la misma plantilla que la web. Es la próxima tanda grande — requiere mapear las plantillas web y replicarlas como layouts nativos. Diagnóstico hecho; implementación pendiente.

### D-28 — Tipo de pedido: 'table' por defecto, 'gift' oculto
El carrito abre con Mesa seleccionada. La card de Regalo se oculta (coherente con diferir features de regalo hasta cerrar los temas de pago). El type 'gift' y el gift picker se conservan inertes. (Ref: 88a8589.)

### D-29 — `table_label` OBLIGATORIO en pedidos a mesa
En la web el campo "Mesa" es opcional (pero eso vive en el sheet de LLAMAR AL MESERO → `service_calls.table_label`, no en el pedido). Para un PEDIDO, la mesa es obligatoria: sin ella el pedido no se puede entregar. Texto libre (máx 40): "5", "barra", "terraza". (Ref: 1eee04d, migración 049.)

### D-30 — Topics de realtime
Los canales de `postgres_changes` usan topic ÚNICO por suscripción (el `filter` hace el scoping). Los canales de PRESENCIA deben mantener el topic COMPARTIDO (`presence:${roomId}`) o los usuarios dejan de verse → ahí el fix es purgar+AWAITar el canal stale antes de resuscribir. (Ref: c8e0836, 0b593ad.)

### D-31 — Clave de idempotencia por INTENTO, no por carrito
La clave la genera el cliente en cada intento de pago; el servidor la valida y la namespacea con el usuario del JWT. Una clave derivada del carrito bloquea pedidos idénticos repetidos. (Ref: e1e02aa.)

### D-32 — El carrito de un PaymentIntent vive en la BD, no en la metadata de Stripe
La metadata de Stripe capa los valores a 500 chars; con modificadores el carrito desborda y el webhook no puede parsearlo (orden sin ítems, en silencio). El carrito RESUELTO POR EL SERVIDOR (precios de BD + etiquetas verificadas) se guarda en `pending_order_carts` (service_role only) y el webhook lo lee de ahí. La metadata se sigue escribiendo como fallback para PIs viejos y para depurar. (Ref: 4ea3d00, migración 050.)

### D-33 — Los precios de modificadores SIEMPRE se resuelven en el servidor
El cliente solo envía ids de grupo + etiquetas de choice. La EF los precia desde `modifier_groups.choices` en la BD y rechaza grupos no vinculados al ítem o etiquetas inexistentes. Ningún precio del cliente se usa jamás. (Ref: 4ea3d00.)

### D-34 — El cliente NUNCA escribe en orders ni order_items
Ambas tablas las escribe solo el `stripe-webhook` con service_role (salta RLS). `orders` ya no tenía política de INSERT (033); `order_items` la tenía y se eliminó (051) porque permitía a un cliente añadir ítems no pagados a su propia orden. El cliente solo LEE. (Ref: migraciones 033, 051.)

### D-35 — MODELO DE INGRESOS: suscripción, NO comisión
`PLATFORM_FEE_PERCENT = 2.9` + `FIXED_CENTS = 30` — que es EXACTAMENTE lo que cobra Stripe → el procesamiento es NEUTRO (Juan no gana ni pierde en los pagos). Los ingresos vienen de las suscripciones ($49 Business / $99 Pro).
JUSTIFICACIÓN DE MERCADO (investigado): JChat NO es delivery (DoorDash/Uber Eats: 15-30%). Es pedidos EN EL LOCAL (QR/mesa), donde el estándar es SUSCRIPCIÓN + 0% comisión: Choice QR (40€/mes, 0%), Jamezz (50-300€/mes), UpMenu ($49), Menu Tiger ($17-119), Sunday ($49-299), ChowNow (suscripción + 0%, procesamiento estándar). Los restaurantes tienen márgenes netos del 3-5% → una comisión les duele mucho. VENTAJA COMPETITIVA: poder vender **"0% de comisión"** con verdad. Si algún día se quiere ingreso por volumen: subir a 4-5%, o crear un plan sin suscripción con comisión para negocios pequeños.

### D-36 — Cada negocio/evento tiene SU PROPIA cuenta de Stripe
`stripe_account_id` vive en `businesses` → web y móvil comparten automáticamente la cuenta del mismo negocio. Los eventos hoy se modelan COMO negocios (Juan ya tiene "caminata" y "Correr 5K" en `businesses`). Cuando exista la tabla `events`, necesitará su propio `stripe_account_id`.

### D-37 — Checkout de invitado en el menú web (PENDIENTE DE IMPLEMENTAR)
Decisión de producto tomada: el invitado paga SIN registrarse (Supabase anonymous sign-in), y se le piden email O teléfono (OPCIONALES) para enviarle el recibo y poder gestionar reembolsos. Si los deja en blanco, se le avisa amablemente de que no podrá recibir recibo ni solicitar reembolso, y se procede igual. El contacto va en la ORDEN (no en la cuenta).

### D-38 — CAPTCHA: hCaptcha (NO Turnstile)
Turnstile NO tiene SDK oficial de React Native (el paquete comunitario `react-native-turnstile` enruta por un dominio de un TERCERO, `turnstile.1337707.xyz` → inaceptable en una app de pagos). hCaptcha SÍ tiene SDK oficial: `@hcaptcha/react-native-hcaptcha` (hCaptcha Team, MIT, iOS+Android, por defecto en modo INVISIBLE) y `@hcaptcha/react-hcaptcha` para web. Supabase soporta ambos.

### D-39 — NO usar rate limiting como defensa principal
El límite de Supabase para registros anónimos es de **30/hora POR IP**. En un bar, TODOS los clientes comparten el WiFi = MISMA IP → con más de 30 clientes nuevos/hora, el cliente 31 NO PODRÍA PEDIR. El rate limiting ROMPERÍA el negocio en hora punta. Subirlo alto (300/h) solo como tope de emergencia. La defensa real es el CAPTCHA (distingue humano/robot, no cuenta peticiones).

## Seguridad y operación (Sesión 2026-07-12)

### D-40 — La verificación de un negocio NO la controla el negocio
Solo un super_admin verifica negocios (/super-admin/verification), vía el RPC único
`admin_set_business_status(uuid,text)` gateado con `is_platform_admin()`, con
trazabilidad en `businesses.verified_by` / `verified_at`. `/api/verify` ya no toca
`businesses.status`.

### D-41 — RLS: negar EXPLÍCITAMENTE (deny_all), no por ausencia de políticas
Una tabla sin políticas "funciona" como denegada hoy, pero una política añadida
después abre acceso sin que nadie lo note. Toda tabla service_role-only lleva una
política deny_all explícita (patrón aplicado en pending_order_carts).

### D-42 — Los límites de plan se aplican en el SERVIDOR
Cualquier límite (empleados, negocios/eventos por plan) validado solo en el cliente
es decorativo. La validación autoritativa vive en BD/Edge Functions.

### D-43 — Los cambios de riesgo van por RAMA con preview
`main` auto-despliega a PRODUCCIÓN en Vercel — un push ES un deploy. CSP, headers,
auth y pagos se prueban en branch preview antes de merge. (Aprendido con la CSP.)

### D-44 — La secret key de hCaptcha vive SOLO en Supabase
Attack Protection guarda el secret; el sitekey (público) va en los clientes. Nunca
en el repo ni en Vercel env.

### D-45 — `tsc --noEmit` en 0 NO garantiza que el bundle corra
El type-check no cubre errores de runtime del bundler (bug de prop-types). Todo
cambio de UI requiere smoke test en el entorno real además del tsc.

### D-46 — Un kill-switch silencioso necesita una prueba que lo haga visible
Todo gate que degrada en silencio (p. ej. el de Twilio en /api/verify) debe tener
una verificación que demuestre en qué estado está, o se pudre sin que nadie lo vea.

### D-47 — Las Edge Functions corren en Deno y NO pasan por el tsc de la web
Nadie comprobó que las columnas que escribe el webhook existieran → el bug de
contact_email costó "dinero cobrado sin pedido" (migración 059 lo cerró). Toda EF
que escriba en la BD se verifica columna por columna contra el esquema REAL
(information_schema), no contra los types generados.

## Stripe — auditoría de mejores prácticas (2026-07-12)

### D-48 — Connect se queda en Accounts v1 (Express) con TECHO de migración
Decision: se lanza con cuentas v1 `type: "express"` (flujo verificado end-to-end con
dinero en test). La guía actual de Stripe pide Accounts v2 (`/v2/core/accounts`)
para plataformas nuevas; migrar requiere subir el SDK (stripe@16.2.0 no tiene el
namespace v2), reescribir create_connect_account y el manejo de account.updated.
TECHO: revisar y ejecutar la migración a Accounts v2 ANTES de superar ~10 negocios
conectados reales — con 1 cuenta de test es trivial, con 50 negocios es un proyecto.
Why: no se reabre un flujo de dinero verificado justo antes de lanzar; v1/Express
sigue soportado indefinidamente para plataformas existentes.
Riesgo aceptado conscientemente (ligado a D-35): con destination charges +
on_behalf_of, la PLATAFORMA responde por reembolsos y contracargos, y el fee de
plataforma es neutro (= costo de Stripe) → cada disputa perdida cuesta el monto +
~$15 sin margen de procesamiento que lo amortigüe. Las suscripciones ($49/$99)
actúan como prima de ese riesgo. Vigilar la tasa de disputas en super-admin; las
palancas si duele: subir el fee a 4-5% o evaluar direct charges.

### D-49 — El upgrade de versión de API de Stripe es tanda propia, NUNCA junto al pase a live
Decision: se lanza a live con la versión pinneada actual (`2024-06-20`, verificada).
El upgrade a la última (`2026-06-24.dahlia` hoy) se hace DESPUÉS, como tanda
dedicada: subir stripe@16.2.0 → SDK actual, cambiar apiVersion en las EF, revisar el
changelog entre versiones (webhooks y Connect especialmente), probar en test y
redesplegar las 4 EF. ACOPLE ESCONDIDO: el apiVersion de ephemeralKeys.create debe
seguir siendo compatible con lo que exija @stripe/stripe-react-native — ese pin y la
versión del SDK móvil se actualizan JUNTOS.
Why: pase a live y upgrade de API son dos variables de riesgo que no se mueven a la
vez; pinnear la versión fue lo que mantuvo todo estable dos años.

## Storage hardening (Sesión 2026-07-13)

### D-50 — El purge de media en Storage NO se puede hacer con pg_cron de SQL puro
Constraint técnico, no decisión de producto. Supabase BLOQUEA
`DELETE FROM storage.objects` (trigger `storage.protect_delete` → "Use the Storage
API instead"), como ya documentó D-14 con el purge de fotos de chat. Un pg_cron de SQL
borraría (si acaso) la fila y dejaría el binario huérfano. Cualquier purga/TTL de media
(chat, voice-notes, lo que venga) exige Storage API desde una Edge Function con
service_role, con su verificación propia (D-47).
PENDIENTE DE DECISIÓN (no decidido por nadie todavía): si las notas de voz de DMs
tienen TTL, cuál es, y desde cuándo cuenta. La feature no existe aún (0 refs en el
código, bucket vacío), así que no hay nada que purgar hoy.
Contexto: migración 061 dejó voice-notes privado (public=false), 5 MB, MIME allow-list
de audio, upload/read con path por owner.

## Linter de seguridad (Sesión 2026-07-13)

### D-51 — `public_profiles` es SECURITY DEFINER A PROPÓSITO; el ERROR del linter se acepta
Decision: la vista `public.public_profiles` se queda con SECURITY DEFINER. El linter de
seguridad de Supabase la marca como ERROR ("Security Definer View": bypassa la RLS de
`users`), y ese ERROR queda ACEPTADO conscientemente, no arreglado.
Why: la vista ES la capa de descubrimiento público de perfiles. `users` solo tiene dos
políticas de SELECT — `users: select own` (auth.uid()=id) y `users: select platform admin`
(is_platform_admin()) — o sea, ninguna política pública. Pasar la vista a SECURITY INVOKER
haría que devolviera SOLO la fila del propio caller, rompiendo a TODOS sus consumidores,
que leen perfiles de OTROS usuarios: móvil (ChatRoomScreen, services/employees, /dms,
/follows, /blocks, /users) y web (dashboard/orders, dashboard/employees, c/[token]/room,
LiveChat). Es el diseño ya registrado en D-15 / migración 046.
La alternativa (dar SELECT público a `users` y restringir por column grants) es un cambio
de superficie mucho mayor, con riesgo de romper el descubrimiento en producción, y con
beneficio marginal: la vista expone 9 columnas curadas y ninguna es sensible (id, username,
display_name, avatar_url, bio, profile_theme_id, is_verified, is_private, created_at).
REGLA DE PROCESO (esto es lo que de verdad contiene el riesgo): **cualquier columna nueva
que se añada a `public_profiles` requiere revisión de seguridad explícita**, porque la vista
BYPASSA la RLS de `users` — lo que entra en la vista queda expuesto sin red. El riesgo no es
el diseño de hoy; es un ALTER despistado de mañana.
Contexto: el otro hallazgo del linter de la misma pasada (WARN, `profile-media` permitía
LISTAR archivos) SÍ se arregló, en la migración 063.

## React Native (Sesión 2026-07-13)

### D-52 — En React Native, `instanceof` contra clases globales del navegador NO es fiable
Constraint aprendido en device, no teoría. El fix del 409 (e8bd767) usaba
`ctx instanceof Response` para leer el body del error de `supabase.functions.invoke`.
`tsc --noEmit` daba 0, el código parecía correcto — y en el iPhone el `instanceof` daba
SIEMPRE false: el status llegaba `null` y el usuario seguía viendo el genérico "Edge
Function returned a non-2xx status code". Causa: RN polyfillea `fetch` (whatwg-fetch), así
que la respuesta que construye supabase-js NO es instancia de la `Response` global aunque
sea una respuesta HTTP perfectamente válida con `.status` y `.json()`.
REGLA: en código de `mobile/`, para objetos que vienen de librerías (Response, Headers,
Blob, FormData…), usar DUCK-TYPING (`typeof x.json === 'function'`, `typeof x.status ===
'number'`) en vez de `instanceof`. Arreglado en c3b81a3.
Corolario (refuerza D-45): el type-check en 0 no dice nada del runtime del bundle. Un fix
de RN no está verificado hasta que se ve en el device. Este bug pasó la revisión de código,
pasó tsc, se commiteó, se desplegó — y no funcionaba.

## Reembolsos (Sesión 2026-07-13)

### D-53 — El reembolso sale del balance del NEGOCIO, y lo aprueba el DUEÑO
Decision (Juan): el dueño del negocio aprueba los reembolsos solo (sin super_admin), y el
dinero sale del balance de la cuenta conectada, NO del de la plataforma → la EF
`stripe-refund` llama a Stripe con `reverse_transfer: true` + `refund_application_fee: true`.
Why: con destination charges + on_behalf_of, un `refunds.create` SIN esos dos flags saca el
dinero del balance de la PLATAFORMA. Cada reembolso que aprobara un dueño lo pagaría JChat
de su bolsillo — y con el fee de plataforma neutro (D-35) no hay margen que lo amortigüe.
Implementación: EF `stripe-refund` v1 (178e1e5). Defensa anti-doble-reembolso EN DOS CAPAS:
el guard `dispute.refund_id !== null` (409) y la `idempotencyKey: refund:<dispute_id>` de
Stripe. El estado real lo confirma Stripe: la EF pone 'approved', y el webhook pone
'refunded' solo cuando llega un refund con status='succeeded'.

### D-54 — Los column grants por defecto son un agujero recurrente: revisarlos SIEMPRE
Constraint aprendido a base de encontrarlo tres veces. Postgres/Supabase conceden por defecto
UPDATE de TABLA COMPLETA a `authenticated` Y a `anon`. Encontrado en `orders` (migr 060),
`reviews` (migr 064) y `disputes` (migr 065).
El caso de `disputes` fue GRAVE y merece recordarse: `refund_id` era escribible por el
cliente → el dueño podía hacer `UPDATE disputes SET refund_id = null, status = 'open'` vía
PostgREST y volver a pedir el reembolso. La idempotencyKey de Stripe EXPIRA A LAS 24 HORAS,
así que al día siguiente emitía un refund NUEVO: mismo pedido, reembolsado en bucle. Con
`reverse_transfer` eso drena el balance de la cuenta conectada, y con destination charges el
balance negativo lo cubre la PLATAFORMA.
La Edge Function estaba PERFECTAMENTE escrita. El agujero estaba una capa más abajo, en unos
grants que nadie había mirado.
REGLA: toda tabla que el cliente pueda escribir necesita su allow-list de columnas explícita
(la RLS decide QUÉ FILAS; los column grants deciden QUÉ COLUMNAS). Y toda EF que dependa de
un guard sobre una columna (`if (x.foo !== null)`) exige verificar que esa columna NO sea
escribible por el cliente — o el guard es decorativo.
PENDIENTE: barrer TODAS las tablas buscando este mismo patrón. Solo se han revisado tres.

### D-55 — Mesas y Taps: modelo de cuentas por persona en la mesa

Mesas y Taps: taps por persona, prepago cliente / postpago mesero, identidad por login anónimo
de Supabase, visibilidad limitada a participantes de la mesa. Ver [docs/MESAS_Y_TAPS.md](MESAS_Y_TAPS.md).

### D-56 — Limpieza diaria de usuarios anónimos por pg_cron

Job diario `cleanup-anon-users` (`0 5 * * *` UTC, migración 074) borra usuarios `is_anonymous`
inactivos > 24h y SIN tap abierto. Los pedidos, taps y mensajes sobreviven (FK `ON DELETE SET
NULL`). La función `cleanup_anonymous_users()` es SECURITY DEFINER y solo la ejecuta el cron
(EXECUTE revocado a public/anon/authenticated). Ver [docs/MESAS_Y_TAPS.md](MESAS_Y_TAPS.md).

### D-57 — Flujo del cliente en mesa: plan C (híbrido web + salto a app)

Flujo del cliente en mesa: plan C (híbrido web + salto a app). La superficie web de pedido era
una demo; se construye el checkout web real (C1) como base. Ver [docs/MESAS_Y_TAPS.md](MESAS_Y_TAPS.md).

### D-58 — Caja de efectivo: cierre de tap justificado, turnos con arqueo, revisión del propietario

Caja de efectivo: cierre de tap justificado (código de caja o razón), turnos con arqueo, y
revisión del propietario. Depende de B6. Ver [docs/CAJA.md](CAJA.md).

### D-59 — Rediseño del flujo del cliente: el cliente que paga NO crea tap

Rediseño del flujo del cliente: el cliente que paga NO crea tap (los taps son solo del mesero);
se le pide nombre solo si no tiene cuenta, y ve un recibo informativo. Cobro del mesero por
tarjeta/efectivo/contactless con división de cuenta. Ver [docs/MESAS_Y_TAPS.md](MESAS_Y_TAPS.md) y
[docs/CAJA.md](CAJA.md).

### D-60 — Terminal del mesero (B6): tablet compartida, PIN, permisos propios, pedidos sin pago

Terminal del mesero (B6): tablet compartida del negocio, vinculada por QR del negocio, acceso
por PIN de 6 dígitos con fichaje obligatorio; permisos propios por mesero; pedidos sin pago que
no cuentan como venta hasta cobrarse; división de cuenta por partes/artículo/asiento. Offline,
impresión y Tap to Pay quedan fuera de la v1. Ver [docs/TERMINAL_MESERO.md](TERMINAL_MESERO.md).

### D-61 — Abrir cuenta en una mesa sin asignar te la asigna (revierte D-60 "sin asignación implícita")

Cambio de Juan (2026-07-20): el **primer empleado que abre una cuenta en una mesa SIN asignar se
la queda** — la mesa pasa a estar asignada a él. Revierte la regla inicial de que atender una
mesa sin asignar no implicaba asignación. Motivo: sin esto nadie podía abrir cuenta en una mesa
sin asignar (la política INSERT de `table_tabs` exige `is_waiter_of_table`, y un mesero no puede
escribir en `table_waiters`, que es owner-only). Se implementa con la RPC `open_tab_on_table`
(migración 079, SECURITY DEFINER, con advisory lock por mesa para atomicidad ante dos meseros a
la vez): valida empleado aceptado, si la mesa no tiene mesero lo asigna, si lo tiene y no es él
devuelve `NOT_ASSIGNED`, y crea el tap. **La política INSERT de `table_tabs` NO se afloja** — la
RPC es el camino previsto, igual que con los taps de cliente. Ver
[docs/TERMINAL_MESERO.md](TERMINAL_MESERO.md).

### D-62 — Cocina: tres estados POR PLATO, estado del pedido derivado, y terminal propia del cocinero

Cocina: tres estados **POR PLATO** (pendiente/preparando/listo), **estado del pedido derivado de
sus platos**, y **terminal propia para el cocinero empleado**. Detectado y a corregir: el badge
del móvil miente ("Cocinando" para siempre). Ver [docs/COCINA.md](COCINA.md).

Contexto del reconocimiento que motivó la decisión: `order_items.item_status` es hoy una columna
muerta (nadie escribe otro valor que el default `'cooking'`), `order_items` solo tiene políticas
de SELECT —así que ningún cliente puede escribirla—, y `orders.status` solo lo puede cambiar el
DUEÑO, con el KDS viviendo dentro del gate de plan del dashboard: hoy la cocina únicamente
funciona si el dueño en persona toca el tablero.

### D-63 — Un pedido se puede editar hasta que la cocina lo empieza, y el bloqueo es por PEDIDO

Un pedido es editable (cantidad, quitar plato, cambiar modificadores) **mientras ningún plato
suyo haya entrado en "preparando"**. El bloqueo es **a nivel de PEDIDO, no de plato**: en cuanto
un solo plato pasa a preparando, **el ticket entero se bloquea**, incluidos los platos que sigan
pendientes. Motivo: si la cocina ya está trabajando ese ticket, cambiarlo por debajo genera
errores. Consecuencia asumida y aceptada: si empiezan el entrante, ya no se puede quitar el
postre de ese pedido. Pueden editar cualquier mesero con acceso a esa mesa, y el dueño siempre.

Corolario de diseño que condiciona el modelo: **un plato recién enviado nace en 'pending'**, no
en 'preparing' — si naciera preparando no existiría ninguna ventana de edición. Los importes se
recalculan SIEMPRE en el servidor al modificar, igual que al crear. Ver
[docs/COCINA.md](COCINA.md).

### D-64 — Pago de invitado: EF pública + hCaptcha, NO login anónimo

Un cliente sin cuenta paga por una **Edge Function pública** (`guest-pay`, `verify_jwt=false`),
protegida con **hCaptcha verificado del lado servidor**, en lugar de por una sesión anónima de
Supabase (se revierte el TODO C4 de CheckoutStep). Motivo: Supabase limita los registros anónimos
**por IP** (30/h por defecto) y en un bar todos comparten el WiFi = una sola IP → el cliente 31 de
la hora no podría pedir (choca con D-39). La EF pública evita ese límite; el captcha es la defensa
real contra bots (D-38). El pedido SIEMPRE se guarda con `orders.user_id = NULL` (nullable desde
la 080); lo efímero es el vínculo con el cliente. El correo es opcional, solo para el recibo de
Stripe. Un token de hCaptcha es de **un solo uso** (G2 debe pedir uno nuevo por reintento).

Redes de seguridad que trae G1: (1) el webhook deja de descartar en silencio un pago sin `user_id`
— un `guest_order` crea el pedido, y un pago que no se puede convertir queda en `orphan_payments`
en vez de perderse en un log; (2) `pending_order_carts.user_id` pasa a nullable; (3) purga diaria
de carritos abandonados (los invitados que no completan el pago). El cálculo de precios y el bloque
Connect NO se duplican: viven en `supabase/functions/_shared/` (`pricing.ts`, `connect.ts`) y los
importan `payments`, `tab-pay` y `guest-pay`. Ver [docs/MESAS_Y_TAPS.md](MESAS_Y_TAPS.md).

### D-65 — El secreto de hCaptcha vive en DOS sitios independientes de Supabase

Constraint aprendido depurando en producción, no teoría. El mismo secreto de hCaptcha
(account-level, `ES_563..`) debe estar pegado en DOS lugares SEPARADOS de Supabase, y son
independientes:
1. **Edge Functions → Secrets → `HCAPTCHA_SECRET`** — lo usa `guest-pay` para validar el
   token del pago de invitado (`/siteverify` server-side).
2. **Authentication → Attack Protection → CAPTCHA → Captcha secret** — lo usa Supabase Auth
   para validar el token del **login con contraseña** (y registro/reset).
El pago de invitado NO pasa por Supabase Auth (es una EF pública), y el login NO pasa por la
EF — cada uno valida el captcha en su propio sitio con su propia copia del secreto. Cambiar
uno NO cambia el otro. Síntoma cuando se desincronizan: `guest-pay` devuelve 403 (pago) y/o
Auth devuelve `400 captcha protection: request disallowed (sitekey-secret-mismatch)` en
`POST /token grant_type=password` (login). Matiz: los logins por OTP/magic-link NO exigen
captcha → siguen dando 200 aunque el de contraseña esté roto, lo que despista.
Corolario (refuerza D-44 y el aprendizaje ya anotado de "REDESPLEGAR tras secrets set"): tras
cambiar `HCAPTCHA_SECRET` en Edge Functions hay que REDESPLEGAR la función (`supabase functions
deploy guest-pay`) para que la instancia caliente tome el valor nuevo; el de Authentication, en
cambio, aplica al Guardar (no requiere deploy). Verificado el 2026-07-22: guest-pay v3→v5 200,
login password 200 tras el reload de la config de Auth (visible en los logs de Auth como
"reloading api with new configuration").

### D-66 — El pago de invitado se dispara al entrar y el captcha invisible debe esperar a onLoad

El checkout de invitado (B2b) dispara `getToken()` automáticamente al montar la pantalla de
pago (no tras un click). El widget invisible de hCaptcha carga su iframe/script de forma
asíncrona, así que en el PRIMER intento `execute()` corría antes de que el widget estuviera
listo → fallo espurio "No pudimos verificar que eres una persona"; "Reintentar" funcionaba solo
porque para entonces ya había cargado. Fix: `InvisibleCaptcha` espera al evento `onLoad` del
widget (gate `waitForReady`, con timeout fail-open de 4s) ANTES de ejecutar. Componente
compartido con el login, retrocompatible: el login pide el token tras un click (el widget ya
lleva rato cargado) → para él la espera se resuelve al instante. Ref `0c97d3d`.

### D-67 — Códigos promocionales: un código por usuario, un solo uso, otorga plan de prueba

Decisión de producto (Juan, 2026-07-22). Un código promocional es un string de 12 caracteres,
autogenerado server-side evitando caracteres confusos (O/0/I/1). El super_admin lo crea eligiendo
plan (`business`|`pro`) + días de prueba (+ vencimiento opcional). Es de UN SOLO USO: al canjearlo,
OTORGA ese plan en modo prueba (`plan_status='trialing'`, `plan_trial_end = now()+días`) y amarra el
código al usuario (`redeemed_by`/`redeemed_at`). Solo un usuario `regular` puede canjear
(`ALREADY_ON_PLAN` si ya tiene plan). Como canjear te SACA de 'regular', cada usuario canjea a lo
sumo UN código en su vida → `redeemed_by` es 1:1 y la misma tabla `promo_codes` ES el registro de
seguimiento (no hace falta tabla aparte).
Why: dar pruebas gratis controladas por la plataforma, con trazabilidad (quién usó qué código y
cuántos días le quedan). Best-practice de la investigación: códigos 12 chars memorables sin
caracteres confusos, con tope de uso y expiración para evitar mal uso; en SaaS, crédito/prueba en
vez de reembolso en efectivo.
Consequence: RLS de `promo_codes` = solo super_admin (`is_platform_admin`). Creación por RPC
`create_promo_code` (gateado), canje por RPC `redeem_promo_code` (usuario autenticado, SECURITY
DEFINER). Pantalla `/super-admin/promo-codes`: genera+lista (2a) + seguimiento con nombre del
canjeador + días restantes (2b). Verificado end-to-end (create → redeem real con cuenta regular →
seguimiento muestra nombre + "quedan 30 días"). Migración 086 (aplicada vía MCP). El "mes gratis"
(crédito en factura Stripe, D-35) y el sistema de afiliados quedan como tandas FUTURAS. PENDIENTE:
la pantalla donde el USUARIO escribe el código para canjear (móvil/web) — el RPC existe, falta la UI.

### D-68 — Regenerar `database.types.ts` es parte de CADA migración de schema; y los tipos pueden ser MÁS estrictos que la BD

Constraint aprendido construyendo la página de promo codes. Dos caras:
(1) Los tipos del cliente Supabase (`web/lib/database.types.ts`) NO se regeneran solos. Tras una
migración que añade tabla/columna/RPC, el cliente fuertemente tipado RECHAZA `.from("tabla_nueva")`
/ `.rpc("rpc_nuevo")` y `tsc` falla. Los tipos llevaban 4+ migraciones sin regenerar (074/083/084/
085) → regenerar trajo un diff grande y legítimo (tab_payments, orphan_payments, promo_codes + varios
RPCs). REGLA: regenerar (`npx supabase gen types typescript --linked > lib/database.types.ts`) es
parte del ritual de TODA migración que toque el schema, y el diff se AUDITA (no debe borrar tablas;
solo sumar).
(2) Los tipos generados pueden ser MÁS ESTRICTOS que la BD real, porque no ven: (a) triggers que
llenan columnas → marcan una columna requerida en Insert aunque la ponga un trigger (ej.
`tables.qr_token`, lo asigna `trg_assign_table_qr_token`, migr 073, y el cliente tiene PROHIBIDO
escribirla por el allow-list 069); (b) la nulabilidad de los args de un RPC → los marca no-nullable
aunque el RPC acepte null (ej. `attach_order_to_tab(p_tab_id)` acepta null para DESVINCULAR, migr
072). Cuando `tsc` se queja tras regenerar, hay que LEER la migración antes de "arreglar" el runtime:
el fix correcto suele ser SOLO de tipo (`@ts-expect-error` con nota, o `as Tipo`), NUNCA cambiar el
valor de runtime — un `?? ""` o añadir la columna al insert habría METIDO un bug real. Refuerza
D-45/D-47: el tsc verde no es la verdad; la migración sí. Refs migr 086, commits 537e5a5 / b9ec839.

### D-69 — Un estado que nadie hace caducar, NO caduca: todo plazo necesita un ejecutor

Constraint aprendido encontrando un bug de dinero horas después de crearlo. La migración 086 escribía
`plan_trial_end = now() + N días` y todos asumimos que "la prueba dura N días". No duraba nada: el gate
del dashboard solo leía `plan_status IN ('active','trialing')`, y NO existe ningún cron que caduque
pruebas (`cron.job` tiene 3 entradas: cleanup-anon-users, purge-expired-messages,
purge-stale-pending-carts). Como una prueba dada por código promocional no tiene suscripción de Stripe
detrás, NADIE movía nunca `plan_status` → **acceso Pro permanente y gratis**.
REGLA: escribir una fecha de caducidad NO caduca nada. Todo plazo necesita un EJECUTOR explícito, y hay
que nombrarlo al diseñarlo: o lo lee el gate en cada petición, o lo aplica un job, o lo gobierna un
tercero (Stripe). Si nadie lo lee, la fecha es decorativa.
Corolario de arquitectura (motiva el cambio de modelo): un plazo con dinero detrás **debe gobernarlo
Stripe**, no una columna nuestra. Nuestra columna no sabe cobrar, ni reintentar, ni avisar, ni cancelar;
Stripe sí, vía `trial_period_days` + el evento `customer.subscription.trial_will_end`.
Corolario de defensa: parchear el GATE tapa la puerta principal, no todas — `enforce_business_limit()`
lee `users.plan` directo, así que el arreglo completo es DEGRADAR el plan al vencer, no solo denegar la
vista. Refuerza D-42 (los límites se aplican en el servidor) y D-46 (un kill-switch silencioso necesita
una prueba que lo haga visible). Ref `6bc2bb3`.

### D-70 — Todo gate necesita un destino para los que rechaza (si no, es un bucle)

Bug encontrado en producción el 2026-07-23. El registro terminaba en `router.push("/dashboard")`,
pero el gate del dashboard exige plan `business|pro` → un usuario recién creado es `regular`, así que
el gate lo rebotaba a `/auth/register?upgrade=1`. Resultado: **el usuario se registraba y aparecía de
nuevo en la pantalla de registro**, sin felicitación ni explicación. El registro nunca "falló" — cada
pieza hacía lo suyo bien; nadie definió dónde aterriza quien NO pasa el gate.
REGLA: al añadir un gate hay que nombrar las DOS salidas — a dónde va quien pasa y a dónde va quien no.
Si el destino del rechazado es una pantalla que vuelve a empujarlo al gate, se cierra el bucle. Vale la
pena recorrer el camino del usuario nuevo (el que aún no tiene nada) además del que ya tiene todo.
Solución: pantalla `/auth/welcome` (felicita, ofrece Business/Pro, y si YA tiene plan vigente se salta
sola al panel). El registro y el OAuth de Google apuntan ahí. Ref `3f55cd3`.
Deuda conocida: la regla de "prueba vencida" quedó DUPLICADA (gate del dashboard + welcome). En welcome
es solo comodidad de navegación, no seguridad; consolidar en la tanda de Stripe.

## Permanent deviations from the original spec
1. React Navigation v7 (not v6) — Expo SDK 56 / React 19.
2. --color-warning = #f59e0b (not #D97706).
3. Push token stored in users.push_token (spec said fcm_token).
4. Extra migrations 002-017 beyond the original plan.
5. Bundle id com.juangarciacruz.jchatapp.
6. Web auth implemented (outside original spec — approved).
7. terra-draw / AdvancedMarker removed; geofence drawing uses native google.maps primitives.
