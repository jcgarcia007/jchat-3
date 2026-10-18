# Flujos Maestro — JChat (plan F9, DEV-02)

Pruebas automáticas de la app nativa (`com.otunitylabs.jchat`) con [Maestro](https://docs.maestro.dev).
Los flujos **no escriben en la base de datos**: los que llegarían a escribir (entrar a un local, reportar, bloquear,
eliminar cuenta, cambiar foto) se detienen en la hoja o confirmación y la **cancelan**.

## Requisitos
- Maestro (`curl -fsSL https://get.maestro.mobile.dev | bash`, o `brew install mobile-dev-inc/tap/maestro`) y Java 17+.
- La app **de desarrollo** instalada en el simulador iOS / emulador Android **con la sesión ya iniciada**
  (los flujos no cierran sesión ni inician sesión).
- Metro corriendo desde `mobile/`: `npx expo start --dev-client` (puerto 8081).
- El build de desarrollo debe incluir los módulos nativos de la rama que corre Metro
  (p. ej. `ExpoCrypto`, Sentry, Apple Sign In); si no, la app se cae al abrir con "Cannot find native module".

## Cómo correrlos
```bash
cd mobile
npm run maestro                                   # todos, en orden (config.yaml), en el dispositivo disponible
maestro --device <udid|emulator-5554> test .maestro      # elegir dispositivo
maestro test .maestro/02-venue-chat.yaml                 # un solo flujo
# con JUnit y capturas (fuera de git: e2e/artifacts/ está ignorado):
maestro --device <id> test .maestro --format junit --output ../e2e/artifacts/maestro/<plataforma>/report.xml \
  --test-output-dir ../e2e/artifacts/maestro/<plataforma>
# login (solo si se pasan las credenciales; NUNCA las escribas en archivos):
maestro test -e MAESTRO_EMAIL=... -e MAESTRO_PASSWORD=... .maestro/01-login.yaml
```

## Flujos
| Archivo | Qué hace |
|---|---|
| `00-smoke.yaml` | La app abre y llega al mapa con sesión (pestaña Mapa seleccionada). Captura. |
| `01-login.yaml` | Solo corre con `MAESTRO_EMAIL` y `MAESTRO_PASSWORD`, y solo si la pantalla de inicio de sesión está visible. No cierra sesión; si hay sesión o faltan variables, se omite (mensaje en consola). |
| `02-venue-chat.yaml` | Cerca de mí → Bar XZX → Entrar → aviso de entrada → "Ahora no". Comprueba que vuelve sin crash. No acepta la entrada. |
| `03-photo-picker.yaml` | Perfil → Editar perfil → cambiar foto → aparece el selector del sistema → cancelar. Sin guardar. |
| `04-report-block.yaml` | DM existente → ⋯ → Reportar usuario → hoja de motivos → Cancelar; ⋯ → Bloquear → confirmación → Cancelar. En Android usa el DM con `@jcgarcia007_1bc7f2`; iOS (cuenta test1) usa su primer DM. |
| `05-delete-account.yaml` | Ajustes → Eliminar cuenta → aparece la confirmación → Cancelar. **Nunca** "Continuar". |
| `06-settings.yaml` | Ajustes abre; no existe la fila "Planes"; el idioma muestra su valor actual (sin cambiarlo). |
| `_dev-tools-away.yaml` | Subflujo (no es un flujo): aparta el botón flotante "Tools" del dev-client, que en Android tapa el botón de Ajustes y el ⋯ de los DMs. |
| `config.yaml` | Orden de ejecución y selección de flujos (solo los numerados). |

## Notas
- Los elementos se tocan por `testID`. `testID` añadidos para estos flujos: `tab-*` (barra de pestañas),
  `profile-open-settings`, `profile-edit`, `edit-change-avatar`, `chat-entry-cancel`, `report-cancel`,
  `settings-delete-account`, `language-option-es|en`.
- iOS 26: los botones de la alerta nativa del DM no responden al toque por texto la primera vez; el flujo 04 toca por posición
  el botón "Reportar usuario" y "Bloquear".
- Flujo 04 en iOS: sin capturas (el DM de test1 tiene una imagen explícita). Si un paso falla, Maestro guarda una captura automática: bórrala de `e2e/artifacts/maestro/` y de `~/.maestro/tests`.
- Los textos están en español (cuentas de prueba en `es`).

## Texto grande (`large-text/`)
Flujos que solo miran y cancelan, para revisar que nada crítico se corte con el texto al máximo (plan F8, UX-05/UX-06).
No entran en `npm run maestro` (carpeta aparte). Ponen capturas con el prefijo `PHASE`:
```bash
UDID=<udid del simulador>
xcrun simctl ui $UDID content_size accessibility-extra-extra-extra-large   # iOS al máximo
adb shell settings put system font_scale 2.0                                # Android al máximo
maestro --device <id> test -e PHASE=before .maestro/large-text --test-output-dir ../e2e/artifacts/maestro/lt-<plataforma>-before
# AL TERMINAR devolver el tamaño normal:
xcrun simctl ui $UDID content_size large
adb shell settings put system font_scale 1.0
```
En iOS no hay captura de los flujos 02, 03 y 05 (el DM de test1 tiene una imagen explícita); solo comprueban que los botones están en pantalla.
