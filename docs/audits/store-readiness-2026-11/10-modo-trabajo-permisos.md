# Bloque 10 — Modo Trabajo / POS / personal + permisos y textos de propósito (parcial)

Fecha: 2026-11-02 · main `9bd62175` (OTA vigente) · Evidencia: `screenshots/b10/` (sin commit).
Solo cuentas de QA, solo lectura en producción. No se aprobó, anuló ni cobró nada; no se intentó conectar el lector de Terminal; no se probaron PIN.

## 1. Roles de personal de las cuentas de QA (solo lectura)
| Cuenta | Rol de personal | Dueña/dueño de local |
|---|---|---|
| @test | **ninguno** | no |
| @test1 | **Bar XZX · rol `todo` · estado `accepted`** (desde 2026-09-03) | no |
| @demoguest, @test002 | ninguno (no existe fila en `employees`) | no |
| @jchatreview | ninguno | **sí**: JChat Demo Lounge (`verified`) |
No se creó ningún rol ni asignación. Con @test1 (iOS) sí se llega a Modo Trabajo; con @test (Android) no (no hay personal), así que Android se revisó por código. `jcgarcia007_1bc7f2` no se usó.

## 2. Lo que se pudo abrir
| Pantalla | Resultado |
|---|---|
| Ajustes → "Modo Trabajo (POS) · Acceder al terminal de punto de venta" (solo aparece con acceso POS) | OK (`ios17pro-01`) |
| Lista de locales del Modo Trabajo | OK: "Bar XZX · **Rol: todo**" y botón "Acceder al POS" con candado (`ios17pro-02`) |
| "Introduce tu PIN" (4 a 6 dígitos, Confirmar, Cancelar) | Se abre; **no se probó ningún PIN** (no es una credencial de QA que tenga). El PIN tiene límite de intentos en servidor: `pos_pins.failed_attempts` / `locked_until` (`245_baseline.sql:5160-5373`) (`ios17pro-03`) |
| Mesas, pedidos, cambio de estado, expedición/KDS, cobro, dividir cuenta, recibos, inventario, impresoras, aprobación de pedidos | **No abiertas** (tras el PIN). Revisadas por código: `PosHomeScreen` (mesas libre/ocupada), `PosTableHub` (comensales, asientos), `PosOrderScreen` (menú y modificadores), `PosPickupScreen` (marcar entregado), `PosCheckoutScreen` (modo `stripe` con lector o `external` efectivo/tarjeta externa), `PosSplitScreen`, `PosReceiptsScreen` (pagos del día; el empleado solo los suyos), `PosInventoryScreen` (permiso `inventory_manage`), `PosMyPrintersScreen` (BT guardadas; las de red solo se ven), `PosApproval` (aprobar/editar/rechazar). La **KDS es web** (`/dashboard/kds`, Bloque 11) |

## 3. Permisos y textos de propósito
Fuente: `app.config.ts` + `assets/locales/{es,en}.json` (la carpeta local `ios/` es un prebuild **anterior** y su `Info.plist` tiene un texto de ubicación distinto; hay que verificar el IPA de EAS, no esa copia).

### iOS (Info.plist, es y en idénticos en alcance)
| Clave | Texto en español | Texto en inglés | Función que lo pide | ¿Solo al usarse? |
|---|---|---|---|---|
| `NSPhotoLibraryUsageDescription` | "JChat usa tus fotos para tu perfil, publicaciones, mensajes y Match." | "JChat uses your photos for your profile, posts, messages and Match." | Selector de galería (`utils/safePicker.ts`) | Sí (selector del sistema, al elegir foto) |
| `NSCameraUsageDescription` | "JChat usa la cámara para tomar fotos para el chat, las publicaciones y tu perfil, y para escanear códigos de barras del inventario." | "JChat uses the camera to take photos for chat, posts and your profile, and to scan inventory barcodes." | Cámara de chat/DM/publicación/Match (`requestCameraPermissionsAsync`), escáner QR de Match y de código de barras del POS (`useCameraPermissions`) | Sí |
| `NSMicrophoneUsageDescription` | "JChat necesita tu micrófono para enviar notas de voz." | "JChat needs access to your microphone to send voice messages." | `VoiceRecorderBar` (al pulsar grabar) | Sí |
| `NSLocationWhenInUseUsageDescription` | "JChat usa tu ubicación solo mientras usas la app, para confirmar que estás en el local y abrir su chat, mostrar los locales cercanos en el mapa y conectar con lectores de tarjetas." | "JChat uses your location only while you use the app, to confirm you are at the venue and open its chat, show nearby venues on the map, and connect to card readers." | Mapa (`MapScreen.tsx:184`), compuerta del chat y Match (`services/geoPosition.ts:15`), lectores | Al abrir el Mapa (primera pestaña, sin pantalla previa) y al entrar a un local |
| `NSFaceIDUsageDescription` | "JChat usa Face ID para desbloquear la app cuando activas el bloqueo biométrico." | "JChat uses Face ID to unlock the app when you turn on biometric lock." | Bloqueo biométrico (`services/biometric.ts`) **y confirmación antes de pagar** (`CheckoutScreen.tsx:580-588`, solo si el bloqueo está activo) | Sí |
| `NSMotionUsageDescription` | "JChat usa los sensores de movimiento de tu dispositivo para detectar cómo sostienes el teléfono y que las fotos que tomas con la cámara se guarden en la orientación correcta." | "JChat uses your device's motion sensors to detect how you are holding it, so photos you take with the camera are saved the right way up." | `expo-camera` (acelerómetro, `app.config.ts:246`) | Sí (solo con la cámara) |
| `NSBluetoothAlwaysUsageDescription` | "JChat usa Bluetooth para conectarse a los lectores de tarjetas Stripe Terminal en pagos presenciales." | "JChat uses Bluetooth to connect to Stripe Terminal card readers for in-person payments." | Lector de Terminal (`hooks/usePosReader.ts:183`, `discoverReaders`) | Sí: solo dentro de Modo Trabajo |
| `NSBluetoothPeripheralUsageDescription` | "JChat usa Bluetooth para comunicarse con lectores de tarjetas en pagos presenciales." | "JChat uses Bluetooth to communicate with card readers for in-person payments." | **Ninguna**: la app solo actúa como *central*, nunca como periférico | — (ver B10-2) |
| `NSLocalNetworkUsageDescription` | "JChat usa la red local para conectarse a lectores de tarjetas con WiFi." | "JChat uses the local network to connect to WiFi-enabled card readers." | Lectores WiFi y **impresoras de red por TCP** (`react-native-tcp-socket`) | Solo en Modo Trabajo. El texto no menciona impresoras (ver B10-3) |
| `UIBackgroundModes` | — | — | `bluetooth-central` (Terminal) y **`audio`** | `audio`: **sin uso** (ver B10-1) |
Todos los textos existen **en los dos idiomas** (`assets/locales`), ninguno es vago, y no hay `NSUserTrackingUsageDescription` (no hay ATT), ni ubicación "Siempre", ni medios/contactos/calendario.

### Android (AndroidManifest)
| Permiso | Función | ¿Solo al usarse? |
|---|---|---|
| `ACCESS_FINE/COARSE_LOCATION` | Mapa, compuerta del chat, Match | Tiempo de ejecución, al abrir Mapa/entrar a un local |
| `CAMERA` | Cámaras, QR, código de barras | Sí |
| `RECORD_AUDIO` | Notas de voz | Sí (al pulsar grabar) |
| `USE_BIOMETRIC`, `USE_FINGERPRINT` | Bloqueo biométrico y confirmación de pago | Sí (`USE_FINGERPRINT` es el antiguo, lo añade `expo-local-authentication`) |
| `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT` | Lector de Terminal e impresoras BT (`services/btPrinter.ts:78`, `PermissionsAndroid.requestMultiple`) | Sí, solo en Modo Trabajo |
| `BLUETOOTH`, `BLUETOOTH_ADMIN` | Impresoras Bluetooth Classic (hasta API 30) | Sí |
| `VIBRATE`, `MODIFY_AUDIO_SETTINGS`, `INTERNET` | Háptica/notificaciones, audio, red | n/a |
| `POST_NOTIFICATIONS` | Push (se concede en tiempo de ejecución; `registerForPushNotifications`, una vez por sesión) | Sí (concedido en las pruebas del Bloque 4) |
| **`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`** | **Reproducción en segundo plano que el código no usa** | **Sin uso** (ver B10-1) |
| Bloqueados a propósito (`tools:node="remove"`) | `ACCESS_BACKGROUND_LOCATION`, `READ/WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES/VIDEO`, `AD_ID`, `SYSTEM_ALERT_WINDOW` | Correcto (coherente con Data safety) |
(El manifiesto local es el generado por prebuild; la lista final de la tienda debe comprobarse en el AAB.)

## 4. Stripe Terminal SDK `0.0.1-beta.32`
- **Se carga en el arranque para todos, en el código JS**: `navigation/lazyScreens.tsx:17` importa `PosNavigator` de forma estática → `services/terminalSdk.ts:42` hace `require('@stripe/stripe-terminal-react-native')` al evaluar el módulo (Metro no usa `inlineRequires`; en web sí hay carga diferida, `lazyScreens.web.tsx:80`). El módulo nativo está además compilado en el binario de todos.
- **No pide Bluetooth ni ubicación a clientes normales**: `initialize()` se llama solo al montar `PosNavigator` (`PosNavigator.tsx:148-160`, dentro de Modo Trabajo, tras elegir el local y el PIN) y `discoverReaders` solo en `usePosReader.ts:183,276`. Un cliente que nunca entra a Modo Trabajo no ve el aviso de Bluetooth ni de red local por esta vía. (La ubicación de la app la pide el Mapa/chat por sus propios motivos.)
- **Riesgo:** un SDK beta evaluado en cada arranque (coste de inicio y superficie de fallos) aunque el 99 % de usuarios no lo use (B10-4).

## 5. Hallazgos
| ID | Sev. | Dónde | Qué pasa | Propuesta (sin implementar) |
|---|---|---|---|---|
| B10-1 | **P1** | iOS `UIBackgroundModes: audio` · Android `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Se declaran reproducción en segundo plano y servicio en primer plano de tipo multimedia, pero el código **no activa reproducción en segundo plano** (sin `shouldPlayInBackground`/`staysActiveInBackground`); `expo-audio` solo graba notas de voz (`enableBackgroundRecording: false`) y reproduce notas y alertas de POS en primer plano. **Riesgo por tienda: Apple 2.5.4** (los modos de fondo deben usarse para su función; un `audio` declarado sin reproducción real es motivo de rechazo) y **Google Play**: el permiso de servicio en primer plano `mediaPlayback` obliga a completar la *declaración de servicios en primer plano* en Play Console y a justificarla con un vídeo; sin uso real, Play puede rechazar o retirar la versión. El arreglo va **con el build nativo** (no es OTA) | Poner `enableBackgroundPlayback: false` en el plugin `expo-audio` de `app.config.ts` (requiere build nativo, no OTA) y comprobar el `Info.plist` y el manifiesto finales del build de EAS. **Sin verificar en el binario de tienda** |
| B10-2 | P3 | iOS `NSBluetoothPeripheralUsageDescription` | Clave declarada sin función: la app nunca se anuncia como periférico (solo central) | Quitar `bluetoothPeripheralPermission` del plugin de Terminal en `app.config.ts:229` (con el build nativo); verificar que el SDK no la exige |
| B10-3 | P2 | `NSFaceIDUsageDescription` y `NSLocalNetworkUsageDescription` | Face ID: el texto habla de desbloquear la app, pero el mismo ajuste **confirma pagos** en el checkout. Red local: el texto cita "lectores de tarjetas con WiFi" y se usa también para **impresoras de red** | Textos propuestos (es y en, se cambian con el build nativo):<br>**Face ID** — es: "JChat usa Face ID para desbloquear la app y confirmar pagos." · en: "JChat uses Face ID to unlock the app and confirm payments."<br>**Red local** — es: "JChat usa la red local para conectarse a lectores de tarjetas con WiFi y a impresoras de red del local." · en: "JChat uses the local network to connect to WiFi card readers and network printers at the venue." |
| B10-4 | P2 | `navigation/lazyScreens.tsx:17` → `services/terminalSdk.ts:42` | El SDK beta de Terminal se evalúa al arrancar la app para todos los usuarios | Carga diferida de `PosNavigator` también en nativo (como en web) |
| B10-5 | P3 | Modo Trabajo · iOS | Muestra "**Rol: todo**": la clave interna del rol, sin traducir ni nombre amigable | Mostrar el nombre del rol (`custom_roles` / traducción) |
| B10-6 | P3 | Mapa · primera pestaña | El permiso de ubicación se pide al abrir el Mapa, sin una pantalla que explique antes por qué | Pantalla previa corta antes del aviso del sistema (relacionado con B3-1) |
| B10-7 | P3 (comprobado) | Config de Expo (`npx expo config --type introspect`) | Ver §5b: las claves de desarrollo que aparecen en la config **no llegarán** al IPA de producción, salvo `NSAllowsLocalNetworking`, que es la plantilla estándar de Expo y es aceptada por Apple. La carpeta local `ios/` sigue siendo un prebuild viejo | No usar `ios/` como referencia; confirmar en el IPA final (TestFlight) con `Info.plist` |

## 5b. B10-7 — comprobación sin compilar (`npx expo config --type introspect`)
Comando de solo lectura ejecutado en `mobile/`: terminó con código 0, sin escribir archivos (el estado de git no cambió), sin pedir instalar nada. Resultado sobre las claves pedidas:

| Clave | Valor en la config | ¿Irá en el build de EAS de producción? |
|---|---|---|
| `NSBonjourServices` | `["_expo._tcp"]` (lo añade el plugin `expo-dev-client`/dev-launcher) | **No**: el propio plugin añade una fase de compilación «Strip Local Network Keys for Release» que, si la configuración no es `Debug`, quita `_expo._tcp` (`node_modules/expo-dev-launcher/plugin/build/withDevLauncher.js`, líneas 24-57). Hay que confirmarlo en el IPA final |
| `NSAllowsLocalNetworking` | `true` | **Sí**: es el valor por defecto de la plantilla de Expo (ATS). Es inocuo y habitual en apps Expo aprobadas por Apple |
| `NSAllowsArbitraryLoads` | `false` | Sí, correcto |
| `UIBackgroundModes` | `audio`, `bluetooth-central` (repetido dos veces) | **Sí**: `audio` es B10-1; `bluetooth-central` lo usa Terminal. El duplicado es cosmético |
| `NSBluetoothPeripheralUsageDescription` | presente | **Sí** (B10-2) |
| Permisos Android declarados en la config | `RECORD_AUDIO`, `CAMERA`, `ACCESS_COARSE/FINE_LOCATION`, `USE_BIOMETRIC`, `USE_FINGERPRINT`, `MODIFY_AUDIO_SETTINGS`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `INTERNET` | **Sí**. Además: los de Bluetooth (`BLUETOOTH*`), `VIBRATE` y `POST_NOTIFICATIONS` no salen de la config sino del plugin propio `withBluetoothClassicPermissions` y de las librerías al fusionar el manifiesto en Gradle, así que **la lista final solo se ve en el AAB** |
| Android bloqueados | `READ/WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `ACCESS_BACKGROUND_LOCATION`, `AD_ID`, `SYSTEM_ALERT_WINDOW` | Se quitan del manifiesto (correcto) |

**Nota:** `bluetooth-central` **se queda**: lo usa Stripe Terminal para reconectar con el lector. Debe justificarse en las **notas de revisión** (uso: conexión con lectores de tarjetas Stripe Terminal en Modo Trabajo; solo personal de local; no afecta a clientes normales).

## 5c. Nota para el envío a revisión
El revisor usa **@jchatreview** (dueña de JChat Demo Lounge). Todo lo del POS está detrás del PIN de Modo Trabajo, así que **hay que dar su PIN del POS en las notas de revisión** de App Store Connect y Play Console (junto con el correo y la contraseña de la cuenta de revisión); sin el PIN el revisor no podrá ver mesas, pedidos ni cobros. Comprobar antes que el PIN funciona y que la cuenta tiene personal/rol de dueña en el local de demostración.

## 6. No probado y por qué
| Qué | Motivo |
|---|---|
| Mesas, pedidos, cambio de estado, KDS/expedición, cobro, dividir, recibos, inventario, impresoras, aprobaciones | Detrás del PIN de Modo Trabajo, que no es una credencial de QA; no se adivinan PIN. Solo código |
| Modo Trabajo en Android | @test no tiene rol de personal y no se crean roles en producción |
| Dueño (@jchatreview) en el móvil | No hay sesión abierta de esa cuenta en un dispositivo; el panel web va en el Bloque 11 |
| Lector de Stripe Terminal, impresoras reales, Tap to Pay | Prohibido conectar el lector; sin hardware |
| Prompts reales de Bluetooth/red local en iOS | Solo aparecen con el lector/impresora |
| Manifiesto e Info.plist **finales** de EAS | No se hizo `eas build`; se leyó `app.config.ts`, `assets/locales` y los prebuild locales |

## 7. Estado
Sin cambios en producción. iOS: @test1 en Ajustes tras cancelar el PIN. Android: sin cambios desde el Bloque 9 (carrito vacío).
