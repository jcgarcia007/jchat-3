# F3b íconos — estado de los puntos 2 y 3 (12-oct-2026)

Rama `feat/web-shell-profile-sheet`. Las capturas viven en `e2e/artifacts/f3b-icons/` (ignorada por git, no se sube).

## Punto 2 — barrido de capturas web con sesión: BLOQUEADO por hCaptcha

**Hecho antes** (commit `1170193`): el test de íconos compara el stub web contra el paquete nativo (tipo, nombres y nodos SVG)
y comprueba que cada ícono dibuja formas.

**Pendiente: las capturas con sesión a 390 y 1280 px.** Con las credenciales de prueba tomadas del entorno, el login web llega
hasta el botón «Entrando…» y se queda esperando: aparece un reto visible de hCaptcha (iframe de 320 × 400 px) y el inicio de
sesión por contraseña de Supabase exige ese token. No se resuelve ni se esquiva (tampoco existe un login por REST sin captcha:
`e2e/seed-presence.sh` ya documentaba `captcha_failed`). Sin sesión web no se pueden capturar chat, DMs, perfil, notificaciones,
ajustes ni `WebNoVenueScreen`.

**Para desbloquearlo** hace falta una persona una sola vez:

```bash
cd e2e && npm run web:session
```

Abre un Chromium visible en `?venue=bar-xzx-omd2`, escribe las credenciales desde el entorno (por teclado, sin que Playwright
las imprima), espera a que se resuelva el reto y guarda el estado en `e2e/.auth/web-session.json` (ignorado por git; contiene
tokens de sesión). Con ese archivo el barrido se ejecuta sin captcha. La otra alternativa es desactivar el captcha en Supabase
Auth mientras dura la prueba, decisión que es de Juan.

Nota de seguridad: durante el sondeo, Playwright imprimió el correo de prueba en un mensaje de error (`fill(...)`) porque su
registro incluye el valor. No se guardó en ningún archivo. El helper nuevo escribe con `keyboard.insertText`, que no se registra.

## Punto 3 — Juegos

**Entrada en nativo** (capturas `games/native-android-*.png`, emulator-5554, Bar XZX, ubicación simulada):

1. Aviso de entrada al local: sección «Juegos en Bar XZX» con interruptores «Participar en juegos», «Match» y «Truth or Dare».
   En esta cuenta Truth or Dare sale **deshabilitado** en el aviso, aunque luego aparece en la fila de juegos (ver abajo).
2. Chat → botón «+» → panel con **Juegos · Menú · Servicio** (en el panel «Juegos» sustituye a «Foto»; la cámara queda en la barra).
3. «Juegos» → fila con **Match** (corazón) y **Truth or Dare** (dado).

Código: `components/chat/AttachmentPanel.tsx` (fila de juegos), `screens/chat/ChatRoomScreen.tsx:462-463`
(`gamesAvailable = (matchActive || todActive) && !isOwner`), pantallas `MatchHome` y `TodHome` registradas en `AppNavigator.tsx:432-433`.

**En la web hoy**: no hay ningún filtro por plataforma que oculte la entrada. La disponibilidad depende de lo mismo que en nativo:
configuración del local, ajuste «Participar en juegos» del usuario y que no sea el dueño. Las pantallas `MatchHome` y `TodHome`
también están registradas en el navegador web. Por lo tanto, **no está oculta a propósito**; si la fila aparece en la web, lo que
pase al pulsar Match (el escáner de QR usa `expo-camera`, y la sincronización de presencia usa `useMatchPresence`) y Truth or Dare
**no está verificado**: requiere sesión web (mismo bloqueo del punto 2). No se activó ni se arregló nada; los juegos web son la fase F4.

## Qué falta para cerrar

1. Un `npm run web:session` (arriba) para generar la sesión.
2. Con esa sesión: barrido a 390 y 1280 px (chat con barra, pestañas, personas, entrada de texto, hoja de ⋯, Mi perfil, DMs,
   notificaciones, ajustes, `WebNoVenueScreen`) y la captura de la fila de Juegos en la web.
3. Correcciones `fix(web): …` por grupo de lo que salga (hasta ahora no hay hallazgos de íconos nuevos).
