# JChat 3.0 — Project Status

Last updated: 2026-07-11

> **📋 Auditoría senior 2026-07-09 completada** (seguridad, escalabilidad, móvil iOS/Android,
> web, POS vs competencia). La hoja de ruta activa hacia el lanzamiento vive en
> **`docs/PLAN_LANZAMIENTO.md`**; los 3 informes de evidencia y los prompts de remediación
> están en `docs/AUDITORIA_*_2026.md` + `docs/PROMPT_CLAUDE_CODE_seguridad.md`.

> **Sesión 2026-07-10 — Seguridad + bloqueantes de review:** cerrados en código S1, S2,
> S3, S6, S7, E1, E5 (Bloque 1) y W1, W2, W3, M1, M2, M6 (Fase 2). 8 commits auditados y
> verificados en BD (`3172ae2`, `af43587`, `9a400cd`, `1af2168`, `89977e2`, `34303ce`,
> `55eaa2d`, `c746796`). Pendientes de Juan (no-código): S5 leaked-password toggle, S4 rate
> limiting (diferido), M4 capability Apple, flip W1 CSP a enforce, revocar/regenerar `.p8`
> de Apple, device testing (OAuth/delete/biometría vía EAS dev-client). Ver PLAN_LANZAMIENTO.md.
> Continuación: cerrados también M8 (`75dbfcf`), M3/Apple-Maps docs (`7051a34`) y M9 OTA
> (`12fc1f7`). Fase 2 de bloqueantes de review completa en código. Pendiente de Juan para
> OTA: correr `eas update:configure` una vez desde `mobile/`.

> **⚠️ SEGURIDAD PENDIENTE:** el archivo `.p8` de Sign in with Apple se expuso durante la
> configuración. Revocar la key en Apple Developer → Keys, generar una nueva, regenerar el
> JWT (client secret) y actualizarlo en Supabase **ANTES de producción.**

---

## Pruebas manuales pendientes

### PENDIENTE DE PROBAR — Fase A+B social (follow / privacidad)
Commits `96dc2bf` (BD) + `56efb33` (móvil). Estado: **aplicado, pendiente de verificación
manual en dispositivo**. Requiere 2 usuarios (usar `jcgarcia007@icloud.com` + una cuenta seed
`userNN@seed.jchat.test` / `SeedPass123!`). Pasos:
- Recargar Metro. Seguir a un usuario desde una lista de miembros de sala (UserActionSheet) →
  debe cambiar a "Siguiendo" (cuenta pública) o "Solicitado" (cuenta privada).
- Abrir FriendsScreen → ver 3 tabs (Seguidores / Siguiendo / Solicitudes).
- Poner la cuenta propia como privada (PrivacyScreen); que otro usuario pida seguir → aparece
  en Solicitudes → Aceptar/Rechazar.
- Bloquear a alguien → corta el follow en ambos sentidos.

### PENDIENTE DE PROBAR — Fix #6 (cobro de modificadores)
Commits `995fcbe` (server payments v11) + `85297c8` (cliente móvil). Estado: **aplicado,
pendiente de verificación manual en dispositivo**. Pasos:
- Recargar Metro (`npx expo start --dev-client --clear`).
- Pedir un ítem con tamaño (ej. "Doble +$5") y/o un extra desde el menú.
- Ir al checkout y confirmar que el total mostrado incluye los modificadores.
- Pagar con tarjeta de prueba `4242 4242 4242 4242`.
- Verificar en el dashboard de Stripe (test mode) que el monto **cobrado = base + tamaño +
  extras + tax** (antes solo cobraba la base).
- Requiere un ítem con `menu_items.options` (sistema legacy sizes/extras) configurado; si
  Bar XZX no tiene uno, crear un ítem de prueba con modificadores.
- Objetivo: confirmar que el usuario ve X y Stripe cobra X (sin discrepancia).

### PENDIENTE DE PROBAR — Fase D (gate de DM + bloqueo)
Commits `670e82e` (BD) + `c06fde7` (Send DM). Estado: **aplicado, pendiente de verificación
manual en dispositivo**. Requiere 2 usuarios. Pasos:
- Desde una lista de miembros de sala (UserActionSheet) → **Send DM** a un usuario que acepta DMs
  (`whoCanDMMe='everyone'`) → abre DMChat.
- Poner el receptor en `whoCanDMMe='followers'` (PrivacyScreen) y NO seguirlo → Send DM debe mostrar
  Alert "Debes seguir a este usuario…"; seguirlo → ya abre DMChat.
- Poner el receptor en `nobody` → Alert "no acepta mensajes directos" (salvo conversación previa).
- Enviar una foto en un DM → sube a `dm-media` (privado) y se ve vía signed URL.
- Bloquear al otro → la conversación desaparece de la lista (soft-hide); desbloquear → reaparece con historial.

### PENDIENTE DE PROBAR — Chat Fase 2 (purga TTL 24h)
Commit `c63479c` (migr 043). Estado: **aplicado y probado en BD (191→0); pendiente verificación
en app**. Pasos:
- Enviar mensajes a una sala; confirmar que a las +24h (o forzando el cron / `select
  purge_expired_messages()`) desaparecen al reabrir la sala.
- Anclar (pin) un mensaje viejo → NO debe borrarse.
- (Conocido/diferido) las **fotos** de mensajes purgados quedan huérfanas en `post-media` — GC vía
  Storage API pendiente (ver "What's next" + D-14).

---

## Sesión 2026-07-11 — Device testing (EAS dev-client) + fixes en cadena

Build EAS dev-client en iPhone de Juan. Se probaron los flujos reales y salieron VARIOS
bugs que solo se ven en device. Todos auditados (get_commit full_patch) y pusheados a
origin/main.

**Bugs de device testing resueltos:**
- `3eef6e2` (migración 048, aplicada vía MCP): trigger `on_auth_user_created` auto-crea
  `public.users` al registrarse (OAuth + email). Deriva username del email local-part /
  nombre de Google, editable luego. Backfill del huérfano OAuth. CAUSA: OAuth no pasaba por
  RegisterStep2 → sin fila en public.users → fallaba enviar mensajes.
- `589fdde`: nombres del chat vía `public_profiles` (la RLS de `users` es own-row+admin y
  bloqueaba el embedded join `sender:users!fkey`). El chat resuelve nombres batch desde
  public_profiles + cache + realtime async.
- `c7581fa`: subida de foto de perfil (avatar/cover). CAUSA: EditProfileScreen tenía su
  propia `uploadImage` con `fetch().blob()` (rompe en RN/Hermes, sube 0 bytes). Fix: usar
  la `uploadImage` de `services/storage.ts` (expo-file-system/legacy + base64-arraybuffer),
  la misma que ya funcionaba en el chat.
- `3aa9e38`: avatares en mensajes del chat (faltaba `avatar_url` en el batch a
  public_profiles → sender_avatar vacío).
- `7bcc661`: avatares en la fila de presencia. CAUSA: usePresenceChannels emite el avatar
  desde `user.user_metadata.avatar_url`, no desde public.users. Fix: EditProfileScreen
  ahora sincroniza `supabase.auth.updateUser({ data: { avatar_url } })` al guardar.
- `6a0b055`: customizador de menú no abría en móvil. CAUSA: ProductRow decidía abrir el
  detalle con `options.sizes` (sistema viejo), pero los ítems usan grupos de modificadores
  (migraciones 030-032). Fix: `services/menu` trae `has_modifiers` (embedded count de
  `menu_item_modifier_groups`), ProductRow abre el detalle con `has_modifiers || sizes`, y
  la fila entera es tappable (paridad con web).

**Feature UX — tarjeta rápida de usuario (quick card):**
- `f807355`: tap en avatar/nombre de un mensaje abre una tarjeta compacta ANCLADA al avatar
  (measureInWindow + flip arriba/abajo + piquito), fondo opaco, 6 acciones en grid (Perfil,
  DM, Seguir, Silenciar, Reportar, Bloquear). Silenciar delega al UserActionSheet grande
  (que conserva duración de mute + moderación de dueño) vía onOpenFull.
- `c73844f`: quitado el long-press del avatar/nombre de mensajes (tap-only).
- `d93f164`: la fila de presencia (ChatTopBar) también abre la quick card con tap (mismo
  handler); se eliminó `handleUserLongPress` (ya sin uso).

**Biometría:**
- `2b31f27`: prompt de enrolamiento biométrico post-login (una vez, tras el primer login de
  cualquier método; texto adaptativo Face ID/Touch ID/huella) + botón Face ID del login solo
  visible si el lock está activado (opt-in). Reusa el flag `@jchat/biometric_enabled` de M2.

**Config OAuth (acciones en Supabase/Google, no código):** el provider Google en Supabase
tenía el Client Secret VACÍO → "missing OAuth secret"; tras poner el secret, "Unable to
exchange external code" por mismatch → regenerado el Client Secret del Web Client
(257672140298-rbeq5...) en Google Cloud y pegado en Supabase. Google login OK.

**Resultados device testing (PASÓ):** M4 Apple login, M1 Google login, chat (envío +
nombres + avatares de ambas cuentas + presencia), mapa + venues (Apple Maps M3), quick card
(mensajes + presencia), subida de foto (perfil + chat + presencia), menú (6 categorías, 19
ítems, add-to-cart).

**Pendiente de probar en device:** M2 biometría (toggle + prompt + lock — estaba bloqueado
por bundle viejo, ya debería andar), cambio de idioma ES/EN, menú customizador (6a0b055,
recargar y confirmar), borrado de cuenta M6 (cuenta desechable).

**Pendiente de Juan (no código):** revocar/regenerar el .p8 de Apple (expuesto en sesión
anterior), decisión de native sign-in, confirmar `eas update:configure`.

### Parte 2 — Paridad de menú, cadena de pagos y crashes de realtime

**Menú móvil a la par de la web:**
- `f543937`: ProductDetail pasa a `presentation: 'modal'` (entra desde abajo, paridad web).
  (Su intento de scroll por categoría con `scrollToLocation` FALLÓ en device — superado por a883048.)
- `a883048`: scroll por categoría FIABLE — se reemplazó SectionList por ScrollView; cada
  sección es hijo DIRECTO del ScrollView y registra su Y absoluta vía `onLayout` en
  `sectionOffsets`; `scrollToCategory` hace `scrollTo({y})`. Tab activa vía `onScroll`.
  CAUSA del fallo previo: `SectionList.scrollToLocation` + `ListHeaderComponent` +
  sticky headers no movía la lista en absoluto. Trade-off aceptado: se pierden los
  headers de sección pegajosos.
- `1683b95` (TANDA A): grupos de modificadores en el customizador móvil.
  `services/menu`: tipos `ModifierGroup`/`ModifierChoice` + `getItemModifierGroups()`
  (embedded desde `menu_item_modifier_groups`). `ProductDetailScreen`: single=radio /
  multi=checkbox respetando `min_select`/`max_select`, validación de requeridos
  (bloquea "Añadir"), precio dinámico. `CartContext`: `CartModifierSelection` +
  `CartLine.modifierSelections`; `makeLineId` incluye los modificadores (configs
  distintas del mismo ítem = líneas separadas).
- `88a8589`: tipo de pedido por defecto = 'table'; card de 'gift' OCULTA (la lógica del
  gift picker y el type 'gift' se conservan inertes → reactivable restaurando la card).

**Número de mesa en el pedido (cadena completa):**
- `1eee04d` + **migración 049 (APLICADA vía MCP)**: `orders.table_label` (text, ≤40 chars).
  La cadena: CartContext → CartScreen (input obligatorio si order_type='table') →
  CheckoutScreen → `services/stripe` → EF `payments` (sanitiza, mete en metadata del
  PaymentIntent) → EF `stripe-webhook` (lee metadata → INSERT en orders).
  CLAVE: las órdenes las crea el SERVIDOR (webhook, service_role — migración 033), NUNCA
  el móvil en producción. Cualquier campo nuevo de orden debe atravesar TODA la cadena.

**Fixes de realtime (crashes en device):**
- `c8e0836`: "cannot add postgres_changes callbacks after subscribe()" al volver del
  checkout. CAUSA: `supabase.channel(topic)` DEVUELVE el canal existente si el topic se
  repite; `removeChannel` es async, así que un remonte rápido reutiliza el canal ya
  suscrito y `.on()` lanza. FIX: topic ÚNICO por suscripción en PinnedBanner y
  ChatRoomScreen (el `filter` del `.on()` hace el scoping real, no el topic).
- `0b593ad`: mismo crash en PRESENCIA. La presencia NO puede usar topic único (todos los
  dispositivos deben compartir `presence:${roomId}` para verse). FIX: `subscribePresence`
  es ahora async — purga los canales stale del mismo topic y AWAITa su `removeChannel`
  antes de crear el nuevo. Ambos efectos corren en IIFE async con guard `cancelled`.

**Pagos — idempotencia:**
- `e1e02aa`: StripeIdempotencyError en device. CAUSA: la EF derivaba la clave del carrito
  (`pi:user:business:total:itemsFingerprint`) → totalmente determinista, así que un cliente
  repitiendo un pedido IDÉNTICO (mismo total) reusaba la clave con parámetros distintos →
  Stripe 400. En producción BLOQUEARÍA pedir dos veces lo mismo.
  FIX: el cliente genera una clave fresca por intento (`makeIdempotencyKey`) enviada en
  `body.idempotency_key`; la EF la valida (`[A-Za-z0-9_-]{8,64}`) y la namespacea con el
  usuario verificado por JWT (fallback `crypto.randomUUID()`).
  VERIFICADO con datos: dos órdenes con total idéntico (1782, mesa 5) creadas sin error.

**INFRAESTRUCTURA (fuera de git — NO PERDER):**
- Migración **049 aplicada** vía Supabase MCP.
- Edge Functions **`payments` y `stripe-webhook` DESPLEGADAS** (payments quedó en v17).
- Secretos de Supabase configurados: **`STRIPE_SECRET_KEY`** y **`EXPO_PUBLIC_STRIPE_PK`**
  (llaves de TEST de Stripe). Sin `STRIPE_SECRET_KEY` la EF hace `throw` → 500 y el móvil
  no recibe la publishable key → "no puedo agregar la tarjeta".
- RECORDATORIO: **tras cambiar secretos hay que REDESPLEGAR** la Edge Function.

**HITO — flujo de compra completo verificado end-to-end por primera vez:**
menú → customizador con modificadores → carrito → mesa → Stripe (tarjeta test 4242) →
webhook → orden en la BD con impuesto (8%) y propina. 6 órdenes reales creadas.

**Estado de Bar XZX:** `stripe_account_id = NULL` (sin onboarding de Stripe Connect). La EF
lo maneja (`if (stripeAccountId)`) → cobra sin destination charges. Pendiente onboardear
Connect para que el negocio reciba el dinero.

### Parte 3 — TANDA C: cobro de modificadores — RESUELTO ✅

`4ea3d00` + **migración 050 (APLICADA)** + ambas Edge Functions REDESPLEGADAS.

**El bug (dinero):** la app mostraba el precio con modificadores (Alitas BBQ $23) pero se
cobraba solo el precio base ($14). CAUSA: CheckoutScreen enviaba únicamente
`options: { size, extras }` (sistema legacy); las `modifierSelections` (Tanda A) nunca
llegaban al servidor, y la EF sumaba $0 por modificadores.

**El segundo bug (latente, descubierto al diseñar el fix):** el webhook armaba los
`order_items` desde `paymentIntent.metadata.items`, que Stripe capa a 500 chars (la EF corta
a 490). Al añadir los modificadores, un carrito real desborda → JSON truncado → el webhook no
puede parsear → **orden SIN ÍTEMS, en silencio**. Arreglar solo el cobro habría cambiado un
fallo silencioso por otro.

**La solución (ambos a la vez):**
1. `CheckoutScreen` envía las selecciones como `options.modifiers = [{ g: groupId, c: [label] }]`
   — SOLO ids y etiquetas, NUNCA precios (ambos paths: real y demo).
2. EF `payments`: batch-fetch de `menu_item_modifier_groups` para todos los ítems; nueva
   `resolveGroupModifierCents()` precia cada selección desde `modifier_groups.choices` EN LA BD.
   Rechaza (400) grupos no vinculados al ítem y etiquetas de choice inexistentes.
   `lineUnitCents = base(BD) + legacy size/extras(BD) + grupos(BD)`. El `price_cents` del
   cliente se sigue ignorando.
3. **Migración 050 — `pending_order_carts`** (payment_intent_id PK, business_id, user_id,
   items jsonb). RLS ON **sin políticas** → solo `service_role`. La EF `payments` guarda ahí
   el carrito RESUELTO POR EL SERVIDOR (precios de BD + etiquetas verificadas) tras crear el
   PaymentIntent.
4. EF `stripe-webhook`: lee `pending_order_carts` por PI id para construir `order_items`
   (sin límite de tamaño); cae a la metadata para PIs viejos; borra la fila después.

**VERIFICADO con datos reales (orden 2026-07-12 00:08):**
- `order_items.price_cents` = **2300** (base 1400 + 900 de modificadores) — antes cobraba 1400.
- `order_items.options.modifiers` = ["8 piezas","BBQ","Suave","Ranch","Papas a la francesa",
  "Aros de cebolla","Dip extra"] — etiquetas verificadas por el servidor (lo que ve la cocina).
- Cuadre: 2300 × 2 = subtotal 4600 → impuesto 368 (8%) → propina 690 → total 5658.
- Esas 7 etiquetas habrían desbordado los 500 chars de la metadata → `pending_order_carts`
  fue lo que permitió que los ítems llegaran completos.

### Parte 4 — Auditoría de seguridad: P0-2 y P0-3 RESUELTOS ✅ + hallazgo nuevo

**P0-2 (recálculo de totales server-side) — RESUELTO.** La EF `payments` recalcula todo desde
la BD: `amount: serverTotalCents` ("client total_cents is ignored"); subtotal desde precios de
BD (base + modificadores), impuesto desde `businesses.tax_rate`, descuento forzado a 0. Lo
único del cliente es `tip_cents`, validado y capado al 200% del subtotal del servidor. La
metadata se escribe con valores del SERVIDOR y el webhook lee de ahí. Además, `orders` NO
tiene política de INSERT → el cliente no puede crear órdenes con montos inventados
(migración 033). EVIDENCIA: impuesto = 8% exacto sobre el subtotal del servidor; los
modificadores se precian desde `modifier_groups.choices` (Tanda C).

**P0-3 (Edge Functions confían en IDs del cliente) — RESUELTO.** Las CUATRO EF verifican el
JWT (`verifyCaller`). Las que actúan sobre un negocio comprueban PROPIEDAD antes de nada
(`assertOwnerOrAdmin` → 403 "not the owner of this business"): en `stripe-connect` está en el
ROUTER, antes del switch (cubre las 3 acciones); en `subscriptions`, dentro de
`create_checkout`. `body.user_id` nunca se usa para auth ni consultas — solo como traza.

**🔴 HALLAZGO NUEVO (cerrado en migración 051):** `order_items` tenía una política que permitía
al CLIENTE insertar ítems en su propia orden ya pagada → la cocina los prepararía gratis. El
total estaba protegido, los ítems no. Política eliminada (051). El webhook usa service_role
(salta RLS) → no se rompe nada.

### PENDIENTES (actualizado 2026-07-11 parte 4)

> ✅ RESUELTO (Parte 3, `4ea3d00`): el bloqueante 🔴 "los modificadores no se cobran" quedó
> arreglado — cobro server-side desde `modifier_groups.choices` + carrito en
> `pending_order_carts`. Ver Parte 3 arriba.

**Otros pendientes:**
- Purga de `pending_order_carts`: las filas de PIs abandonados (pago no completado) quedan
  huérfanas. Falta un job/cron que borre las de más de unos días.
- Pantalla de Cart: no muestra el desglose de modificadores por línea (se guardan, pero no
  se listan).
- `UserProfileScreen` (ver perfil de OTRO usuario) NO EXISTE — el botón "Perfil" de la quick
  card solo muestra un Alert placeholder.
- D-27: plantillas de menú en móvil (`businesses.menu_template_id` — hoy solo la web las
  respeta).
- Bar XZX sin `stripe_account_id` → onboarding de Stripe Connect pendiente.
- Pruebas de device pendientes: biometría (toggle/prompt/lock), cambio de idioma ES/EN,
  borrado de cuenta (M6).
- `mobile/eas.json`: reformat del linter sin commitear en el working tree.
- Revocar/regenerar la .p8 de Apple (expuesta en sesión anterior).

---

## Sesión 2026-07-08 — completado

### Seguridad de pagos — CERRADA COMPLETA (P0 + P1 integridad)
- **Tanda 1 (P0):** `orders` solo por webhook (migr 033/035) + columnas financieras de
  `businesses` protegidas (034/036, revoke + allow-list) + RPC `admin_set_business_status`.
  Verificado en BD.
- **Tanda 2 (P0):** `stripe-connect` verifica propiedad/IDOR (verifyCaller + assertOwnerOrAdmin,
  v9) + `subscriptions.create_checkout` autentica en el path app (v10→v11). Verificado (anónimo → 401).
- **Tanda 3 (P1 integridad):** #8 `UNIQUE` parcial `orders.stripe_pi_id` (migr 037) · #9 proteger
  `businesses.is_verified` (038) · #7 JWT en `payments` `ensure_customer`/`create_setup_intent`
  (v10) · #5 idempotencia de webhooks insert-first + delete-on-error (039 + `stripe-webhook` v9 +
  `subscriptions` v11). Verificado en BD (helpers, RPCs, índice parcial, tabla `processed_stripe_events`).
- **Fix #6 modificadores:** server `payments` v11 recalcula size/extras desde
  `menu_items.options` (995fcbe) + cliente envía labels (85297c8). **PENDIENTE prueba manual
  móvil** (anotada arriba).
- **Estado funciones Edge:** `payments` v11 (jwt=true) · `stripe-connect` v9 (jwt=true) ·
  `stripe-webhook` v9 (jwt=false) · `subscriptions` v11 (jwt=false).

### Sistema social (Stage 1, estilo Instagram) — Fases A+B+C aplicadas
- **Plan maestro** completo en `docs/PLAN_MAESTRO_SOCIAL.md` (6 decisiones cerradas, D-13 en
  DECISIONS.md). Hallazgo clave: el social estaba **~70% andamiado pero SIN aplicar** (RLS de
  lectura en `true`); el trabajo fue aplicar privacidad + cablear, no reconstruir.
- **Fase A+B** (BD `96dc2bf` + móvil `56efb33`): columna `users.is_private`; helpers SECURITY
  DEFINER `is_blocked` / `can_view_profile` / `can_view_user_content`; 5 RPCs
  `request_or_follow` / `accept_follow_request` / `remove_follower` / `block_user` /
  `unblock_user`; RLS de `follows` aplica privacidad; servicios `follows.ts` / `blocks.ts`;
  `FriendsScreen` reconstruida (3 tabs: Seguidores/Siguiendo/Solicitudes); botón seguir con
  estado (público→Siguiendo / privado→Solicitado) en `useFollowSystem` + `UserActionSheet`.
  Verificado en BD. **PENDIENTE prueba manual móvil** (anotada arriba).
- **Fase C** (`2dbc46b`, migr 041): bucket **`profile-media`** (público) separado del
  **`post-media`** efímero del chat; `posts.ts:uploadPostMedia` repuntado; RLS `posts_read` /
  `comments_read` / `post_likes_read` pasan de `true` a aplicar `whoSeesMyPosts` + bloqueo
  (via `can_view_user_content`). Write policies intactas. Verificado en BD.

### Fase D — gate de DM + bloqueo soft-hide + bucket dm-media (aplicada)
- **BD+móvil `670e82e`** + **cableado Send DM `c06fde7`**: RPC `start_dm` (SECURITY DEFINER) aplica
  el gate `whoCanDMMe` (everyone/followers/nobody) + bloqueo antes de crear la conversación; RLS de
  `dm_conversations`/`dm_messages` reescrita con **soft-hide** de bloqueados (no borra, reaparece al
  desbloquear) + INSERT deny-by-default (solo el RPC crea). Bucket **`dm-media` privado** (upload +
  signed URLs). "Send DM" (UserActionSheet→ChatRoom) navega a DMChat vía `getOrCreateConversation`/
  `start_dm`, con `DmGateError`→Alert. Verificado en BD. **PENDIENTE prueba manual móvil** (anotada arriba).

### Chat Fase 2 — purga TTL 24h de mensajes de sala (aplicada)
- **`c63479c`, migr 043**: `pg_cron` (1.6.4) + función `purge_expired_messages()` cada 15 min borra
  mensajes de sala con +24h (excluye anclados; `reply_to`→SET NULL). Probada en vivo: **191→0 mensajes**.
  **Fotos DIFERIDAS (Option C)**: Supabase bloquea el `DELETE` directo sobre `storage.objects`
  (`protect_delete`), así que el borrado de binarios se omite con gracia (log + continúa) — quedan
  huérfanos en `post-media` hasta una limpieza vía Storage API. Ver D-14.

**Otros (housekeeping):** ESLint Tanda A (`f129184`, 73→47 avisos); docs de diseño creados
(`DIAGNOSTICO_TTL_CHAT.md`, `DISENO_FIX_INTEGRIDAD_PAGOS.md`, `PLAN_MAESTRO_SOCIAL.md`).

---

## Estado julio 2026 — completado

### Sistema de menús (web) — COMPLETO
- 21 plantillas de menú portadas a React (arquetipos del board + classic).
- 40 paletas de color aplicables por negocio (menu_palette_id, migración 034) + botón "volver a original"; tipografía fija (Playfair/Space Grotesk); colorPalettes.ts en templates/shared/.
- Paletas originales del board por plantilla (MENU_PALETTES); modales/sheets heredan la paleta activa.
- Responsive: shell columna centrada max-width 480px (transform device-frame); carritos unificados IconShoppingCart; sheets vía createPortal.
- Selector dashboard colapsable (plantilla/paleta/efecto); sheet recogida "En mi mesa" primero.

### Sistema de chat (web + iOS + Android)
- Sub-chats: navegación in-place entre salas del negocio (query por business_id, gate can_access_room, candado+password verify_room_password).
- Presencia múltiple: main permanente + ancla del QR permanente + subchat visitado rotativo (hook usePresenceChannels en móvil, con AppState re-track al foreground).
- Scroll robusto: web (aspect-ratio en fotos guardando dims en metadata + re-scroll onLoad) y móvil (FlatList inverted, eliminó timers).
- Fixes de envío: foto iOS baja tras picker, web texto/foto baja (doble rAF), teclado/zoom web iOS (input font-size 16px), Android galería legacy:true + try/catch cámara.
- Visor de imágenes: web (lightbox portal, X en esquina de imagen, cierra click-fuera/Esc/X, zoom doble-clic) + móvil (react-native-image-viewing, pinch-zoom, X con safe-area, swipe-to-close).

### Seguridad de tipos (web + móvil)
- `ignoreBuildErrors` + `eslint.ignoreDuringBuilds` **removidos** de `web/next.config.ts`.
- Los 33+ errores de tsc arreglados (lotes 1-3 + cierre). **Web y móvil en 0 errores de tipo**; `next build` con type-check real. `database.types.ts` sano (sin la corrupción del wrapper JSON).

### Seguridad de pagos — los 4 huecos P0 CERRADOS (Tandas 1+2)
- **P0-2 / orders:** solo el webhook (service_role) crea órdenes (migr. 033, drop policy customer insert + revoke insert); orders UPDATE owner-only (035). El PaymentIntent ya recalculaba server-side.
- **Columnas financieras de businesses:** `plan/tax_rate/stripe_account_id/status/owner_id` ya no escribibles por el cliente (migr. 034/036, revoke + grant allow-list de 40 cols) + RPC `admin_set_business_status` para super-admin.
- **P0-3 / Edge Functions:** `stripe-connect` verifica propiedad (verifyCaller + assertOwnerOrAdmin, v9); `subscriptions.create_checkout` autentica+autoriza en el path app (Opción B, webhook intacto). Verificado en vivo: llamadas anónimas → 401.
- **P1 de integridad — TAMBIÉN CERRADOS (Tanda 3, 2026-07-08):** idempotencia de webhooks (039), modificadores recalculados (Fix #6), UNIQUE en orders.stripe_pi_id (037), is_verified protegido (038), JWT en ensure_customer/setup_intent. Ver "Sesión 2026-07-08" arriba y `docs/DISENO_FIX_INTEGRIDAD_PAGOS.md`.

### Docs consolidados (Fase A + B)
- Specs `.docx` → `.md`: `docs/SPEC.md`, `docs/DESIGN_SYSTEM.md`. Patrones técnicos → `docs/ARCHITECTURE.md`. Backlogs unidos → `docs/BACKLOG.md`. Diagnósticos resueltos, DEV_PLAN y `.docx` originales → `docs/archive/`. `CONTINUITY.md` + `CLAUDE.md` actualizados.

---

## What JChat 3.0 is
Location-based social + commerce mobile app. Proximity group chats tied to physical venues, in-venue ordering/gifting via Stripe, map-first UI, three-tier business subscriptions. Launch markets: USA + Dominican Republic.

## Stack
- Mobile: React Native (Expo SDK 56, React 19), React Navigation v7
- Web dashboard + web client: Next.js 16.2.9 (Turbopack)
- Backend: Supabase (Postgres, Edge Functions, Storage, Realtime, RLS) — project klfsgcfoahdtkojyqspd, ~47 tables
- Payments: Stripe Connect
- Maps: iOS = Apple Maps (no key); Android = Google Maps (key required); Web = Google Maps JS
- Builds: EAS — bundle id com.juangarciacruz.jchatapp
- Repo: github.com/jcgarcia007/jchat-3, branch main
- Local path: /Users/jcgarcia/Projects/JchatVer3.0 (NO space — has web/ + mobile/)
- Web prod: jchat-3.vercel.app
- Owner / super_admin: Juan Carlos García — user id 1bc7f2a8-4d71-4ea3-8c8d-cf059eb1b8de

## Key IDs
| Resource | Value |
|---|---|
| Supabase project | klfsgcfoahdtkojyqspd |
| Vercel project | prj_sGiwIjcnfUbrdzuITqY7ikEMI9tI (team team_eD4O1D2IRdcSlfIJxPhdyegy; CLI scope slug: carlos0cruz007-3843s-projects) |
| Google Cloud project | JChat (jchat-497118) |
| Test business | Bar XZX — slug bar-xzx-omd2, id 0478b8d5-5217-4369-9fa2-128dbe5b38f8 (Plantation FL), menu_mode 'web' |

## Workflow
GitHub MCP read-only for the planning Claude (create_or_update_file returns 403 — ALL writes via Claude Code CLI). Claude Code does all commits/migrations/builds. Supabase + Vercel + Stripe MCP connected. Planning Claude audits every SHA via get_commit, checks deploys via Vercel MCP, writes copy-paste Spanish prompts.

---

## Done / working (verified)

### Menú Web — public ordering page (web/, route /m/[slug]) — COMPLETE
Uber-Eats-style public menu at /m/{slug}, activated by menu_mode='web' (dashboard radio + QR hub button). Components in web/app/m/[slug]/: page.tsx (server, getMenuData + buildGroups) + MenuPageClient.tsx (client; BusinessHeader, CategoryNav, ItemCard with 10 hover effects, CustomizerSheet, CartSheet, PickupSheet, SuccessSheet, CartFAB, Backdrop).
- 10 card hover effects (lift/reveal/tilt/spotlight/duotone/glass/shine/focus/neon/polaroid) — migration 030, menu_card_effect column, owner picks in dashboard.
- Multi-photo per item (menu_item_photos table, migration 029). Category icons via 51 verified Tabler icons in web/lib/categoryIcons.tsx (migration 031, icon_url column).
- Customizer UX (this session): tap card opens customizer (+ button too, with stopPropagation to avoid double-fire); width-capped sheet (maxWidth 460, centered — full-width on phone, modal on desktop); clickable photo thumbnails change hero photo; default selections pre-chosen (single groups open with 1st option / hielo→Normal / picante→Medio) so "Agregar" is active immediately; "Notas para la cocina" textarea (maxLength 200) propagated to CartItem.notes, shown in cart with 📝.

### Modifier groups system (Uber-Eats-style options) — ALL 4 STEPS COMPLETE
Reusable option groups with min/max rules. Migration 032: modifier_groups (id, business_id, key, label, type single|multi, min_select, max_select, choices jsonb, sort) + menu_item_modifier_groups bridge. RLS: public SELECT + owner ALL via owner_id. menu_items.options NOT touched (retrocompat: legacy options→groups normalizer in buildGroups).
- PASO 1 (ce68a9f): tables + RLS + types.
- PASO 2 (88094b3 + 0c55fdc): customizer reads groups, single=radio/chips, multi=checkbox, min/max validation, live price.
- PASO 3 (2ff672a): seed for Bar XZX — 51 groups (4 reusable: tamano_coctel, hielo, tamano_cerveza, temp_cerveza), 60 bridge rows, 17 items.
- PASO 4 (cc04bc0): ModifierGroupsEditor in dashboard item modal (web/app/dashboard/menu/page.tsx) — create/edit/reorder/remove groups, reuse business-wide groups, DELETE+INSERT bridge sync. ALSO fixed database.types.ts JSON-wrapper corruption (+3233 lines, was hidden by ignoreBuildErrors).

### Maps on mobile — RESOLVED on all 3 platforms
- iOS = Apple Maps (no key). Android = Google Maps, REQUIRES JChat Android Maps key in mobile .env + .env.local. Web uses own Google Maps JS key.
- Long Android "blank map" saga root cause: mobile .env had the Web Dashboard key (HTTP-referrer restricted) → Android rejected it. Fix: Android Maps key in BOTH .env and .env.local.
- iOS Google Maps blank-screen (1368497a): react-native-maps plugin must use ARRAY form with iosGoogleMapsApiKey (bare string = Apple Maps only). Kept Google on both to preserve customMapStyle. Platform EAS env vars GOOGLE_MAPS_KEY_IOS / GOOGLE_MAPS_KEY_ANDROID.
- GPS hang fix: getCurrentPositionAsync in Promise.race w/ 8s timeout → Miami FALLBACK_REGION.

### Map control polish
- Zoom +/- (Android camera.zoom; iOS camera.altitude). Recenter-on-user button. Unified top layout via useSafeAreaInsets.

### Web-by-QR customer product (web/, routes /c/[token])
- /c/[token] → welcome → login-with-return → RoomHub (Menú · Llamar servicio · Entrar al chat). join_room_via_qr on mount.
- Web ChatRoom: text + realtime, role badges, incognito, photo, 15 themes, call-waiter.
- QR: dashboard modal, PNG/PDF, qr-code-styling. Migration 027 regenerate_room_qr_token. Token {biz-slug}-{main|sub}-{8hex}.

### Seed demo data (supabase/seeds/)
- seed_demo.sql + seed_cleanup.sql (marker-based, dry-run). 10 businesses, 50 users (userNN@seed.jchat.test / SeedPass123!).
- KEY FINDING: NO auto-profile trigger — auth.users does NOT create public.users. Manual profile needed.

### Chat
- Realtime presence (track gated on SUBSCRIBED; incognito respected). Photo → Storage (base64/ArrayBuffer, Hermes-safe). Smart auto-scroll. Report/Block aligned to schema. sender_name from public.users join + cache.
- Message-send RLS: requires room_members (expires_at>now()) via can_access_room, OR business owner. Real flow grants membership via room QR (join_room_via_qr, 24h).
- Tables blocks/reports/follows/dm_conversations/dm_messages exist with RLS.

---

## Security — status (todos los P0 + P1 de pagos CERRADOS)
- P0-1 (private rooms readable by any authed user) — CLOSED (migrations 019-020).
- P0-4 (users RLS) — CLOSED (migration 018, public_profiles view, username_available RPC).
- P0-2 (order totals not recalculated server-side) — **CLOSED** (recálculo server + orders solo por webhook, migr 033/035; Fix #6 modificadores).
- P0-3 (Edge Functions trust client IDs with service_role) — **CLOSED** (Tanda 2: stripe-connect ownership + subscriptions auth; Tanda 3 #7 JWT en payments).
- P1 integridad de pagos (idempotencia webhooks, UNIQUE stripe_pi_id, is_verified) — **CLOSED** (Tanda 3, migr 037-039). Ver "Sesión 2026-07-08".
- Los pagos reales siguen en Stripe **test mode**. Ver SECURITY_AUDIT.md / DISENO_FIX_INTEGRIDAD_PAGOS.md.

---

## DEBT (technical debt — carried)
- ✅ RESUELTO (julio 2026): ignoreBuildErrors + eslint.ignoreDuringBuilds REMOVIDOS de web/next.config.ts. Los 33+ errores de tsc arreglados en lotes 1/1.1/2/3 + cierre; `npx tsc --noEmit` = 0 y `next build` pasa con type-checking real. El bug de analytics/page.tsx (order_items.name inexistente) fue uno de los corregidos. Varias features super-admin (ban/trial/resolver-logs/announcements status) quedaron STUB porque sus columnas no existen en el schema — con TODO en el código.
- 🟡 Migrations 030/031 NOT registered in schema_migrations (applied via execute_sql) — registry desync.
- 🟡 menu_items has TWO legacy photo columns (image_url + photo_url) — consolidate someday.
- 🟡 Date.now() overflows Postgres int — use bigint/sequence for sort fields (was a runtime bug in migration 029).
- Android Maps key per-app restriction PENDING: package com.juangarciacruz.jchatapp + debug SHA-1 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25.
- Re-enable "Confirm email" in Supabase.
- expo-updates (OTA) not configured — needed before distributing to testers.
- EAS internal distribution (expo-dev-client + UDID) for physical iPhone.

---

## What's next — prioritized
1. **Pruebas manuales pendientes en dispositivo** (ver sección arriba, 4 bloques): Fase A+B social,
   Fix #6 modificadores, Fase D (gate de DM), Chat Fase 2 (TTL).
2. **GC de fotos huérfanas de `post-media`** — la purga TTL borra las filas de mensajes pero NO los
   binarios (Supabase bloquea el `DELETE` directo sobre `storage.objects`). Implementar limpieza vía
   Storage API (Scheduled Edge Function) cuando el costo de storage lo amerite. Ver D-14.
3. **Fase C pendiente (opcional):** tabla `saved_posts` + tab Saved en el perfil (diferido, no bloqueante).
4. **Chat Fase 3** (badge de "no leídos" por usuario/sala), **checkout web** (menú+carrito+Stripe;
   P0 de pagos ya cerrados → orden SOLO por webhook), **geo-verificación** (presencia física
   server-side PostGIS/Edge — regla de oro del producto, ver `docs/BACKLOG.md`).
5. Conectar dominio jchat.cloud al proyecto Vercel jchat-3 (ya en el team; pendiente www vs apex).

> Nota: los 4 P0 + los P1 de integridad de pagos quedaron CERRADOS el 2026-07-08. **Stage 1 social
> (Fases A+B+C+D) COMPLETO** a nivel código/BD y **Chat Fase 2 (TTL) aplicada** — solo faltan las
> pruebas manuales en dispositivo.

---

## Recent commits (newest first, all on main)
| Commit | Description |
|---|---|
| c63479c | Chat Fase 2 — purga TTL 24h de mensajes de sala vía pg_cron (excluye pinned; fotos diferidas por storage.protect_delete) |
| c06fde7 | Social Fase D — cablea Send DM (UserActionSheet→ChatRoom) vía start_dm + nav anidada a DMChat + Alert en DmGateError |
| 670e82e | Social Fase D — gate de DM (start_dm RPC + whoCanDMMe) + soft-hide en RLS dm_* + bucket dm-media privado |
| 9f70a0b | Menu web: tap-to-open customizer, width-cap, thumbnails, defaults, notes (also added gift toggle — REMOVED next, and dropped min-validation — left simple per owner) |
| cc04bc0 | PASO 4 — dashboard modifier groups editor + database.types.ts un-corrupt |
| 2ff672a | PASO 3 — modifier options seed for Bar XZX |
| 0c55fdc | PASO 2 — customizer reads groups (client) |
| 88094b3 | PASO 2 — buildGroups (server) |
| ce68a9f | PASO 1 — migration 032 modifier_groups tables |
| b1e46be | Bar XZX menu seed (5 cats, 17 items, 28 photos) |
| 1368497a | iOS Google Maps blank-screen fix (plugin array form) |

(NOTE: pending at session end — a commit to (A) remove gift toggle, (B) lower customizer sheet 92vh→85vh, (C) card photo aspectRatio 4/3→16/10. If present in git log, this status predates it.)
