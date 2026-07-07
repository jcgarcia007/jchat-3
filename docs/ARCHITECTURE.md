# JChat 3.0 — Patrones de Arquitectura

> Patrones técnicos **reutilizables** extraídos de los diagnósticos de chat/menú
> (julio 2026). El detalle bug-por-bug vive en `docs/archive/`; aquí queda solo
> la solución arquitectónica y **el porqué**, para aplicarla a futuro sin
> re-investigar.

---

## Menú responsive — "device-frame" shell

**Patrón:** envolver el menú en un `<main>` con `transform: translateZ(0)` +
`max-width: 480px` centrado. Eso crea un marco tipo dispositivo (columna
centrada) que **ancla los `position: fixed` de las plantillas a la columna** sin
tener que editar cada plantilla.

**Por qué:** las 21 plantillas usan `position: fixed` para barras/carritos. Sin
el frame, esos elementos se anclan al viewport completo (se van a los bordes de
la pantalla en desktop). El `transform` en el ancestro redefine el bloque
contenedor de los `fixed` descendientes → quedan relativos a la columna.

**⚠️ Efecto secundario (crítico):** un `transform` en un ancestro **rompe**
`position: fixed` de TODOS sus descendientes (dejan de anclarse al viewport). Por
eso los overlays que deben cubrir la pantalla real **no pueden** vivir dentro del
shell — ver los dos patrones siguientes.

## Modales / sheets sobre el shell → `createPortal`

**Patrón:** renderizar modales y sheets con
`createPortal(<Sheet/>, document.body)`.

**Por qué:** al portalizar a `<body>` el nodo sale del subárbol con `transform`,
así que su `position: fixed` vuelve a anclarse al **viewport real** y cubre toda
la pantalla (no solo la columna de 480px). Es la contraparte obligatoria del
device-frame.

## Carritos flotantes → `position: sticky` o portal

**Patrón:**
- Barras/FABs pegados abajo **dentro** de la columna → `position: sticky` (no
  sufre el problema del `transform`, se mantiene en el flujo de la columna).
- Drawers/overlays full-screen → `createPortal` (igual que los modales).

**Por qué:** `sticky` no depende del viewport (usa el contenedor de scroll), así
que convive con el `transform` del shell; los overlays que sí deben tapar todo
necesitan el portal.

---

## Scroll de chat — WEB (lista normal, no invertida)

**Patrón (varias piezas que trabajan juntas):**
1. **Guardar `width`/`height` de la imagen en `metadata` (jsonb) al subir** y
   aplicar `aspect-ratio` en el render.
2. **Re-scroll en `img.onLoad`** solo durante la ventana de carga inicial y
   respetando `userScrolledUpRef`.
3. **Al enviar:** `requestAnimationFrame` anidado (doble rAF) *después* del
   insert → corre tras el paint del mensaje nuevo. El **mensaje propio siempre
   baja** (aunque el usuario haya scrolleado arriba).

**Por qué:**
- Sin dims reservadas, la imagen carga con altura 0 → cuando decodifica, crece y
  **empuja el layout** (el chat "salta"). `aspect-ratio` reserva la altura exacta
  desde el primer render.
- El scroll de Realtime disparado **síncrono tras `setMessages`** ocurre *antes*
  del paint → aterriza en el fondo viejo y queda corto. El doble rAF garantiza
  que el nodo nuevo ya está en el DOM.
- Gatear el auto-follow por `userScrolledUpRef` evita "jalar" al usuario que está
  leyendo historial; la excepción es su propio mensaje enviado.

## Scroll de chat — MÓVIL (`FlatList inverted`)

**Patrón:** `FlatList inverted` con datos en orden **descendente** (índice 0 =
más nuevo = fondo natural). Paginación: `onEndReached` carga los viejos (que en
invertido es "arriba"); Realtime hace **prepend** al inicio.

**Por qué:** en una lista invertida el fondo es el origen del scroll, así que el
mensaje nuevo aparece abajo **sin timers ni `scrollToEnd`**. Elimina la pelea
clásica contra `KeyboardAvoidingView` y los `setTimeout` frágiles de scroll.

---

## Presencia múltiple — `usePresenceChannels`

**Patrón:** un hook con **tres** canales de presencia:
- **main** (sala principal del negocio) — permanente.
- **ancla del QR** (la sala por la que entró el usuario) — permanente.
- **subchat visitado** — rotativo (cambia con `activeRoomId`).

Los canales permanentes **NO** dependen de `activeRoomId` (no se re-suscriben al
navegar). En `AppState`, hacer **re-track al volver a foreground**.

**Por qué:** el usuario debe contar como "presente" en su sala de origen aunque
esté mirando otra sub-sala → por eso main y ancla son permanentes y solo el
"visitado" rota. Y tras una reconexión (app vuelve del background) los canales de
Supabase **no re-emiten `track` solos** → hay que re-trackear manualmente en el
`AppState` → `active`.

## Sub-chats — navegación in-place

**Patrón:** navegación **in-place** (prop `roomId` → estado `activeRoomId`), sin
push de pantallas. Gate de acceso con **`can_access_room`** (no consultando
`room_members` directo). **Reset de mensajes** al cambiar de sala.

**Por qué:** in-place mantiene los canales permanentes vivos (ver presencia) y
evita re-montar toda la pantalla. `can_access_room` centraliza la regla (owner /
membresía vigente / password) en una función server-side en vez de replicar la
lógica en el cliente. El reset evita mezclar mensajes de dos salas.

---

## Fixes de plataforma (móvil web / iOS / Android)

### Auto-zoom de iOS en web
`<input>`/`<textarea>` con **`font-size >= 16px`**. iOS Safari/Chrome hace zoom
automático al enfocar un input con fuente menor a 16px, dejando la vista
descuadrada. 16px es el umbral exacto; no requiere tocar el viewport meta (no
daña accesibilidad).

### Image picker en Android
`legacy: true` en `launchImageLibraryAsync` (expo-image-picker). Fuerza el
selector clásico (`ACTION_GET_CONTENT`) en lugar del Android Photo Picker
(`PICK_IMAGES`, Android 13+), que lanza `ActivityNotFoundException` en
dispositivos/emuladores **sin** el módulo Photo Picker (imágenes no-GMS).
Envolver siempre `launchCameraAsync`/`launchImageLibraryAsync` en `try/catch`
con Alert + `console.error` (no fallar en silencio).

### Visor de imágenes a pantalla completa
- **Web:** lightbox propio → `createPortal` a `<body>`, imagen centrada
  (`object-fit: contain`), **X en la esquina de la imagen** (contenedor
  `position: relative; inline-block`, botón `absolute`), cierra con
  click-fuera / `Esc` / X, zoom con doble-clic.
- **Móvil:** `react-native-image-viewing` (JS puro, sin rebuild nativo) → da
  pinch-zoom + swipe-to-close + fondo oscuro. X propia vía `HeaderComponent`,
  con el inset superior calculado por plataforma: **`StatusBar.currentHeight` en
  Android**, `useSafeAreaInsets().top` (o fallback ~50) en iOS — el
  `SafeAreaView` de RN core NO respeta la status bar de Android. Leer el inset en
  el árbol de la pantalla (bajo el `SafeAreaProvider`) y cerrar sobre él, porque
  el hook dentro del Modal de la librería puede devolver 0.
  **Limitación:** la librería NO expone tap-en-fondo-para-cerrar (solo X + swipe).
