# Inventario — Chat móvil (`mobile/screens/chat/ChatRoomScreen.tsx`)

**Fecha:** 2026-07-05
**Objetivo:** portar al móvil la **presencia múltiple** (main + ancla + visitado) ya hecha en web
(`web/app/c/[token]/room/ChatRoom.tsx`, commit `e851fb6`, diseño en `docs/DISENO_SUBCHATS.md`) y arreglar
el **bug de scroll móvil** (`docs/DIAGNOSTICO_CHAT_SCROLL.md`). Este documento es solo inventario — **no** se
cambió código.

> **Hallazgo mayor:** el móvil YA está más avanzado que el web original. Ya tiene navegación de sub-chats
> (`SubRoomTabs`), sheet de contraseña (`PasswordEntrySheet`) y presencia — pero la presencia es de **un solo
> canal** (`presence:${activeRoomId}`), exactamente el modelo que el web tenía **antes** del cambio.
> **El port NO es "añadir sub-chats" (ya existen); es cambiar la presencia de 1 canal → múltiple**, + fix de scroll.

---

## 1) Estructura general

- **Componente:** `export default function ChatRoomScreen()` — pantalla de un Native Stack.
- **Props / params:** no recibe props directas; usa `useRoute<ChatRoomRoute>()` →
  **`route.params.id`** (`rootRoomId`, `ChatRoomScreen.tsx:184`). Ese id es la sala de entrada (= el **ancla**).
- **Navegación hasta aquí:** `MainStackParamList` en `navigation/AppNavigator.tsx:52` → `ChatRoom: { id: string }`,
  deep link `room/:id` (`AppNavigator.tsx:95`). Se navega con `navigation.navigate('ChatRoom', { id })` desde:
  - `screens/nearby/NearbyScreen.tsx:469`
  - `screens/map/MapScreen.tsx:354` (`roomId ?? businessId`)
  - `screens/orders/OrderTrackingScreen.tsx:238`
- **QR:** en móvil **no hay** RPC `resolve_room_qr` ni `join_room_via_qr`; se navega con el **room id directo**.
  → El ancla es simplemente `route.params.id`; no hace falta resolver token (a diferencia de web).
- **Gate de entrada (incógnito):** antes de entrar se muestra un `Modal` con `IncognitoToggle` (`entryVisible`,
  `:189`, `:850-921`). Al confirmar (`handleEnter`, `:542`) se fija `enteredIncognito` (bloqueado toda la
  sesión) y `entryVisible=false`. **Mensajes y presencia solo se suscriben tras entrar** (`entryVisible` gate).
- `user` de `useAuth()`; temas de `getChatTheme(room.chat_theme_id)`; `useThemeColors()`.

---

## 2) Carga de mensajes

- **Estado:** `messages: ChatMessage[]` (`:207`), `loadingMessages`, `hasMore`, `oldestTimestampRef`.
- **Query** (`loadMessages`, `:390-433`):
  ```ts
  supabase.from('messages')
    .select('id, room_id, user_id, body, type, media_url, metadata, is_system, created_at,
             sender:users!messages_user_id_fkey(display_name, username)')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(50)            // PAGE_SIZE
    // + .lt('created_at', before) para paginar hacia atrás
  ```
  Luego `.reverse()` → ascendente para render. ✅ Correcto (trae los más nuevos).
- **Infinite scroll hacia arriba:** `onStartReached` → `handleScrollTop` (`:793`) usa `oldestTimestampRef` como
  cursor `before` y **prepende** los más viejos (`:423-425`). (Web solo carga 50 una vez — móvil es más completo.)
- **Disparo:** effect `[activeRoomId, initialLoading, entryVisible, loadMessages]` (`:435-438`).
- **Sender name:** cache `userNameCacheRef` (map user_id→nombre) para resolver realtime (`:410-416`).

---

## 3) Realtime de mensajes

**Mismo patrón que web.** `:442-473`:
```ts
supabase.channel(`room-messages:${activeRoomId}`)
  .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages',
      filter:`room_id=eq.${activeRoomId}` }, (payload) => { … append dedup … })
  .subscribe();
return () => { void supabase.removeChannel(channel); };
```
- **Deps:** `[activeRoomId, entryVisible]`. Cleanup remueve el canal → re-suscribe limpio al cambiar de sala.
- Diferencia con web: móvil **no** hace `fetchMessage` con join tras el INSERT; usa el `userNameCacheRef` para el
  `sender_name` (`:457-458`). Append con dedup por id.

---

## 4) Presencia — **EXISTE, pero de UN SOLO CANAL** (a portar a múltiple)

`:475-537`. Hoy:
```ts
const presenceChannel = supabase.channel(`presence:${activeRoomId}`, { config:{ presence:{ key:user.id } } });
presenceChannel.on('presence',{event:'sync'},rebuildUsers)
  .on('presence',{event:'join'},rebuildUsers)
  .on('presence',{event:'leave'},rebuildUsers)
  .subscribe(async (s)=>{ if(s==='SUBSCRIBED') await presenceChannel.track(presencePayload); });
return () => { void presenceChannel.untrack().then(()=>supabase.removeChannel(presenceChannel)); };
```
- **Payload** (`PresencePayload`, `:477-502`): `user_id, display_name, avatar_url, is_incognito, nickname`.
  El nombre/avatar dependen de `enteredIncognito` (incógnito → nickname + sin avatar).
- **Deps:** `[activeRoomId, entryVisible, user, enteredIncognito]` → el canal **sigue a la sala activa**
  (sale de la anterior, entra a la nueva). = modelo "1 canal" que el web tenía antes.
- **Lista de en línea:** `rebuildUsers` (`:508`) → `usersInRoom: UserSummary[]` (`:221`) + `activeCount` (`:222`),
  deduplicados por `user_id`. Se muestran en el **ChatTopBar** (fila de avatares + contador), no en una barra
  aparte (ver §7).

**→ Port necesario (lo delicado):** replicar el modelo de `DISENO_SUBCHATS.md §2.5`:
- `presence:${mainRoomId}` permanente + `presence:${anchorRoomId}` permanente (si ≠ main) + `presence:${visitedRoomId}` rotativo.
- `anchorRoomId = rootRoomId` (route.params.id); `mainRoomId = subRooms.find(r=>r.is_main)?.id`.
- Pasar de `usersInRoom` (una lista) a **`presenceByRoom` keyed por sala**, y derivar la lista visible del
  `activeRoomId` (como web).
- Payload de incógnito aplicado a los **tres** canales.
- **Refs separados** por canal + cuidado con no duplicar canal (visitado==main/ancla; ancla==main).
- **AppState (ver §8):** NUEVO trabajo respecto a web — en background los canales pueden caerse; al volver a
  foreground hay que re-trackear. Web no lo maneja (pestaña de navegador).

---

## 5) Navegación de rooms / sub-chats — **YA EXISTE**

- **Componente:** `SubRoomTabs` (`mobile/components/chat/SubRoomTabs.tsx`) — `ScrollView horizontal` de tabs,
  candado (`IconLock`) si `is_password_protected && !unlockedRoomIds.has(id)`, activo con borde inferior.
  Se **oculta si `rooms.length <= 1`** (`SubRoomTabs.tsx:78`) — misma regla que la decisión final de web.
- **Query de sub-rooms** (`ChatRoomScreen.tsx:368-378`):
  ```ts
  const parentId = typedRoom.is_main ? typedRoom.id : (typedRoom.parent_room_id ?? typedRoom.id);
  supabase.from('rooms')
    .select('id, name, is_main, is_password_protected, sort')
    .or(`id.eq.${parentId},parent_room_id.eq.${parentId}`)
    .order('sort');
  ```
  ⚠️ Diferencias con la query web (`DISENO_SUBCHATS.md §1`):
  - Móvil scopea al **subárbol de un parent** (`.or(id.eq.parent, parent_room_id.eq.parent)`); web scopea a
    **todo el `business_id`** (`.eq('business_id', …).eq('is_active', true)`).
  - Móvil **no** selecciona `chat_theme_id, icon, color` ni filtra `is_active`. Para el port conviene alinear
    (traer `chat_theme_id` para cambiar tema al saltar, e `icon`/`color` si se quieren chips con icono).
- **Cambio in-place:** `handleSelectSubRoom` (`:703`) resetea (`setMessages([])`, refs de scroll,
  `hasDoneInitialScrollRef=false`, `setInitialScrollDone(false)`) y cambia `activeRoomId`. Ya hace reset limpio
  de mensajes al cambiar. ✅
- **Password:** `handleSelectProtectedSubRoom` → `PasswordEntrySheet` → `handlePasswordSuccess` agrega a
  `unlockedRoomIds` y entra (`:714-731`).
- **Gate de acceso:** móvil **no** llama `can_access_room` en la carga (web sí, tras el fix). Confía en tabs +
  password sheet. Nota para el port: web usa `can_access_room` como red de seguridad; evaluar si replicarlo.

---

## 6) Scroll (el bug pendiente) — **sigue igual que el diagnóstico**

Confirmado idéntico a `DIAGNOSTICO_CHAT_SCROLL.md §2`:
- **FlatList normal (NO invertida)** (`:976-1021`).
- **3 scrolls temporizados** `scrollToEnd({animated:false})` a **0 / 150 / 400 ms** (`:276-303`); el de 400 ms
  marca `hasDoneInitialScrollRef=true` + `setInitialScrollDone(true)`.
- `onLayout` re-dispara `scrollToEndAfterRender` mientras el scroll inicial no esté "done" (`:984-992`).
- `onContentSizeChange` → `handleContentSizeChange` (`:811-828`), gateado en `hasDoneInitialScrollRef` +
  `isNearBottomRef`.
- `maintainVisibleContentPosition` solo tras `initialScrollDone` (`:982`).
- **KAV anidado:** `KeyboardAvoidingView` en la pantalla (`:971-975`, behavior padding/height) **+** otro KAV
  dentro de `ChatInput` — causa raíz de la regresión "~3 mensajes corto" citada en los comentarios del código
  (`:266-271`): el KAV redistribuye altura **después** de los 400 ms.
- **Imágenes:** `MessageBubble` usa dimensiones **fijas** (220×165 etc.) → no crecen al cargar; el problema NO
  es de imágenes (a diferencia de web, ya arreglado). Es **timing/KAV**.

**Fix perfilado (del diagnóstico §Resumen):** desacoplar el scroll de los timers fijos; engancharlo a
`onContentSizeChange`/`onLayout` durante una ventana "cerca del fondo" hasta que el layout (incluida la
reacomodación del KAV) se estabilice. Alternativa robusta a evaluar: `FlatList inverted` (elimina la necesidad
de scrollToEnd, pero cambia el orden de datos y la lógica de paginación).

---

## 7) Layout actual (orden de secciones en el render)

`:938-1123` — `<View container>`:
```
ChatTopBar                                   (:941)  ← [Back][biz icon+name][activeCount][Menu]
  └─ children = SubRoomTabs                  (:951)  ← scroll horizontal de sub-salas
  └─ (dentro de ChatTopBar) fila de avatares de usersInRoom  ← "usuarios en línea"
PinnedBanner                                 (:962)  ← banner sticky (Task 2.5)
KeyboardAvoidingView                         (:971)
  ├─ FlatList (mensajes)                     (:976)  ← MAIN CHAT (flex)
  ├─ CheckInBar (si main + check_in_enabled) (:1024)
  └─ ChatInput                               (:1035) ← input (tiene su propio KAV interno)
Sheets (overlays): PasswordEntrySheet, UserActionSheet, PinMessageSheet, CreateOfferSheet, ServiceCallSheet
```
**Nota:** la "presencia / usuarios en línea" vive **dentro de ChatTopBar** (fila de avatares bajo los tabs),
no como una barra separada como en web. `ChatTopBar` (`components/chat/ChatTopBar.tsx`) recibe `usersInRoom` +
`activeCount` y los pinta (comentario de layout en `ChatTopBar.tsx:7-10`).

---

## 8) Diferencias RN vs Web que afectan el port

### a) Ciclo de vida de la app (`AppState`) — **NO se maneja hoy**
- `grep -rn "AppState"` en `mobile/` → **0 resultados**. No hay ningún listener de background/foreground.
- **Impacto en presencia múltiple:** con un solo canal atado a `activeRoomId` el problema es menor (al volver,
  cualquier cambio de estado re-corre el effect). Con **canales permanentes** (main + ancla que **no** dependen
  de `activeRoomId`), si el socket se cae en background, al volver a foreground **nadie los re-suscribe** →
  el usuario podría dejar de aparecer en main/ancla. **Este es el punto delicado del port:**
  - Diseñar un listener `AppState.addEventListener('change', …)` que, al pasar a `'active'`, verifique/re-trackee
    (o reconstruya) los canales permanentes y el visitado; opcionalmente `untrack` al ir a `'background'`.
  - Considerar que Supabase Realtime puede reconectar el socket solo, pero el `track()` de presencia **no** se
    re-emite automáticamente tras una reconexión → hay que re-`track`.
- Sugerencia: encapsular la presencia múltiple en un hook (`usePresenceChannels`) que centralice montaje,
  `presenceByRoom`, y el manejo de AppState, para no ensuciar el componente.

### b) Listas horizontales
- `SubRoomTabs` usa **`ScrollView horizontal`** (`SubRoomTabs.tsx:83`), no FlatList.
- `ChatTopBar` usa **`ScrollView`** para la fila de avatares (import en `ChatTopBar.tsx:31`).
- Para chips/tabs cortos, `ScrollView horizontal` es el patrón usado en el proyecto → mantenerlo.

### c) Modales / bottom-sheets
- Se usan con **`Modal` nativo de RN** (`transparent + animationType="slide" + statusBarTranslucent`) +
  `KeyboardAvoidingView` + scrim `TouchableWithoutFeedback`. Ejemplos: gate de incógnito
  (`ChatRoomScreen.tsx:853`), `PasswordEntrySheet.tsx:245`, y los demás sheets.
- **No hay librería de bottom-sheet** (ni `@gorhom/bottom-sheet`); todo es `Modal` + estilos propios.
- El `PasswordEntrySheet` ya existe y usa `verifyRoomPassword` (`services/roomAccess`) con manejo de lockout
  server-side (`locked_out`) + tracking de intentos cliente. **Reutilizable tal cual** para el port (no hace
  falta un modal nuevo como en web).

---

## Resumen para diseñar el port (siguiente fase)

**Lo que YA existe en móvil (no rehacer):** sub-room tabs, cambio in-place con reset de mensajes, password sheet
con lockout, presencia de 1 canal, lista de en línea en el TopBar.

**Lo que hay que PORTAR/CAMBIAR:**
1. **Presencia 1 canal → múltiple** (main permanente + ancla=`rootRoomId` permanente + visitado rotativo);
   `usersInRoom` pasa a derivarse de `presenceByRoom[activeRoomId]`. Payload incógnito en los 3 canales.
   Riesgos del diseño web (no duplicar canal, deps del permanente sin `activeRoomId`) aplican igual.
2. **AppState** (NUEVO, no existe en web): re-trackear canales permanentes + visitado al volver a foreground;
   opcional untrack en background. Punto más delicado.
3. **Fix de scroll**: desacoplar de los timers 0/150/400 ms y del KAV anidado (o migrar a `inverted`).
4. **(Opcional) Alinear la query de sub-rooms** con web (traer `chat_theme_id` para tema por sala; evaluar
   scope business vs subárbol) y **(opcional) `can_access_room`** como red de seguridad en la carga.
