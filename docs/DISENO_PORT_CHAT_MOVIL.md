# Diseño — Port del chat móvil (presencia múltiple + AppState + FlatList inverted)

**Fecha:** 2026-07-05
**Archivo objetivo:** `mobile/screens/chat/ChatRoomScreen.tsx` (+ nuevo hook)
**Estado:** PROPUESTA — pendiente de aprobar. NO se ha codificado nada.
**Referencias:** `docs/DISENO_SUBCHATS.md` (§2.5 presencia web), `docs/INVENTARIO_CHAT_MOVIL.md`, `docs/DIAGNOSTICO_CHAT_SCROLL.md`.

Decisiones tomadas:
- Presencia: 1 canal → **múltiple** (main permanente + ancla permanente + visitado rotativo), igual que web.
- AppState: **opción (a)** — re-trackear al volver a foreground (`'active'`); **NO** untrack en background.
- Scroll: **opción (B)** — migrar la FlatList a **`inverted`** (elimina timers 0/150/400 ms y la pelea con KAV).

Modelo (recordatorio):
- `anchorRoomId = route.params.id` (room de entrada; en móvil llega directo, sin resolución de QR).
- `mainRoomId = subRooms.find(r => r.is_main)?.id`.
- El móvil YA tiene sub-room tabs, password sheet y cambio in-place con reset → **no se rehace**.

---

## 1) PRESENCIA MÚLTIPLE — hook `usePresenceChannels`

### Ubicación
`mobile/screens/chat/usePresenceChannels.ts` (colocado junto a la pantalla que lo consume).

### Firma
```ts
interface UsePresenceChannelsArgs {
  mainRoomId: string | undefined;   // de la query de sub-rooms (async → puede tardar)
  anchorRoomId: string;             // route.params.id (estable toda la sesión)
  activeRoomId: string;             // la sala en pantalla (cambia al navegar)
  user: User | null;                // de useAuth()
  enteredIncognito: IncognitoState | null; // define display_name/avatar del payload
  entryVisible: boolean;            // gate: no montar hasta que el usuario entra
}

interface UsePresenceChannelsResult {
  presenceByRoom: Record<string, UserSummary[]>; // keyed por roomId
}

export function usePresenceChannels(args: UsePresenceChannelsArgs): UsePresenceChannelsResult;
```
El componente consume el hook y **deriva la lista visible**:
```ts
const { presenceByRoom } = usePresenceChannels({ ... });
const usersInRoom = presenceByRoom[activeRoomId] ?? [];
const activeCount = usersInRoom.length;
```
→ Reemplaza el estado `usersInRoom`/`activeCount` y todo el effect de presencia actual (`ChatRoomScreen.tsx:475-537`).

### Estado y refs internos del hook
```ts
const [presenceByRoom, setPresenceByRoom] = useState<Record<string, UserSummary[]>>({});
const mainRef    = useRef<RealtimeChannel | null>(null);
const anchorRef  = useRef<RealtimeChannel | null>(null);
const visitedRef = useRef<RealtimeChannel | null>(null);
// Payload siempre-actual para el listener de AppState (que se registra una sola vez).
const payloadRef = useRef<PresencePayload | null>(null);
```

### Payload (incógnito) — memoizado
Igual que hoy (`:488-502`), pero centralizado y guardado en `payloadRef` cada render:
```ts
const payload = useMemo<PresencePayload | null>(() => {
  if (!user) return null;
  const inc = enteredIncognito;
  const displayName = inc?.enabled ? (inc.nickname ?? 'Anonymous')
    : ((user.user_metadata?.username as string) ?? user.email ?? 'User');
  const avatarUrl = inc?.enabled ? null : ((user.user_metadata?.avatar_url as string) ?? null);
  return { user_id: user.id, display_name: displayName, avatar_url: avatarUrl,
           is_incognito: inc?.enabled ?? false, nickname: inc?.nickname ?? null };
}, [user, enteredIncognito]);
useEffect(() => { payloadRef.current = payload; }, [payload]);
```

### Helper de suscripción (uno por canal) — evita repetir sync/join/leave
```ts
function subscribePresence(
  roomId: string, userId: string, payload: PresencePayload,
  onState: (roomId: string, users: UserSummary[]) => void,
): RealtimeChannel {
  const ch = supabase.channel(`presence:${roomId}`, { config: { presence: { key: userId } } });
  const rebuild = () => {
    const state = ch.presenceState<PresencePayload>();
    const users = Object.values(state).flat()
      .filter((p, i, a) => a.findIndex(x => x.user_id === p.user_id) === i)
      .map(p => ({ id: p.user_id, display_name: p.display_name, avatar_url: p.avatar_url,
                   is_incognito: p.is_incognito, nickname: p.nickname ?? undefined }));
    onState(roomId, users);
  };
  ch.on('presence', { event: 'sync' }, rebuild)
    .on('presence', { event: 'join' }, rebuild)
    .on('presence', { event: 'leave' }, rebuild)
    .subscribe((status) => { if (status === 'SUBSCRIBED') void ch.track(payload); });
  return ch;
}
```

### `visitedRoomId` (canal rotativo) — regla igual a web
```ts
const visitedRoomId =
  activeRoomId !== mainRoomId && activeRoomId !== anchorRoomId ? activeRoomId : null;
```

### Effect PERMANENTE (main + ancla) — deps SIN `activeRoomId`
```ts
useEffect(() => {
  if (!isSupabaseConfigured || entryVisible || !payload || !user || !mainRoomId) return;
  const onState = (rid, users) => setPresenceByRoom(prev => ({ ...prev, [rid]: users }));
  const channels: RealtimeChannel[] = [];

  const main = subscribePresence(mainRoomId, user.id, payload, onState);
  mainRef.current = main; channels.push(main);

  if (anchorRoomId !== mainRoomId) {
    const anchor = subscribePresence(anchorRoomId, user.id, payload, onState);
    anchorRef.current = anchor; channels.push(anchor);
  }

  return () => {
    for (const ch of channels) void ch.untrack().finally(() => supabase.removeChannel(ch));
    mainRef.current = null; anchorRef.current = null;
  };
}, [mainRoomId, anchorRoomId, user?.id, payload, entryVisible, refreshTick]); // refreshTick: §2
```
- **Deps SIN `activeRoomId`** → main/ancla NO se re-montan al navegar (no parpadean join/leave).
- Ancla solo si `anchorRoomId !== mainRoomId`.
- Espera a `mainRoomId` (query async); breve ventana sin presencia — aceptable (igual que web §2.5).

### Effect ROTATIVO (visitado) — dep `visitedRoomId`
```ts
useEffect(() => {
  if (!isSupabaseConfigured || entryVisible || !payload || !user || !visitedRoomId) return;
  const onState = (rid, users) => setPresenceByRoom(prev => ({ ...prev, [rid]: users }));
  const ch = subscribePresence(visitedRoomId, user.id, payload, onState);
  visitedRef.current = ch;
  return () => { void ch.untrack().finally(() => supabase.removeChannel(ch)); visitedRef.current = null; };
}, [visitedRoomId, user?.id, payload, entryVisible, refreshTick]);
```
- `null` cuando el activo es main/ancla → no monta canal duplicado.

### Cleanup general
Cada effect ya limpia su(s) canal(es) al desmontar (untrack + removeChannel). Al salir de la pantalla se
desmontan los 3. `presenceByRoom` guarda entradas de salas ya no suscritas (visitados anteriores): **inofensivo**
porque solo se lee `presenceByRoom[activeRoomId]`; útil para la futura fase de no-leídos.

### Riesgos — pieza 1
1. **Payload cambia por incógnito**: `payload` está en deps de los effects → si cambiara re-monta canales.
   En móvil `enteredIncognito` se **bloquea al entrar** y no cambia en sesión → estable. OK. (Si algún día se
   permite cambiar incógnito en vivo, re-montar es aceptable.)
2. **Doble canal**: cubierto por las reglas (visitado null si == main/ancla; ancla solo si ≠ main).
3. **`mainRoomId` tardío**: los permanentes montan al resolver la query; el ancla también espera a `mainRoomId`
   en este diseño (gate `!mainRoomId` en el effect permanente). Alternativa: montar ancla antes (lo conocemos
   desde el inicio) — se descarta por simplicidad, igual que en web. Documentado.
4. **`presenceByRoom` crece** con salas visitadas: acotado (número de sub-salas del negocio). Sin fuga real.

---

## 2) AppState (opción a) — re-trackear al volver a foreground

### Por qué es necesario (edge case del socket caído)
Los canales **permanentes** no dependen de `activeRoomId`, así que **nada** los re-suscribe salvo su effect
inicial. Si el SO suspende la app en background, el WebSocket de Realtime puede **cerrarse**. Supabase Realtime
**reconecta el socket** al volver, pero el **estado de presencia (`track`) NO se re-emite automáticamente** tras
una reconexión → el usuario dejaría de aparecer en main/ancla/visitado para los demás. Por eso hay que actuar en
`'active'`.

### Enfoque robusto propuesto (híbrido re-track / rebuild)
Un listener de `AppState`, registrado **una sola vez** en el hook, que al pasar a `'active'` decide por canal
según su `.state`:
```ts
const [refreshTick, setRefreshTick] = useState(0);

useEffect(() => {
  const onChange = (next: AppStateStatus) => {
    if (next !== 'active') return;               // opción (a): NO se hace nada al ir a background
    const p = payloadRef.current;
    if (!p) return;
    const channels = [mainRef.current, anchorRef.current, visitedRef.current].filter(Boolean);
    let needsRebuild = false;
    for (const ch of channels) {
      if (ch!.state === 'joined') {
        void ch!.track(p);                       // socket vivo → re-emitir presencia (barato)
      } else {
        needsRebuild = true;                     // socket/canal caído → hay que reconstruir
      }
    }
    if (needsRebuild) setRefreshTick(t => t + 1); // fuerza a los effects a remover+recrear canales limpios
  };
  const sub = AppState.addEventListener('change', onChange);
  return () => sub.remove();
}, []); // registrado una vez; usa refs para leer canales/payload actuales
```
- **Canal `joined`** → basta `track(payload)` (re-emite la presencia; barato, sin churn para otros).
- **Canal NO `joined`** (socket se cayó) → **rebuild**: `setRefreshTick` está en las deps de los dos effects de
  canales → su cleanup remueve los canales viejos y se crean/`subscribe` de nuevo, garantizando estado limpio.
- **`refreshTick`** es el mecanismo de reconstrucción robusto; se añade a las deps de los effects permanente y
  rotativo (ver §1).
- **NO** se hace `untrack` en `'background'` (decisión a): el usuario sigue "presente" mientras el socket aguante;
  si se cae, se recupera en foreground.

### Por qué híbrido y no solo re-track
- Solo `track()` no basta si el canal quedó `closed` (el track iría a un canal muerto → no aparece).
- Solo rebuild-siempre causaría join/leave visibles para los demás en cada foreground (parpadeo). El híbrido
  reconstruye **solo si hace falta**.

### Cleanup
`sub.remove()` del listener al desmontar el hook. Los canales los limpian sus propios effects.

### Riesgos — pieza 2 (el más delicado del port)
1. **Detección de `.state`**: depende de la API interna del canal de supabase-js. Si `.state` no fuera fiable en
   la versión usada, fallback: **rebuild incondicional** en `'active'` (bump `refreshTick` siempre) — más churn
   pero infalible. **Verificar la versión de `@supabase/supabase-js`** y probar en dispositivo (background real).
2. **Doble evento `'active'`**: iOS puede emitir `inactive→active`. El listener solo actúa en `'active'`; re-track
   es idempotente; el rebuild por tick es coalescible. OK.
3. **Rebuild y presenceByRoom**: al reconstruir, un `sync` inicial repuebla las entradas; no se pierde la lista.
4. **Timing con `mainRoomId`**: si el usuario vuelve a foreground antes de que la query de rooms resuelva, el
   effect permanente sigue esperando `mainRoomId`; se monta al resolver. Sin acción extra.
5. **Android vs iOS**: `AppState` emite estados algo distintos; el guard `next === 'active'` es suficiente para
   ambos. Probar en los dos (Pixel_8 emulador + iOS sim).

---

## 3) SCROLL → FlatList `inverted`

### Idea
Con `inverted={true}`, la lista se dibuja de abajo hacia arriba y el **dato índice 0 = el más nuevo = abajo**.
El "estar al fondo" es la posición natural al montar → **desaparece** toda la maquinaria de scroll inicial.

### Orden de datos (cambia)
- **Hoy:** query `desc` + `.reverse()` → array **ascendente** (viejo→nuevo), FlatList normal.
- **Con inverted:** se **mantiene `desc`** (nuevo→viejo). **Se elimina el `.reverse()`.**
  - Inicial: `setMessages(msgs)` (desc, sin invertir).
  - `oldestTimestampRef.current = msgs[msgs.length - 1]?.created_at` — **igual que hoy** (último del page desc = el
    más viejo). ✅ sin cambio.

### QUÉ SE ELIMINA
- El effect de los **3 scrolls temporizados** 0/150/400 ms (`:276-303`).
- Refs/estado de scroll inicial: `hasDoneInitialScrollRef`, `pendingInitialScrollRef`, `scrollFrameRef`,
  `initialScrollTimerRef`, `initialScrollDone`/`setInitialScrollDone`, `scrollToEndAfterRender` (`:215-261`,
  `:233-235`, `:241-250`).
- `onLayout` que re-dispara scroll (`:984-992`).
- La lógica de `handleContentSizeChange` que hace `scrollToEnd` (`:811-828`) — con inverted no se usa.
- `maintainVisibleContentPosition={initialScrollDone ? … : undefined}` (`:982`) — ver nota abajo.
- El cleanup de esos timers/frames en el unmount (`:252-261`).

### QUÉ CAMBIA
**a) Paginación (infinite scroll) — de `onStartReached` a `onEndReached`:**
- Con inverted, el **"final" de la lista = arriba visualmente = mensajes viejos**. Cargar más viejos pasa a
  `onEndReached`.
- Reescribir:
  ```ts
  <FlatList
    inverted
    data={messages}                       // desc
    onEndReached={handleLoadOlder}        // era onStartReached={handleScrollTop}
    onEndReachedThreshold={0.2}
    ...
  />
  ```
- `handleLoadOlder` = el actual `handleScrollTop` renombrado; sigue guardado por `hasMore && !loadingMessages`.
- **Append de viejos al FINAL del array desc** (ya no prepend):
  ```ts
  // en loadMessages, rama `before`:
  setMessages(prev => [...prev, ...msgs]); // msgs viene desc; se anexan al final (más viejos)
  // (se elimina el .reverse() de esta rama)
  ```

**b) Realtime / optimistas — prepend al PRINCIPIO (desc):**
- Mensaje entrante realtime: `setMessages(prev => dedup ? prev : [newMsg, ...prev])`
  (antes: `[...prev, newMsg]`). Con inverted, índice 0 aparece **abajo** automáticamente.
- Optimistas (`handleSendText`/`handleSendPhoto`): `setMessages(prev => [optimistic, ...prev])`
  (antes: `[...prev, optimistic]`). La sustitución optimista→confirmado y el dedup se mantienen igual (por id).

**c) Auto-scroll a lo nuevo (comportamiento con inverted):**
- **Usuario en el fondo** (viendo lo nuevo): al prepender índice 0, la lista invertida lo muestra abajo **sola**
  (no hace falta scrollToEnd). 
- **Usuario scrolleó arriba** (leyendo historial): un mensaje nuevo NO lo arrastra — sigue leyendo. ✅ el
  comportamiento deseado sale "gratis" con inverted.
- Para el **emisor** (quiere ver su propio mensaje): opcional `flatListRef.current?.scrollToOffset({ offset: 0, animated: true })`
  (con inverted, offset 0 = abajo = lo más nuevo). Reemplaza el `scrollToEnd({animated:true})` actual (`:597`, `:660`).
- **`isNearBottomRef`**: con inverted, "cerca del fondo" = `contentOffset.y <= THRESHOLD` (offset 0 es el fondo).
  Reescribir `handleMessageListScroll`:
  ```ts
  isNearBottomRef.current = event.nativeEvent.contentOffset.y <= AUTOSCROLL_BOTTOM_THRESHOLD;
  ```
  (Ya no se calcula con `contentSize - offset - layout`.) Se usa solo para decidir si auto-seguir mensajes
  entrantes; con inverted casi no hace falta, pero se conserva para el emisor.

**d) `maintainVisibleContentPosition`:**
- Con inverted + append de viejos al final, RN **mantiene la posición** de lo que el usuario está viendo (no
  salta) porque el contenido crece por el borde superior (índices altos), no por el borde del viewport.
- Recomendación: **quitarlo** (ya no se necesita gating por `initialScrollDone`). Si en pruebas se observara un
  micro-salto al paginar, reintroducir `maintainVisibleContentPosition={{ minIndexForVisible: 1 }}` (ancla en un
  índice bajo = zona nueva/abajo). Documentar el resultado tras probar.

**e) `ListHeaderComponent` / `ListEmptyComponent` (¡se invierten!):**
- Con inverted, **`ListHeaderComponent` se renderiza ABAJO** y **`ListFooterComponent` ARRIBA**. El spinner de
  "cargando más viejos" (hoy en `ListHeaderComponent`, `:1004-1010`) debe moverse a **`ListFooterComponent`**
  (arriba = donde aparecen los viejos). 
- `ListEmptyComponent` funciona pero se dibuja con la transform invertida; suele verse bien. Verificar visual.

**f) KAV:**
- Se **mantiene** el `KeyboardAvoidingView` del input, pero desaparece la "pelea": ya no hay scrollToEnd que
  compita con la reacomodación del KAV. Con inverted, al abrir el teclado lo nuevo (abajo) queda visible solo.
- Nota: en Android, inverted usa `transform: scaleY(-1)`; validar que el KAV `behavior="height"` no genere
  saltos (probar en Pixel_8).

### Riesgos — pieza 3 (segundo más delicado)
1. **Reescritura de paginación**: invertir dónde se anexan viejos (ahora al final) y quitar el `.reverse()` de
   ambas ramas de `loadMessages`. Riesgo de **duplicar o desordenar** si se mezcla el orden — testear: cargar 3
   páginas hacia arriba y verificar continuidad temporal sin huecos ni duplicados.
2. **`ListHeaderComponent`→`ListFooterComponent`**: olvidarlo deja el spinner de "cargando viejos" abajo (mal).
3. **Android inverted quirks**: transform scaleY puede afectar sombras/medición de algunos bubbles; validar
   visualmente (imágenes tienen tamaño fijo → bajo riesgo).
4. **`onEndReachedThreshold` doble disparo**: mantener el guard `hasMore && !loadingMessages` (ya existe) para no
   lanzar dos fetch del mismo `before`.
5. **Scroll-to-new del emisor**: usar `scrollToOffset({offset:0})` (no `scrollToEnd`, que con inverted iría al
   tope viejo).

---

## Resumen de cambios (checklist para la fase de código)

**Pieza 1 — Presencia múltiple (`usePresenceChannels.ts` nuevo):**
- Hook con `presenceByRoom`, refs por canal, payload memoizado + `payloadRef`.
- Effect permanente `[mainRoomId, anchorRoomId, user?.id, payload, entryVisible, refreshTick]` (sin `activeRoomId`).
- Effect rotativo `[visitedRoomId, user?.id, payload, entryVisible, refreshTick]`.
- Componente: borrar el effect de presencia actual (`:475-537`) y `usersInRoom`/`activeCount` states; derivarlos
  del hook.

**Pieza 2 — AppState (dentro del hook):**
- Listener `AppState` registrado una vez; en `'active'`: re-track si `joined`, `setRefreshTick` si algún canal
  caído. Sin untrack en background. `sub.remove()` en cleanup.

**Pieza 3 — FlatList inverted:**
- `inverted`, datos `desc` (quitar `.reverse()` en ambas ramas), append viejos al final, prepend nuevos/optimistas
  al inicio.
- Borrar: 3-timer effect, `hasDoneInitialScrollRef`, `pendingInitialScrollRef`, `scrollFrameRef`,
  `initialScrollTimerRef`, `initialScrollDone`, `scrollToEndAfterRender`, `onLayout` scroll, scroll en
  `handleContentSizeChange`, `maintainVisibleContentPosition` (gating).
- `onStartReached`→`onEndReached`; `ListHeaderComponent`→`ListFooterComponent` (spinner de viejos arriba).
- `handleMessageListScroll` recalculado para inverted; emisor usa `scrollToOffset({offset:0})`.

## Riesgos globales (priorizados)
1. **Presencia múltiple + AppState** (socket caído en background): mitigado por el híbrido re-track/rebuild;
   **requiere prueba en dispositivo real** (background prolongado) y verificar `.state` en la versión de supabase-js.
2. **Reescritura de paginación con inverted**: no romper infinite scroll ni duplicar; test de 3 páginas.
3. **Invertir Header/Footer y auto-scroll**: detalles fáciles de olvidar (spinner arriba, `scrollToOffset(0)`).
4. **Android inverted (scaleY) + KAV**: validación visual en Pixel_8.

## Preguntas abiertas (para aprobar)
- ¿Alinear la **query de sub-rooms** con web (traer `chat_theme_id` para cambiar tema al saltar; scope
  `business_id` vs subárbol actual)? — fuera del alcance estricto de estas 3 piezas; propongo dejarlo para un
  paso aparte salvo que quieras incluirlo.
- ¿Añadir `can_access_room` como red de seguridad en la carga (como web)? — el móvil hoy confía en tabs +
  password sheet; propongo **no** añadirlo ahora para no ampliar alcance.
