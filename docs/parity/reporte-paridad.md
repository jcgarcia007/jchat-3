# Auditoría de paridad iOS · Android · Web — JChat

Fecha: 2026-10-04 · Rama: `docs/parity-audit` (desde `origin/main`) · **Solo lectura**: no se cambió código.

**Método y límites.** Lectura de código de `mobile/`, `web/` y `supabase/`, más un intento real de `npx expo export --platform web` (§3). Nada se probó en dispositivos: las marcas ✅/⚠️/❌ describen lo que el código implementa, no lo verificado en uso. La línea base es `origin/main`; **Match** (13 commits) vive en `feat/match-app` y su panel de dueño en `feat/match-phase-e`, ambos sin fusionar, y se anota aparte.

Dimensiones: app móvil ≈ 68 800 líneas TS/TSX (54 pantallas, 48 archivos con `Alert`), web ≈ 106 500 líneas (74 páginas).

---

## 1. Matriz de funciones

Leyenda: ✅ implementado · ⚠️ parcial o con salvedad · ❌ no existe · — no aplica.

| Área / función | iOS | Android | Web | Notas |
|---|---|---|---|---|
| **Cuenta y acceso** | | | | |
| Registro / login con email y contraseña | ✅ | ✅ | ✅ | Web con hCaptcha invisible |
| Google OAuth | ✅ | ✅ | ✅ | |
| Apple OAuth | ✅ | ⚠️ | ❌ | Móvil por navegador; el formulario web solo tiene Google. Botón nativo de Apple y logo oficial de Google diferidos (`TODO(official-social-buttons)`) |
| Login biométrico (Face ID / huella) | ⚠️ | ⚠️ | ❌ | Servicio `biometric.ts` presente; login real diferido (`TODO(biometric-login)`) |
| Confirmación de edad y términos | ✅ | ✅ | ✅ | Selector de fecha distinto por plataforma (§2) |
| Idioma es/en | ✅ | ✅ | ✅ | Catálogos i18n separados (§4) |
| **Social** | | | | |
| Feed, publicaciones, historias | ✅ | ✅ | ❌ | |
| Perfil, seguidores, bloqueos | ✅ | ✅ | ❌ | La web solo tiene la página pública del negocio (`/b/[slug]`) |
| Mensajes directos y notas de voz | ✅ | ✅ | ❌ | |
| Notificaciones push | ✅ | ✅ | ❌ | Android crea canal `default` explícito |
| **Locales y chat** | | | | |
| Mapa y negocios cercanos | ✅ | ✅ | ⚠️ | iOS usa Apple Maps; Android, Google Maps. Web: `/nearby` |
| Geocerca / check-in por ubicación | ✅ | ✅ | ❌ | Solo en primer plano; sin ubicación en segundo plano |
| Entrada por QR (`/c/{token}`) | ❌ | ❌ | ✅ | La app no maneja el enlace (ver `docs/match/flujo-qr.md`) |
| Chat del local: texto y fotos | ✅ | ✅ | ✅ | `ChatRoomScreen` (1 676 líneas) y `ChatRoom.tsx` (2 125) son dos implementaciones |
| Chat: notas de voz, ofertas, mensajes fijados, botón de check-in | ✅ | ✅ | ❌ | Sin menciones en el chat web |
| Chat: modo incógnito | ✅ | ✅ | ⚠️ | Web no tiene estado de incógnito por usuario (deuda anotada en el código) |
| Subsalas con contraseña | ✅ | ✅ | ✅ | |
| Llamar al servicio | ✅ | ✅ | ✅ | Siempre autenticado; sin camino de invitado |
| **Pedidos y pagos** | | | | |
| Menú, carrito y checkout con cuenta | ✅ | ✅ | ❌ | |
| Pago de invitado sin cuenta (`/m/{slug}`) | ❌ | ❌ | ✅ | `guest-pay` / `guest-tab` |
| Apple Pay | ✅ | — | ⚠️ | `merchantIdentifier` configurado; web depende de Stripe Elements |
| Google Pay | — | ❌ | ⚠️ | `enableGooglePay: false` en la app |
| Seguimiento de pedido | ✅ | ✅ | ⚠️ | Web: confirmación y recibo de invitado |
| Reservas, eventos, lealtad, reseñas, ofertas (cliente) | ✅ | ✅ | ❌ | En web solo existe la gestión del dueño |
| **POS y equipo** | | | | |
| POS móvil (mesas, órdenes, cobro, inventario) | ✅ | ✅ | ⚠️ | Web: estación `/terminal` |
| Lector de tarjetas Stripe Terminal | ✅ | ✅ | ❌ | SDK nativo en beta (`0.0.1-beta.32`) |
| Impresión Bluetooth Classic (térmica) | ❌ | ✅ | ❌ | Solo Android |
| Impresión TCP/IP (ESC/POS) | ✅ | ✅ | ❌ | iOS necesita permiso de red local |
| Escáner de códigos de barras | ✅ | ✅ | ❌ | `expo-camera` |
| **Dueño y plataforma** | | | | |
| Dashboard del dueño (menú, KDS, inventario, analítica, configuración) | ❌ | ❌ | ✅ | La app solo cubre empleados y ajustes POS |
| Super-admin | ❌ | ❌ | ✅ | |
| Páginas públicas (negocio, precios, legales, `/r/`, `/t/`) | — | — | ✅ | |
| **Plataforma** | | | | |
| Actualizaciones OTA (`expo-updates`) | ✅ | ✅ | — | |
| Deep link `jchat://` | ✅ | ✅ | — | Sin enlaces universales ni App Links |
| **Match** (ramas sin fusionar) | ✅ | ✅ | ❌ | App en `feat/match-app`; ajustes e informes del dueño en la web (`feat/match-phase-e`) |

**Lectura rápida:** la app es el cliente del cliente final y del empleado; la web es el cliente del dueño y de la entrada por QR. Solo se solapan el chat del local, el menú/pago y la llamada al servicio, y en los tres casos hay **dos implementaciones separadas**.

---

## 2. Diferencias iOS vs Android (comportamiento y configuración)

| Tema | iOS | Android | Evidencia / riesgo |
|---|---|---|---|
| **Safe area** | `SafeAreaView` de `react-native` funciona | No hace nada (RN 0.85 fuerza borde a borde) → contenido bajo la barra de estado | **15 archivos** aún importan el `SafeAreaView` del núcleo; 36 usan `react-native-safe-area-context`. Ya hay parches manuales con `StatusBar.currentHeight` (`StoryViewerScreen`, `ChatRoomScreen`). Las pantallas de Match ya se corrigieron en `feat/match-app` |
| Teclado | `KeyboardAvoidingView` con `behavior="padding"` | `behavior="height"` / `undefined` según pantalla | ~20 pantallas con la misma condición repetida |
| Selector de fecha de nacimiento | Rueda inline | Diálogo y `setShowPicker(false)` | `ConfirmAgeScreen`, `RegisterStep2Screen` |
| Texto sobre una historia | `Alert.prompt` (solo iOS) | Modal propio | `StoriesRow` |
| Mapas | Apple Maps; zoom por **altitud**; abre `maps.apple.com` | Google Maps (clave `GOOGLE_MAPS_KEY`); zoom numérico; abre `geo:` | `MapScreen` |
| Notificaciones | Permisos del sistema | **Canal obligatorio** creado antes del token | `services/notifications.ts` |
| Impresión térmica | Solo TCP | Bluetooth Classic + TCP | `btPrinter.ts` devuelve `true` en iOS; permisos `BLUETOOTH_SCAN/CONNECT` (Android 12+) |
| Stripe Terminal | Info.plist: Bluetooth, red local, modo de fondo | Permisos de ubicación y Bluetooth, `minSdk 26` (plugin propio) | `app.config.ts` + plugins |
| Pods / SDK mínimos | Plugin que sube los Pods a 15.1 | Plugin `withAndroidMinSdkVersion` | Dependen del build; un cambio de Expo/RN puede romperlos |
| Interruptores | Nativo | `thumbColor` forzado en 3 pantallas | Cosmético |
| Autocompletado OTP | `one-time-code` | `sms-otp` | `ForgotPasswordScreen` |
| Gesto atrás | — | `predictiveBackGestureEnabled: false` | Decisión deliberada |
| Pagos | Apple Pay | Google Pay desactivado | Paridad de métodos de pago |

**Conclusión:** la mayor deuda de paridad iOS/Android es la **safe area en Android** (15 archivos) y el **teclado**; el resto son diferencias de plataforma legítimas ya cubiertas con ramas `Platform`.

---

## 3. Viabilidad de Expo Web (`npx expo export --platform web`)

Se ejecutó **sin commitear la salida** y sin tocar el repo.

1. **En el repo, sin cambios:** falla de inmediato — faltan `react-dom@19.2.3` y `react-native-web@^0.21.2` (la plataforma web está declarada en `app.config.ts`, pero las dependencias no).
2. **En una copia aislada** (copia con copy-on-write fuera del repo, instalando ambas dependencias): Metro empaquetó 7 460 módulos y **falló en el primer bloqueo real**: `react-native-image-viewing` solo trae implementación nativa (`ImageItem`, importado desde `ChatRoomScreen`). Metro se detiene en el primer error, así que **no hay lista completa de fallos**; la siguiente tabla es un inventario por lectura.
3. **Código ya preparado:** solo hay **un** par de archivos por plataforma (`StripeRoot.web.tsx` / `.native.tsx`). 64 líneas con `Platform.OS/select`.

### Inventario de módulos sensibles (archivos que los importan)

| Módulo | Archivos | Web |
|---|---|---|
| `react-native-maps` | 4 | ❌ sin soporte web: mapa alternativo |
| `@stripe/stripe-react-native` | 2 | ⚠️ `StripeRoot.web` existe; pagos con Stripe Elements |
| `@stripe/stripe-terminal-react-native` | 1 | ❌ no aplica |
| `react-native-bluetooth-classic` | 1 | ❌ no aplica |
| `react-native-tcp-socket` | 1 | ❌ no aplica |
| `react-native-webview` | 1 | ❌ sin soporte |
| `expo-local-authentication` | 2 | ❌ sin soporte |
| `expo-notifications` | 5 | ⚠️ limitado (push web distinto) |
| `@react-native-community/datetimepicker` | 2 | ❌ sin soporte |
| `@hcaptcha/react-native-hcaptcha` | 1 | ⚠️ hay que usar el hCaptcha web |
| `react-native-image-viewing` | 1 | ❌ **bloqueo confirmado** |
| `expo-audio`, `expo-camera`, `expo-location`, `expo-image-picker`, `expo-clipboard`, `expo-web-browser`, `expo-linking`, `expo-localization`, `expo-haptics` | 1–6 | ✅/⚠️ con salvedades (haptics sin efecto) |
| `expo-file-system` | 4 | ⚠️ patrón de subida base64 a revisar |
| Match (en `feat/match-app`): reanimated, gesture-handler, `expo-image`, swipe-deck | — | ✅ soportan web; cámara/ubicación igual que arriba |

### Hallazgo transversal grave
`Alert.alert` aparece **206 veces en 48 archivos**. En `react-native-web`, `Alert` **no hace nada**: confirmaciones de borrado, errores y avisos desaparecerían en silencio. Hace falta un sustituto (modal compartido) antes de cualquier release web.

### Veredicto
- Técnicamente **viable para un subconjunto** (chat, menú, perfil, ajustes), con trabajo grande.
- **No viable** para POS, impresión, lector de tarjetas ni biometría (hardware nativo).
- Sería **un tercer cliente** a mantener. La web actual (Next) ya cubre la entrada por QR, el menú de invitado y el dashboard con 106 500 líneas propias.

---

## 4. Lógica duplicada entre `mobile/` y `web/`

| Tema | Mobile | Web | Observación |
|---|---|---|---|
| Chat del local | `ChatRoomScreen.tsx` 1 676 + `components/chat/*` | `room/ChatRoom.tsx` 2 125 | Duplicación **mayor**; ya divergen (voz, ofertas, fijados, check-in, geocerca solo en móvil) |
| Menú y checkout | `screens/menu/*` + `screens/checkout/*` ≈ 3 900 líneas + `CartContext` | `app/m/[slug]/*` ≈ 5 000 líneas | Cálculo de precios, impuesto y propina repetido en ambos clientes |
| Edad | `services/age.ts` (56) | `lib/age.ts` (37) | Misma regla 18+, dos copias |
| Cuenta (borrado) | `services/account.ts` (32) | `lib/account.ts` (51) | |
| Lealtad | `services/loyalty.ts` (269) | `lib/loyalty.ts` (240) | |
| Temas de chat | `theme/chatThemes.ts` (308) | `lib/chatThemes.ts` (287) | La web declara "port exacto, no divergir": copia manual |
| Moneda | `utils/currency.ts` (21) | `lib/currency.ts` (63) | Formato de centavos duplicado |
| Tokens de color | `theme/tokens.ts` (106) | `styles/tokens.css` (108) | Hex duplicados a mano (la refactorización reciente de colores a tokens tuvo que tocar ambos) |
| i18n | 20 espacios de nombres por JSON | `messages/{en,es}.json` (≈ 3 400 claves) | Catálogos separados; los textos comunes (errores, legales, QR) se redactan dos veces |
| Mensajes de error | `utils/errors.ts` | `lib/authErrors.ts`, `functionError.ts` | Mapas de códigos paralelos |
| Planes y límites | pantalla de precios | `lib/plans.ts`, `planLimits.ts` | |
| **Fuente única buena** | — | — | Reglas de precio/cobro en `supabase/functions/_shared/{pricing,connect}.ts` y las RPC/RLS: ahí no hay duplicación |

**Patrón:** lo que está en el servidor (precios, acceso, RPC) es único; lo que está en cliente (formatos, textos, reglas de presentación, temas) se copia a mano.

---

## 5. Riesgos y esfuerzo

| # | Riesgo | Impacto | Esfuerzo para mitigar |
|---|---|---|---|
| R1 | Android: 15 archivos con `SafeAreaView` del núcleo → contenido bajo la barra de estado en pantallas ya publicadas | Alto (usabilidad) | **S** (cambio mecánico + prueba en dispositivo) |
| R2 | `Alert.alert` (206 usos) inutilizable en Expo Web | Bloqueante para web | **M** (módulo de diálogo compartido, adopción gradual) |
| R3 | Dos chats y dos menús que divergen | Medio-alto: cada corrección se hace dos veces | **L/XL** (extraer lógica, no la UI) |
| R4 | Copias manuales de edad, moneda, temas, tokens | Medio: deriva silenciosa | **S/M** (paquete compartido o generación desde una fuente) |
| R5 | Enlaces universales ausentes: el QR siempre abre navegador | Medio (experiencia de entrada) | **L**, ligado al build de Otunity Labs |
| R6 | Stripe Terminal en beta (`0.0.1-beta.32`) | Medio (cobro en persona) | **M** (seguir la versión estable) |
| R7 | Dependencias de Expo desactualizadas (14 con parche pendiente) y plugins propios de Pods/minSdk | Medio: un salto de SDK puede romper builds | **M** |
| R8 | Hermes con regresión de memoria conocida (aviso de `expo-doctor`) | Medio (estabilidad) | **L** (subir a Expo 57 / RN 0.86) |
| R9 | Match: el chat web y el dashboard no lo conocen; lógica de presencia solo móvil | Bajo ahora | **S** |
| R10 | Sin pruebas automáticas en ninguno de los dos clientes (solo `tsc`/`build`) | Alto para refactorizaciones de paridad | **L** |

Esfuerzo relativo: S ≈ días, M ≈ 1–2 semanas, L ≈ 3–6 semanas, XL ≈ más de 6 semanas, para una persona.

---

## 6. Plan por fases (propuesta)

| Fase | Objetivo | Contenido | Tamaño |
|---|---|---|---|
| **P0 — Estabilizar Android** | Cerrar R1 y los casos de teclado | Migrar los 15 `SafeAreaView`; unificar un componente de pantalla con inset; revisar teclado | S |
| **P1 — Fuente única de reglas** | R4, parte de R3 | Paquete compartido (o carpeta generada) con edad, moneda, errores, temas de chat y tokens; i18n común para textos repetidos | M |
| **P2 — Puerta de entrada QR** | R5 | Dominio `jchat.cloud`, hub web sin cuenta, llamada de servicio de invitado, enlaces universales **en el build de Otunity Labs** (decisiones en `docs/match/flujo-qr.md` §5) | L |
| **P3 — Base de pruebas** | R10 | Pruebas de unidad para reglas compartidas y de humo para pantallas críticas; CI con `tsc` y build | M |
| **P4 — Decidir el cliente web de chat** | R2, R3 | Con P1 hecho: elegir entre mantener el chat de Next o un Expo Web acotado (chat + menú), tras un piloto de 2 pantallas y el módulo de diálogos | M → L/XL |
| **P5 — Mantenimiento de plataforma** | R6, R7, R8 | Subir Expo/RN, Terminal estable, retirar parches de plugins | M/L |
| **P6 — Match en web** | R9 | Ajustes e informes del dueño (ya en rama); decidir si habrá deck web | S |

**Recomendación:** P0 y P1 primero (barato y reduce riesgo); P2 junto al build de Otunity Labs; **no** emprender Expo Web hasta cerrar P1 y P3, porque hoy añadiría un tercer cliente sin red de seguridad.
