# Diagnóstico del bug de scroll en chats (Inventario — Fase 1)

**Síntoma:** al entrar a un salón de chat, el usuario queda a MITAD de la
conversación en vez de en el último mensaje. Intermitente ("a veces funciona").
Pasa en web Y móvil. Los mensajes pueden tener imágenes (y pronto notas de voz).

**Hipótesis de partida:**
- (a) `scrollToBottom` corre antes de que las imágenes carguen — la altura crece después y el scroll queda corto.
- (b) bug de orden/límite en la carga (ascending+limit trae los más VIEJOS).
- (c) el móvil quizás no usa lista invertida.

---

## Componentes de chat encontrados

| Uso | Archivo |
|---|---|
| **Usuario final (web)** ← el del bug reportado | `web/app/c/[token]/room/ChatRoom.tsx` |
| Dashboard (negocio) | `web/components/dashboard/LiveChat.tsx` |
| Usuario final (móvil) | `mobile/screens/chat/ChatRoomScreen.tsx` |

---

## 1. Web — `web/app/c/[token]/room/ChatRoom.tsx` (usuario final) — **AQUÍ ESTÁ EL BUG**

**a) Query** — L194: `.order("created_at", { ascending: false }).limit(PAGE_SIZE)`
y luego `.slice().reverse()`.
✅ **Correcta**: descending+limit trae los **más nuevos**, luego invierte a
ascendente para mostrar. La hipótesis (b) NO aplica aquí.

**b) Scroll** — `scrollToBottom("instant")` en un `useEffect` gatillado por
`loadState === "ok"` (L226-230). Usa `bottomRef.current?.scrollIntoView({ behavior, block:"end" })`.
Se dispara **una sola vez**, justo tras `setMessages` — **antes de que carguen las
imágenes**. **No** hay re-scroll cuando las imágenes cargan ni cuando la altura crece.

```
// L157-160
const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
  bottomRef.current?.scrollIntoView({ behavior, block: "end" });
}, []);

// L226-230  — único disparo del scroll inicial
useEffect(() => {
  if (loadState === "ok") {
    scrollToBottom("instant" as ScrollBehavior);
  }
}, [loadState, scrollToBottom]);
```

**c) Imágenes** — L918-926: `<img style={{ display:"block", maxWidth:220, width:"100%", height:"auto" }}>`.
**Altura natural, sin reservar** (sin `aspect-ratio` ni `height` fija). Al cargar,
la imagen crece y empuja el contenido hacia abajo.

**→ Causa confirmada = hipótesis (a) + (c):** el scroll corre antes de que las
imágenes tengan altura; cuando cargan, el contenido crece y el usuario queda a
mitad. **Intermitente** = imágenes en caché (cargan al instante → scroll correcto)
vs. sin caché (crecen después → scroll corto).

**Realtime** (L239-271): en cada INSERT hace `fetchMessage` + append y llama
`scrollToBottom()` (smooth) — mismo problema potencial si el mensaje entrante
trae imagen, pero el caso reportado es el de **entrada al salón**.

---

## 2. Móvil — `mobile/screens/chat/ChatRoomScreen.tsx`

**a) Query** — L396-399: `.order('created_at', { ascending: false }).limit(PAGE_SIZE)`
+ `.reverse()` (L425/428).
✅ **Correcta** (más nuevos, luego invertida a ascendente).

**b) Scroll** — **FlatList normal (NO invertida)**. Scroll por **3 intentos
temporizados** de `scrollToEnd`:
- `~0 ms` (requestAnimationFrame) — attempt 1
- `150 ms` — attempt 2
- `400 ms` — attempt 3 (marca `hasDoneInitialScrollRef = true` + `setInitialScrollDone(true)`)

```
// L276-291
useEffect(() => {
  if (messages.length === 0 || hasDoneInitialScrollRef.current) return;
  const frame = requestAnimationFrame(() => {
    flatListRef.current?.scrollToEnd({ animated: false });        // attempt 1
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 150); // 2
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: false });      // attempt 3
      hasDoneInitialScrollRef.current = true;
      setInitialScrollDone(true);
    }, 400);
  });
  ...
});
```

Además: `onLayout` (L984-992) re-dispara `scrollToEndAfterRender` mientras el
scroll inicial no esté "done"; `onContentSizeChange` → `handleContentSizeChange`
(L811-828) gateado en `hasDoneInitialScrollRef` e `isNearBottomRef` (solo sigue
al fondo si el usuario estaba cerca del fondo); `maintainVisibleContentPosition`
se activa solo tras `initialScrollDone`.

Los 3 intentos son **por tiempo fijo, no atados a la carga de imágenes**.

**c) Imágenes** — `MessageBubble.tsx` usa dimensiones **FIJAS**:
`photoImage: 220×165`, `gifImage: 200×150`, sticker `120×80` (L445-461),
`resizeMode="cover"`. **No crecen al cargar** → la hipótesis (a)/(c) **NO aplica
al móvil**.

**d) Lista** — FlatList **normal (no `inverted`)**.

**→ La intermitencia del móvil NO es de imágenes, es de timing/KAV.** Los propios
comentarios del código (L266-271) citan la regresión "~3 mensajes corto" causada
por el KeyboardAvoidingView redistribuyendo altura DESPUÉS de los 400 ms. Si un
bubble re-mide (texto multilínea) o el KAV se reacomoda tras los 400 ms, el scroll
inicial ya se marcó "done" y queda corto.

---

## 3. Dashboard — `web/components/dashboard/LiveChat.tsx` (no es el reportado, pero **bug latente**)

**a) Query** — L59-64: **`.order('created_at', { ascending: true }).limit(200)`**
⚠️ = carga los **200 más VIEJOS**. En una sala con >200 mensajes, el "fondo" es un
mensaje viejo y **nunca se ven los recientes**. Esto **sí** es la hipótesis (b),
pero afecta al **dashboard**, no al usuario final.

**b) Scroll** — L41-43: `requestAnimationFrame` → `scrollTop = scrollHeight`, una
vez tras cargar (L69) + re-scroll en mensaje nuevo (L132).

**c) Imágenes** — no renderiza imágenes (solo texto).

---

## Check de purga / cron (contexto para Fase 2)

**No existe purga de mensajes hoy.**

- Hay `expires_at` / `ttl_hours` pero **solo** para:
  - **Membresía de sala** (24h): `room_members.expires_at` — `supabase/migrations/019_room_membership.sql`
    (`do update set expires_at = now() + interval '24 hours'`). También en 020/026.
  - **Stories** (24h): `stories.expires_at default (now() + interval '24 hours')` — `002_social_schema.sql:47`.
  - `rooms.ttl_hours int` existe (`004_stage2_schema.sql:28`) pero no hay job que purgue en base a él.
- La tabla **`messages` NO tiene TTL ni purga**.
- **Sin `pg_cron`** ni job programado que borre mensajes (grep en `supabase/migrations/*.sql` = nada).
- Edge functions existentes: solo Stripe (`payments`, `subscriptions`, `stripe-connect`,
  `stripe-webhook`). **Ninguna toca mensajes ni purga.**

---

## Resumen de fixes que se perfilan (para diseñar en Fase 2)

- **Web (prioritario):** re-disparar `scrollToBottom` en `img.onLoad` (o reservar
  altura con `aspect-ratio` / dimensiones conocidas) para que el scroll no quede
  corto. Idealmente **ambas**: reservar altura + re-scroll tras carga. Aplica igual
  al INSERT realtime con imagen.
- **Móvil:** desacoplar el scroll de los timers fijos (0/150/400 ms) — engancharlo
  a `onContentSizeChange` durante una ventana "cerca del fondo" hasta estabilizar
  el layout (incluida la reacomodación del KAV), o evaluar migrar a una estrategia
  más robusta. Las imágenes ya tienen altura fija (no requieren cambio).
- **Dashboard LiveChat:** invertir la query a `ascending:false` + `limit` +
  `reverse()` (traer los más nuevos), como ya hacen web y móvil.
- **Purga:** no existe; si se quiere TTL de mensajes es trabajo nuevo (migración +
  `pg_cron` o edge function programada).
