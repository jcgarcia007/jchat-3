# Diagnóstico — 3 bugs de envío en el chat (2026-07-06)

> Inventario de causa raíz. **NO se cambió código.** Los 3 fixes son independientes.
> Archivos: `mobile/screens/chat/ChatRoomScreen.tsx`, `mobile/components/chat/ChatInput.tsx`,
> `mobile/components/chat/MessageBubble.tsx`, `mobile/app.config.ts`,
> `web/app/c/[token]/room/ChatRoom.tsx`.

---

## BUG 1 — iOS: al enviar FOTO no baja al nuevo mensaje (texto sí)

**Archivo:** `mobile/screens/chat/ChatRoomScreen.tsx` (FlatList `inverted`).

### Flujo de ambos handlers
- `handleSendText` (línea 464): prepend optimista (índice 0 = más nuevo = fondo en lista invertida) →
  `isNearBottomRef.current = true` → **`setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 50)`** (línea 493) → luego insert async y swap optimista→confirmado.
- `handleSendPhoto` (línea 528): **exactamente el mismo bloque** — prepend optimista → `isNearBottomRef = true` →
  **mismo `setTimeout(scrollToOffset({offset:0}), 50)`** (línea 557) → luego `uploadImage(...)` (storage) → insert → swap.

**El scroll es idéntico en ambos** (mismo offset, mismo delay de 50 ms, misma lista). No hay diferencia
en *dónde/cuándo* se llama `scrollToOffset` entre texto y foto.

### Por qué NO es problema de medición de imagen
La burbuja de foto tiene **altura FIJA** — `MessageBubble.tsx:445` `photoImage: { width: 220, height: 165 }`.
La fila mide 165 px desde el primer layout, cargue o no la imagen. Así que la teoría "la imagen no tiene
altura al hacer scroll" **queda descartada**: el layout es determinista.

### Causa raíz probable — carrera con el modal nativo del picker
La diferencia real está en **cómo se invoca cada handler**:
- **Texto:** el usuario está en el chat con el teclado arriba y toca *enviar* → `handleSendText` corre con
  la pantalla estable y enfocada → el `scrollToOffset` a 50 ms aterriza bien.
- **Foto:** el usuario pasa por un **modal nativo** (`expo-image-picker`): galería vía `AttachmentPanel`
  (`ChatInput.tsx:95 handleGalleryPhoto`) o cámara (`ChatInput.tsx:99 handleCamera` → `launchCameraAsync`).
  Al elegir/tomar la foto, el modal **se está cerrando** (animación de dismiss de iOS ~300–500 ms) cuando
  `handleSendPhoto` agenda el scroll a **solo 50 ms**. Ese `scrollToOffset` se emite mientras el modal aún
  se desmonta y la pantalla recupera foco / `KeyboardAvoidingView` y safe-area re-calculan layout → el
  comando de scroll **se pierde o queda sobrescrito** cuando el layout se asienta tras el dismiss.

**Resumen:** ambos llaman el mismo `scrollToOffset({offset:0})` a 50 ms; el texto no tiene modal y aterriza,
la foto lo dispara demasiado pronto respecto al cierre del picker nativo, así que no "pega". No es scroll
distinto ni imagen sin medir — es **timing del delay fijo (50 ms) contra el dismiss del modal**.

**Factor secundario (no es la causa):** tras subir a storage, el swap optimista→confirmado
(`media_url` local → `publicUrl` remoto, líneas 581-587) recarga la `<Image>`, pero como la altura es fija
(220×165) no desplaza layout. No causa el bug, pero conviene tenerlo presente al diseñar el fix.

**Dirección de fix (no implementado):** re-scroll tras el dismiss del picker (delay mayor/repetido, o
scroll en `onLoad` de la imagen, o volver a hacer `scrollToOffset(0)` cuando el mensaje propio se confirma).

---

## BUG 2 — WEB: al enviar (texto Y foto) no baja al nuevo mensaje

**Archivo:** `web/app/c/[token]/room/ChatRoom.tsx` (NO invertido; usa `scrollToBottom` + `bottomRef`).

### Hallazgos
1. **Los handlers de envío NO hacen scroll.**
   - `handleSend` (texto, línea 496): `insert` → `setSending(false)` → `setInputText("")` → `focus()`.
     **Nunca llama `scrollToBottom()`.**
   - Envío de foto (línea 728): sube a storage → `insert` type `photo` → comentario *"Message appears via
     realtime subscription"*. **Tampoco llama `scrollToBottom()`.**
   - Es decir: el scroll al enviar depende **enteramente del handler de Realtime**.

2. **El handler de Realtime SÍ hace scroll, pero mal-temporizado.** (líneas 393-402)
   ```
   setMessages((prev) => [...prev, full]);   // línea 397-399 (async: React agenda render)
   scrollToBottom();                          // línea 401 — SÍNCRONO, antes del commit/paint
   ```
   `scrollToBottom` (línea 248) hace `bottomRef.current?.scrollIntoView({ behavior:"smooth", block:"end" })`.
   Se llama **inmediatamente después de `setMessages`, antes de que React monte/pinte el mensaje nuevo**.
   Secuencia: el DOM aún es el viejo → `scrollIntoView` lleva el `bottomRef` (posición vieja) al fondo →
   luego React inserta el mensaje nuevo *antes* del `bottomRef` (línea 1268) → el contenido crece y empuja
   el `bottomRef` hacia abajo → el scroll queda **corto** y el mensaje nuevo aparece bajo el fold.
   Esto explica el fallo **consistente** al enviar texto (en web no hay optimista; el texto aparece solo
   por Realtime, con este scroll mal-temporizado).

   Contraste: la carga inicial sí usa `requestAnimationFrame(() => scrollToBottom(...))` (línea 362), es
   decir scroll **después** del paint. El handler de Realtime **no** usa rAF/setTimeout → scroll antes del paint.

3. **La hipótesis de `userScrolledUpRef` NO se cumple.** El `scrollToBottom()` del Realtime (línea 401)
   **no está gateado** por `userScrolledUpRef`. Lo que sí está gateado es el re-scroll en `onLoad` de imágenes
   (líneas 1206-1207): `if (initialScrollWindowRef.current && !userScrolledUpRef.current) scrollToBottom(...)`.
   Ese re-scroll por imagen **solo aplica durante la ventana de carga inicial** (`initialScrollWindowRef`),
   NO para mensajes recién enviados. → Por eso la **foto** falla doblemente: (a) scroll de Realtime
   mal-temporizado, y (b) cuando el `<img>` termina de cargar y crece, **no hay re-scroll** porque ese
   camino está restringido a la carga inicial.

4. **Efecto colateral (no es el bug reportado):** el `scrollToBottom()` del Realtime es incondicional y
   dispara con mensajes de **otros** usuarios también → te jala al fondo aunque estés leyendo arriba. A
   considerar al diseñar el fix (el mensaje **propio** debe bajar siempre; el de otros solo si estás cerca
   del fondo).

**Dirección de fix (no implementado):** (a) forzar `scrollToBottom` en `handleSend` y en el envío de foto
para el mensaje propio, con rAF/`setTimeout` para correr después del paint; y/o (b) mover el
`scrollToBottom()` del Realtime a un rAF; (c) para foto, re-scroll en `onLoad` del `<img>` del mensaje propio
sin gatearlo a la ventana inicial. Ojo: el mensaje propio debe bajar **siempre**, aunque `userScrolledUpRef`
esté activo.

---

## BUG 3 — ANDROID: la CÁMARA da error al enviar foto (texto funciona)

**Archivo:** `mobile/components/chat/ChatInput.tsx` (`handleCamera`, líneas 99-120).

### Flujo y librería
- Usa **`expo-image-picker`** (`import * as ImagePicker`, línea 39). Versiones: `expo ~56.0.12`,
  `expo-image-picker ~56.0.18`.
- `handleCamera` (99): `setAttachmentOpen(false)` → `await ImagePicker.requestCameraPermissionsAsync()` (101)
  → si `!granted` muestra Alert y sale → `await ImagePicker.launchCameraAsync({ mediaTypes:
  ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.85 })` (109) → si no cancelado,
  `onSendPhoto(uri)`.
- El picker **pide permiso de cámara en runtime** antes de lanzar. El código en sí es correcto.

### Estado de permisos / config Android
- `app.config.ts` (61-67) **sí** declara el plugin con `cameraPermission` (y `photosPermission`). Correcto.
- PERO el plugin de `expo-image-picker` en **Android no agrega** `android.permission.CAMERA`: su
  `withImagePicker` solo la **bloquea** si pasas `cameraPermission: false`
  (`node_modules/expo-image-picker/plugin/build/withImagePicker.js:16-18`, `withBlockedPermissions`).
  En iOS agrega `NSCameraUsageDescription`; en Android no inyecta CAMERA (la cámara vía intent del sistema
  normalmente no la requiere).
- `mobile/android/` está **git-ignored** (prebuild efímero / CNG — la fuente de verdad es `app.config.ts`).
  El `AndroidManifest.xml` generado que hay en disco:
  - **NO** contiene `android.permission.CAMERA` (esperado con este plugin).
  - **NO** contiene el `FileProvider` de expo-image-picker en el manifest fuente (se mergea desde el AAR de
    la librería al compilar, así que su ausencia en el manifest fuente no es concluyente).
  - `<queries>` solo tiene el intent `VIEW`/`BROWSABLE` (deep links), **no** hay `<queries>` para
    `android.media.action.IMAGE_CAPTURE`.

### Error probable (ordenado por probabilidad; falta el logcat real para confirmar)
1. **Build/dev-client desincronizado (lo más probable).** Como `android/` es git-ignored y CNG, el APK/dev
   build instalado en el dispositivo pudo compilarse **antes** de que los plugins nativos actuales
   (expo-image-picker / expo-audio, etc.) quedaran en `app.config.ts`. Si el binario instalado no trae el
   módulo nativo del picker o el `FileProvider` mergeado, `launchCameraAsync` **revienta en runtime**.
   → Requiere `expo prebuild` limpio + rebuild / nuevo dev build de EAS en el dispositivo Android.
2. **API deprecada `MediaTypeOptions.Images`.** En expo-image-picker SDK 52+ `MediaTypeOptions` está
   **deprecado** (ahora `mediaTypes: ['images']`). En 56.0.18 suele seguir funcionando con warning, pero si
   en esta versión ya es `undefined`, `launchCameraAsync` recibiría `mediaTypes: undefined` — no debería
   crashear (default images), pero conviene actualizar la llamada.
3. **Trampa de permiso CAMERA (menos probable aquí).** Si el manifest *mergeado* llegara a declarar
   `android.permission.CAMERA` (por otra librería), Android exige el grant en runtime antes del intent. El
   código ya llama `requestCameraPermissionsAsync()` primero, así que este caso está cubierto salvo que el
   grant se deniegue silenciosamente.

**Qué falta para cerrar el diagnóstico:** el **string exacto del error de logcat** al tocar la cámara en
Android (`adb logcat` filtrando por ImagePicker/ActivityNotFoundException/SecurityException/FileProvider).
Eso distingue entre (1) build viejo, (2) API deprecada, y (3) permiso/FileProvider.

**Dirección de fix (no implementado):** rebuild nativo limpio del dev client Android; migrar
`MediaTypeOptions.Images` → `mediaTypes: ['images']`; y capturar el error de `launchCameraAsync` en
try/catch para mostrar un mensaje claro en vez de fallo silencioso.

---

## Resumen

| Bug | Plataforma | Capa | Causa raíz (resumen) |
|-----|-----------|------|----------------------|
| 1 | iOS | scroll (mobile) | Mismo `scrollToOffset({offset:0})` a 50 ms en texto y foto; la foto lo dispara mientras el modal nativo del picker aún se cierra → el scroll no pega. Altura de imagen es fija (no es medición). |
| 2 | Web | scroll (web) | `handleSend`/foto **no** hacen scroll; dependen del handler de Realtime, que llama `scrollToBottom()` **antes del paint** del mensaje nuevo → queda corto. `userScrolledUpRef` NO lo bloquea; el re-scroll por imagen sí está limitado a la carga inicial. |
| 3 | Android | picker/cámara (mobile) | Código de `handleCamera` correcto; plugin con `cameraPermission` OK. Más probable: dev build/APK desincronizado con los plugins nativos (android/ es CNG git-ignored). Secundario: `MediaTypeOptions.Images` deprecado. Falta logcat para confirmar. |
