# JChat 3.0 — Decision Journal

Why we did what we did. Read before reversing a choice.

Last updated: 2026-07-11

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

## Permanent deviations from the original spec
1. React Navigation v7 (not v6) — Expo SDK 56 / React 19.
2. --color-warning = #f59e0b (not #D97706).
3. Push token stored in users.push_token (spec said fcm_token).
4. Extra migrations 002-017 beyond the original plan.
5. Bundle id com.juangarciacruz.jchatapp.
6. Web auth implemented (outside original spec — approved).
7. terra-draw / AdvancedMarker removed; geofence drawing uses native google.maps primitives.
