# Diseño — Navegación de SUB-CHATS en el chat del usuario (in-place)

**Fecha:** 2026-07-05
**Archivo objetivo:** `web/app/c/[token]/room/ChatRoom.tsx`
**Estado:** PROPUESTA — pendiente de aprobar. NO se ha codificado nada.

Decisiones ya tomadas (recordatorio):
- Cambio de sala **in-place** (sin recargar): al tocar un sub-chat cambia `activeRoomId`, se re-suscribe la carga
  y el realtime de **mensajes**, y la **presencia** se ajusta según el modelo múltiple (ver §2.5 — ya NO es "un
  solo canal de presencia que sigue a `activeRoomId`").
- La barra muestra la **sala principal** del negocio + **todas** sus sub-salas.
- Sub-salas con `is_password_protected` → candado 🔒; al tocar, pedir contraseña vía `verify_room_password`.
- Layout: HEADER → **BARRA SUB-CHATS (nueva)** → USUARIOS EN LÍNEA → MENSAJES → INPUT.
- Sin badges de no leídos (fase posterior). Ver §2.5.1 (presencia ≠ lectura) — relevante para esa fase.

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
| Presencia | `:302-378` dep `[loadState, roomId, userId]` | **un** canal `presence:${roomId}` que sigue a la sala | **REEMPLAZADO** por el modelo múltiple de §2.5: canales permanentes (main + ancla) + un canal rotativo (visitado). Ya NO es un solo canal atado a `activeRoomId`. |
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
- **Realtime de mensajes** (canal único `room-messages:${activeRoomId}`): el effect ya tiene **cleanup** que hace
  `removeChannel`. React ejecuta el cleanup del render anterior **antes** de correr el effect nuevo cuando cambia
  `activeRoomId` → el canal viejo se cierra antes de abrir el nuevo. **No hay fuga** con la dep `activeRoomId`.
- **Presencia** ya NO es un canal único que sigue a `activeRoomId`; pasa a ser **varios canales simultáneos**
  (main permanente + ancla permanente + visitado rotativo). El manejo de montaje/desmontaje y sus fugas se
  detalla en **§2.5**. La regla clave: los canales permanentes se montan **una vez** (no en cada switch) y solo
  el canal **visitado** rota. Refs separados por canal para no pisar el cleanup.
- `channelRef` (mensajes) es un ref compartido entre renders: correcto, porque el cleanup lo usa y lo limpia
  antes del re-setup.

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

### 2.5 Tema, header y PRESENCIA MÚLTIPLE al cambiar

- **Tema:** cambia solo, vía `activeRoom.chat_theme_id` (§2.1).
- **Header:** muestra `activeRoom.name`; el subtítulo `businessName` no cambia.

#### Modelo de presencia MÚLTIPLE (reemplaza el de "1 canal que sigue a activeRoomId")

Un usuario aparece como **presente / en línea en VARIAS salas a la vez**. Tres tipos de presencia:

1. **MAIN — permanente.** Todo usuario aparece en la sala principal (`is_main`) del negocio **siempre**, sin
   importar por qué QR entró. Mientras la sesión viva, está trackeado en `presence:${mainRoomId}`.
2. **ANCLA (anchor) — permanente.** El room del **QR de entrada** (el `roomId` que llega como prop inicial, el
   que resolvió `resolve_room_qr(token)`). Fijo **toda la sesión**. Si entró por el QR de Mesa 5, aparece en
   Mesa 5 de forma permanente. Si entró por el QR del **Main**, su ancla **es** el Main (no queda anclado a
   ningún subchat → no añade un canal extra).
3. **VISITADO — temporal, UNO a la vez.** Al abrir (visitar) un subchat, aparece ahí; al moverse a otro,
   **sale del anterior**. Solo un "visitado" activo a la vez. Si el visitado coincide con main o ancla, no se
   duplica canal (ya está cubierto por un permanente).

**Ejemplo** (entró por Mesa 5 → `anchorRoomId = Mesa5`):

| Acción | Presente en |
|---|---|
| Viendo Mesa 5 | Main + Mesa5 |
| Visita Mesa 6 | Main + Mesa5 + Mesa6 |
| Visita Mesa 7 | Main + Mesa5 + Mesa7  *(salió de Mesa6)* |
| Va al Main | Main + Mesa5  *(el visitado se limpia; main y ancla siguen)* |

#### Cómo se determinan los IDs

```ts
const anchorRoomId = roomId;                          // prop inicial = room del QR de entrada. Constante de sesión.
const mainRoomId   = rooms.find(r => r.is_main)?.id;  // de la query de rooms (§1). Puede tardar en resolverse.
// activeRoomId = el que se está viendo (cambia al navegar).
```
`anchorRoomId` no cambia nunca. `mainRoomId` sale de la query de rooms (async) → los canales permanentes se
montan cuando ambos IDs están disponibles.

#### Montaje / desmontaje de canales de presencia

**Canales PERMANENTES (se montan UNA vez, no en cada switch):**
- `presence:${mainRoomId}` → `track` permanente mientras viva la sesión.
- `presence:${anchorRoomId}` → `track` permanente **solo si `anchorRoomId !== mainRoomId`** (si el ancla es el
  main, ya está cubierto → no montar un 2º canal).
- Se montan en un `useEffect` cuyas deps son `[mainRoomId, anchorRoomId, userId]` (valores estables → corre en
  esencia una vez, cuando `mainRoomId` se resuelve). Cleanup: `untrack` + `removeChannel` de **ambos** al
  desmontar el componente. **No** dependen de `activeRoomId` → no rotan al navegar.

**Canal ROTATIVO (visitado):**
- `presence:${visitedRoomId}` donde `visitedRoomId = activeRoomId` **solo si** `activeRoomId` no es main ni ancla
  (si es main o ancla, no hay canal visitado — la presencia ya la cubre un permanente → `visitedRoomId = null`).
- `useEffect` con dep `[visitedRoomId, userId]`: al cambiar `visitedRoomId`, el cleanup hace `untrack` +
  `removeChannel` del anterior y monta/trackea el nuevo. Si `visitedRoomId === null`, no monta nada.

```ts
// Derivación del canal rotativo:
const visitedRoomId =
  activeRoomId && activeRoomId !== mainRoomId && activeRoomId !== anchorRoomId
    ? activeRoomId
    : null;
```

**Refs separados por canal** (`mainPresenceRef`, `anchorPresenceRef`, `visitedPresenceRef`) para que el cleanup
de uno no pise a otro. El `trackPayload` (perfil del usuario) se calcula una vez y se reutiliza en los tres.

#### Qué alimenta la barra "USUARIOS EN LÍNEA"

La lista visible de en línea corresponde a la **sala abierta en pantalla** (`activeRoomId`): mostramos el
`presenceState()` del canal de esa sala. Como el usuario **siempre** está trackeado en la sala que está viendo
(porque es main, ancla, o visitado), su propio avatar aparece correctamente en la lista de la sala activa.
→ La barra lee la presencia del canal correspondiente a `activeRoomId` (sea permanente o rotativo).

#### Fugas / riesgos específicos de presencia múltiple
- **Doble canal para el mismo room:** evitar montar `visitedRoomId` cuando coincide con main/ancla (regla de
  arriba) y no montar el canal de ancla cuando `anchorRoomId === mainRoomId`. Sin esto, el usuario podría
  aparecer/trackearse dos veces en el mismo room.
- **Permanentes que no deben rotar:** si por error las deps del effect permanente incluyeran `activeRoomId`,
  main/ancla se re-montarían en cada navegación (parpadeo de join/leave). Deps SOLO `[mainRoomId, anchorRoomId, userId]`.
- **`mainRoomId` tardío:** hasta que la query de rooms resuelva, `mainRoomId` es `undefined` → el effect
  permanente no monta aún. Al resolver, monta. Aceptable (breve ventana sin presencia en main). El canal del
  ancla (que sí conocemos desde el inicio vía prop) puede montarse antes; alternativamente, esperar a ambos por
  simplicidad. **Decisión de implementación:** montar ancla apenas exista; montar main al resolver la query.
- **Verificación manual:** entrar por QR de un subchat, navegar entre 3 subchats y volver al main; comprobar en
  Supabase Realtime que hay exactamente: 1 canal main (siempre) + 1 canal ancla (si ancla≠main) + a lo sumo 1
  canal visitado, y que al volver al main el visitado desaparece.

#### 2.5.1 Presencia ≠ lectura (nota para la fase futura de NO LEÍDOS — no implementar ahora)

Estar **presente** en un room (tu nombre en su lista de en línea) **NO** significa estar **leyéndolo**. Solo el
room **abierto en pantalla** (`activeRoomId`) cuenta como "leído / atendido". En la fase futura de no-leídos, los
mensajes de rooms donde estás presente (main, ancla, visitado previo) pero que **no** tienes abiertos contarán
como **no leídos**. Por ahora **no** se implementan badges ni contadores; solo se deja el modelo de presencia
correcto y anotada esta distinción.

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
- **Orden:** `is_main` primero, luego el resto por `sort`. **Barra siempre visible** (aunque haya 1 sola sala).

### Modal de contraseña (mini bottom-sheet)
Reutilizar el patrón de **bottom-sheet** ya existente (Waiter sheet, `:1293-1489`) para coherencia visual:
- Campo password + botón "Entrar".
- Al enviar → `supabase.rpc("verify_room_password", { room_id: room.id, password })`.
  - `true` → `unlockedRooms.add(room.id)`, `setActiveRoomId(room.id)`, cerrar modal.
  - `false` → "Contraseña incorrecta".
  - Error con `message` incluyendo `locked_out` → "Demasiados intentos. Intenta en unos minutos."

### Estados de carga del componente
- Mientras `rooms` carga: no mostrar barra (o skeleton corto). Como es 1 query rápida, aceptable ocultarla hasta
  tener datos.

---

## Resumen de cambios a implementar (checklist para la fase de código)

1. **Query nueva** de rooms del negocio (`useEffect [businessId]`) → estado `rooms`. Derivar `mainRoomId`.
2. **`roomId` prop → `activeRoomId` estado**; `anchorRoomId = roomId` (constante); derivar `activeRoom`, `theme`, `headerName`.
3. **Repuntar effects de MENSAJES** (carga, realtime) de `roomId` → `activeRoomId`; **reset** de `messages`/`loadState` al cambiar.
4. **PRESENCIA MÚLTIPLE (§2.5):** reemplazar el effect de 1 canal por:
   - effect **permanente** `[mainRoomId, anchorRoomId, userId]` → canales main + ancla (ancla solo si ≠ main);
   - effect **rotativo** `[visitedRoomId, userId]` → canal del subchat visitado (null si activo == main/ancla);
   - refs separados por canal; la barra "en línea" lee la presencia del canal de `activeRoomId`.
5. **Gate de acceso**: reemplazar la query de `room_members` en la carga por `can_access_room`; añadir `unlockedRooms: Set`.
6. **Handler `onTapRoom`** con lógica password/`can_access_room`/`verify_room_password`.
7. **Componente barra de sub-chats** entre header y presence bar (**siempre visible**, `is_main` primero).
8. **Mini-modal de contraseña** (patrón bottom-sheet).

## Riesgos (priorizados)
1. **Presencia múltiple — doble canal / rotación indebida:** no montar canal visitado si coincide con main/ancla;
   no montar canal de ancla si `anchorRoomId === mainRoomId`; deps del effect permanente **sin** `activeRoomId`
   (si no, main/ancla parpadean join/leave en cada navegación). Ver §2.5.
2. **Fugas de suscripción** al saltar rápido entre salas → mensajes: cleanup existente + dep `activeRoomId`;
   presencia: refs separados por canal + cleanup por effect. **Verificar** manualmente el conteo de canales (§2.5).
3. **Mismatch de gate `room_members` vs RLS** → corregido usando `can_access_room` (sin él, salas hermanas sin password se bloquearían por error).
4. **Password/lockout**: manejar `false`, `locked_out`, y no re-preguntar en salas ya desbloqueadas (`unlockedRooms`).
5. **Mensajes obsoletos** de la sala anterior visibles durante el switch → reset inmediato de `messages`/`loadState`.
6. **Tema/nombre** deben derivar de `activeRoom`, no de las props, tras el primer switch.
7. **`mainRoomId` tardío** (query async): el canal permanente del main se monta al resolver; ancla puede montarse antes (§2.5).

## Decisiones resueltas (2026-07-05)
- **Orden:** la sala **principal** (`is_main`) va **siempre primera**, luego el resto por `sort`.
- **Barra siempre visible:** se muestra **aunque el negocio tenga solo la sala principal** (no se oculta con ≤1 sala).
  → Anula la nota de §1 y §3 sobre "ocultar si `rooms.length <= 1`".
- **Password UI:** **mini-modal** (patrón bottom-sheet, estilo Waiter sheet). No `prompt()`.
