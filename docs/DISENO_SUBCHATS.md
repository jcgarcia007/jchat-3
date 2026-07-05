# Diseño — Navegación de SUB-CHATS en el chat del usuario (in-place)

**Fecha:** 2026-07-05
**Archivo objetivo:** `web/app/c/[token]/room/ChatRoom.tsx`
**Estado:** PROPUESTA — pendiente de aprobar. NO se ha codificado nada.

Decisiones ya tomadas (recordatorio):
- Cambio de sala **in-place** (sin recargar): al tocar un sub-chat cambia `activeRoomId` y se re-suscribe mensajes + presencia.
- La barra muestra la **sala principal** del negocio + **todas** sus sub-salas.
- Sub-salas con `is_password_protected` → candado 🔒; al tocar, pedir contraseña vía `verify_room_password`.
- Layout: HEADER → **BARRA SUB-CHATS (nueva)** → USUARIOS EN LÍNEA → MENSAJES → INPUT.
- Sin badges de no leídos (fase posterior).

---

## Resumen del modelo de acceso (lo que habilita el diseño)

De las migraciones `001`, `004`, `019`, `026`:

| Elemento | Hallazgo | Implicación |
|---|---|---|
| RLS `rooms` SELECT | `"rooms: authenticated read" USING (true)` (`001:215`) | ✅ **Query directa** por `business_id`. No hace falta RPC para listar. |
| Columnas `rooms` | `id, business_id, parent_room_id, name, description, icon, color, slug, chat_theme_id, is_password_protected, password_hash, is_main, sort, qr_token, is_active` (base `001` + `004`) | Tenemos todo lo necesario por sala. |
| RLS `messages` | SELECT/INSERT gated por `can_access_room(room_id)` (`019`) | Sala **sin** password → cualquiera lee. Con password → `room_members` (24h) o dueño. |
| `can_access_room(_room_id)` | RPC SECURITY DEFINER, `grant ... authenticated` (`019`) | ✅ Fuente de verdad para "¿puedo entrar a esta sala?". |
| `verify_room_password(room_id, password)` | RPC, crea membresía 24h al acertar; lockout 5 fallos → 30 min; lanza `locked_out` con `detail=locked_until` (`019`, param fix `020`) | ✅ Para desbloquear salas con candado. |
| `join_room_via_qr(token)` | Da membresía 24h a la sala del QR **y a su `parent_room_id`** (`026`) | Al entrar por QR de una sub-sala, el usuario ya tiene acceso a la **principal** también. |

**Gap detectado (a corregir):** la carga inicial actual de `ChatRoom` (`ChatRoom.tsx:200-223`) exige una fila
en `room_members` para **toda** sala y muestra `no_access` si falta. Eso es **más estricto que la RLS**: una
sala hermana **sin** password es accesible por RLS sin membresía, pero el gate actual la bloquearía. Al pasar a
in-place hay que sustituir ese gate por `can_access_room` (o gatear en el handler del chip). Ver §2.

---

## 1) FUENTE DE DATOS — query de sub-salas

### Conclusión: **query directa, sin RPC nuevo.**
La RLS de `rooms` permite a cualquier `authenticated` leer todas las rooms, así que replicamos la query del
dashboard (`dashboard/chat/page.tsx:1074-1082`) del lado del usuario:

```ts
const { data } = await supabase
  .from("rooms")
  .select("id, name, icon, color, is_main, is_password_protected, parent_room_id, chat_theme_id, sort")
  .eq("business_id", businessId)
  .eq("is_active", true)
  .order("sort", { ascending: true });
```

- **`business_id`** ya lo tenemos como prop en `ChatRoom`. Trae principal (`is_main=true`) + todas las
  sub-salas del negocio en una sola llamada (mismo criterio que el dashboard).
- **Campos por sala:** `id, name, icon, color, is_main, is_password_protected, parent_room_id, chat_theme_id, sort`.
  - `chat_theme_id` incluido → al cambiar de sala se cambia también el **tema** (cada sala tiene el suyo).
  - `qr_token` **NO** se necesita: la navegación es in-place por `activeRoomId`, no por URL.
- **Orden:** por `sort` (igual que el dashboard). La principal suele ir primera; si no, se puede forzar
  `is_main` al frente en cliente.
- **Cuándo cargar:** un `useEffect` nuevo con dep `[businessId]` (el negocio no cambia entre sub-salas), una vez.

### Riesgo / nota
- Si el negocio tiene **solo la sala principal** (0 sub-salas) → la barra tendría 1 chip. Recomendación:
  **ocultar la barra** cuando `rooms.length <= 1` (no aporta navegación).
- La RLS `USING(true)` expone metadatos de rooms (nombre, candado) a cualquier autenticado — es **intencional**
  (comentario en `019`: "se deja legible para mostrar el candado y pedir la contraseña"). No filtra `password_hash`
  porque no lo seleccionamos. OK.

---

## 2) CAMBIO IN-PLACE — refactor de `ChatRoom.tsx`

### 2.1 `roomId` prop → `activeRoomId` estado
```ts
const [activeRoomId, setActiveRoomId] = useState(roomId); // init con la prop del server component
```
Derivar de la lista de salas (una vez cargada) el room activo, para header y tema:
```ts
const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null;
const theme = getChatTheme(activeRoom?.chat_theme_id ?? chatThemeId); // fallback a prop en el primer paint
const headerName = activeRoom?.name ?? roomName;                      // fallback a prop
```
→ `roomName` y `chatThemeId` props pasan a ser **valores iniciales**; la fuente viva es `activeRoom`.

### 2.2 Effects que hoy dependen de `roomId` (cambiar dep a `activeRoomId`)

| Effect | Ubicación | Hoy | Cambio |
|---|---|---|---|
| Carga inicial (membresía + mensajes) | `:192-239` dep `[roomId, userId]` | exige `room_members`, si no → `no_access` | dep `[activeRoomId, userId]`; **resetear** `messages=[]` y `loadState="loading"` al inicio; sustituir gate de membresía por `can_access_room` (ver §2.4) |
| Realtime mensajes | `:267-299` dep `[loadState, roomId, fetchMessage, scrollToBottom]` | canal `room-messages:${roomId}`, cleanup remueve canal | dep `[loadState, activeRoomId, ...]`; cleanup ya existe → re-suscribe limpio |
| Presencia | `:302-378` dep `[loadState, roomId, userId]` | canal `presence:${roomId}`, cleanup untrack+remove | dep `[loadState, activeRoomId, userId]`; cleanup ya existe |
| Auto-scroll en carga | `:244-258` dep `[loadState, scrollToBottom]` | — | sin cambio (re-corre al volver `loadState` a `ok`) |
| Role map | `:261-264` dep `[loadState, businessId]` | — | sin cambio (`businessId` no cambia entre sub-salas) |

**Reset obligatorio al cambiar de sala** (dentro del effect de carga inicial, al principio):
```ts
setMessages([]);
setLoadState("loading");
userScrolledUpRef.current = false;
```
Sin esto, tras tocar un chip se verían los mensajes de la sala anterior bajo el header nuevo hasta que
termine la nueva carga.

### 2.3 Fugas de suscripción (riesgo principal) — mitigación
- Cada uno de los dos effects de canales ya tiene **cleanup** que hace `removeChannel`. React ejecuta el
  cleanup del render anterior **antes** de correr el effect nuevo cuando cambia `activeRoomId` → el canal viejo
  se cierra antes de abrir el nuevo. **No hay fuga** siempre que la dep incluya `activeRoomId`.
- **Presencia** tiene setup asíncrono con guard `isMounted` + `presenceChannelRef`. Al cambiar de sala:
  cleanup viejo (untrack + removeChannel del ref) corre síncrono → limpia el ref → el nuevo effect reasigna.
  El `isMounted` es por-ejecución (closure), así que un `handleSync` tardío del canal viejo no toca estado nuevo.
  **Verificar en implementación** que no queden dos canales `presence:*` trackeando a la vez (test manual: saltar
  rápido entre 3 salas y comprobar en Supabase Realtime que solo hay 1 canal activo).
- `channelRef` / `presenceChannelRef` son refs compartidos entre renders: correcto, porque el cleanup los usa y
  los limpia antes del re-setup.

### 2.4 Access gate en el cambio — dónde y cómo
Dos capas, defensa en profundidad:

**(A) En el handler del chip (antes de cambiar de sala)** — decide si se puede entrar:
```
onTapRoom(room):
  if room.id === activeRoomId: return                      // ya activa
  if !room.is_password_protected: setActiveRoomId(room.id)  // sin candado → RLS permite, entra directo
  else:
     if unlockedRooms.has(room.id): setActiveRoomId(room.id)   // ya desbloqueada esta sesión
     else:
        const ok = await rpc can_access_room(_room_id=room.id) // ¿membresía 24h vigente (p.ej. por QR)?
        if ok: unlockedRooms.add(room.id); setActiveRoomId(room.id)
        else:  abrir modal de contraseña (ver §3)
```
- `unlockedRooms: Set<string>` en estado local evita RPCs repetidos al re-visitar una sala ya abierta.
- Para salas **sin** password se entra sin RPC (RLS ya lo permite).
- Para salas **con** password, primero se consulta `can_access_room` (por si ya tiene membresía del QR de
  entrada — recordar que un QR de sub-sala también dio acceso a la principal); solo si no, se pide contraseña.

**(B) En la carga inicial (red de seguridad)** — sustituir el gate de `room_members` por:
```ts
const { data: canAccess } = await supabase.rpc("can_access_room", { _room_id: activeRoomId });
if (!canAccess) { setLoadState("no_access"); return; }
// ...cargar mensajes
```
Esto corrige el mismatch: salas sin password ya no requieren `room_members`. (La query de mensajes por sí sola
no distingue "sala vacía" de "sin acceso" — la RLS devuelve 0 filas sin error — por eso el `can_access_room`
explícito.)

### 2.5 Tema, header y presencia al cambiar
- **Tema:** cambia solo, vía `activeRoom.chat_theme_id` (§2.1).
- **Header:** muestra `activeRoom.name`; el subtítulo `businessName` no cambia.
- **Presencia:** el effect re-suscribe a `presence:${activeRoomId}` y re-trackea al usuario → la barra de
  "usuarios en línea" refleja la sala activa. Correcto.

### 2.6 Tradeoffs conocidos
- La **URL no cambia** al saltar de sala (sigue siendo la del token de entrada). Un refresh vuelve a la sala del
  QR. Aceptable para "sin recargar"; si más adelante se quiere deep-link por sala, se añade `?room=` o se navega
  por `qr_token`. **Fuera de alcance ahora.**
- El **access gate del server** (`room/page.tsx`) solo protege la sala de entrada; el resto se protege por la RLS
  de `messages` + `can_access_room` en cliente. Consistente con el modelo actual.

---

## 3) COMPONENTE — barra de sub-chats

### Ubicación
Entre el HEADER (`ChatRoom.tsx:715-761`) y la PRESENCE BAR (`:763-845`). Nuevo bloque `flexShrink:0`.

### Estructura
- Contenedor `overflowX:auto`, `flexShrink:0`, `scrollbarWidth:none`, fondo `theme.topBg`,
  `borderBottom: 1px solid theme.border` (consistente con header/presence).
- Un **chip por sala** (de `rooms`, ordenadas por `sort`). Cada chip:
  - `icon` (emoji) si existe, + `name`.
  - Candado 🔒 pequeño si `is_password_protected` **y** no está en `unlockedRooms`.
  - Estado **activo** (`room.id === activeRoomId`): resaltado (fondo `theme.accent` / texto `theme.bubbleOutText`,
    o borde de acento). Inactivo: fondo `theme.bubbleInBg` tenue.
  - `onClick → onTapRoom(room)` (§2.4).
- Si `rooms.length <= 1` → no renderizar la barra.

### Modal de contraseña (recomendado sobre `prompt()`)
Reutilizar el patrón de **bottom-sheet** ya existente (Waiter sheet, `:1293-1489`) para coherencia visual:
- Campo password + botón "Entrar".
- Al enviar → `supabase.rpc("verify_room_password", { room_id: room.id, password })`.
  - `true` → `unlockedRooms.add(room.id)`, `setActiveRoomId(room.id)`, cerrar modal.
  - `false` → "Contraseña incorrecta".
  - Error con `message` incluyendo `locked_out` → "Demasiados intentos. Intenta en unos minutos."
- `prompt()` del navegador es un fallback rápido pero feo/bloqueante; **recomiendo el mini-modal**.

### Estados de carga del componente
- Mientras `rooms` carga: no mostrar barra (o skeleton corto). Como es 1 query rápida, aceptable ocultarla hasta
  tener datos.

---

## Resumen de cambios a implementar (checklist para la fase de código)

1. **Query nueva** de rooms del negocio (`useEffect [businessId]`) → estado `rooms`.
2. **`roomId` prop → `activeRoomId` estado**; derivar `activeRoom`, `theme`, `headerName`.
3. **Repuntar effects** (carga, realtime, presencia) de `roomId` → `activeRoomId`; **reset** de `messages`/`loadState` al cambiar.
4. **Gate de acceso**: reemplazar la query de `room_members` en la carga por `can_access_room`; añadir `unlockedRooms: Set`.
5. **Handler `onTapRoom`** con lógica password/`can_access_room`/`verify_room_password`.
6. **Componente barra de sub-chats** entre header y presence bar (oculto si ≤1 sala).
7. **Mini-modal de contraseña** (patrón bottom-sheet) o `prompt()` como fallback.

## Riesgos (priorizados)
1. **Fugas de suscripción** al saltar rápido entre salas → mitigado por cleanups existentes + dep `activeRoomId`; **verificar** manualmente que solo hay 1 canal de mensajes y 1 de presencia activos.
2. **Mismatch de gate `room_members` vs RLS** → corregido usando `can_access_room` (sin él, salas hermanas sin password se bloquearían por error).
3. **Password/lockout**: manejar `false`, `locked_out`, y no re-preguntar en salas ya desbloqueadas (`unlockedRooms`).
4. **Mensajes obsoletos** de la sala anterior visibles durante el switch → reset inmediato de `messages`/`loadState`.
5. **Tema/nombre** deben derivar de `activeRoom`, no de las props, tras el primer switch.

## Preguntas abiertas (para aprobar)
- ¿La sala **principal** siempre debe ir primera aunque el `sort` diga otra cosa? (propongo: sí, forzar `is_main` al frente).
- ¿Ocultar la barra si el negocio tiene **solo** la sala principal? (propongo: sí).
- ¿Mini-modal de contraseña (recomendado) o `prompt()` para v1?
