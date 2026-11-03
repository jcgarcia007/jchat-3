# Levantamiento pre-envío — Bloque 0: Inventario

Fecha: 2026-11-02 · Base: main `9bd62175` (Match v2 pulido, ya con OTA publicada) · Solo lectura de código; no se aplicó nada en producción.
Método: lectura del repo (app Expo `mobile/`, dashboard `web/`, `supabase/`). Lo que no se pudo confirmar va marcado **sin verificar**.

Roles: INV invitado · CF cliente fuera de un local · CD cliente dentro (sesión de local activa) · EMP empleado · OWN dueño · ADM admin.
La app no tiene un enum de roles: CD = `VenueSessionContext.session` + `VenueDock`; OWN = `user.id === business.owner_id`; EMP = permiso `pos_access` y flags de `getChatPermissions()`. **ADM no tiene ninguna pantalla en la app móvil**: solo existe en la web (`/super-admin`).
Las pestañas reales son **Mapa, Cerca de mí, Ofertas (botón central), Mensajes, Perfil** (no hay "Inicio").

## 1. Pantallas y modales de la app

### 1.1 Orden de las compuertas (`navigation/AppNavigator.tsx`)
Recuperación de contraseña → AuthStack → Bloqueo biométrico → ConfirmAge (18+) → MainStack. Toda pantalla exige sesión; INV solo ve AuthStack (con `EntryVenueCard` si hay una entrada por QR pendiente).

| Navegador | Contenido |
|---|---|
| AuthStack | Splash, Welcome, Login, LoginEmail, RegisterStep1, RegisterStep2, ForgotPassword |
| RecoveryStack / LockStack / AgeStack | ResetPassword / Lock / ConfirmAge |
| MainStack | 30 rutas (secciones 1.2–1.9) |
| Tabs | Map, Nearby, Messages, Profile + Offers (botón central). En web no hay tabs: la raíz es `WebNoVenueScreen` |
| DMStack / SettingsStack / PosStack | DMInbox, DMChat / SettingsHome, Privacy, BlockedUsers, WorkMode, ChangePassword, MyOrders, MyReservations, PosRoot / 10 pantallas de POS |

Totales: **65 registros de ruta**, **57 pantallas vivas** (58 con `ReservationScreen`, incrustada), **~52 modales/hojas**, **7 pantallas muertas**, **14 tipos de push**.

### 1.2 Autenticación y arranque
| Pantalla | Archivo | Cómo se llega | Roles | Web |
|---|---|---|---|---|
| Splash | `screens/auth/SplashScreen.tsx` | Primera ruta (2,5 s) | INV | Sí |
| Welcome | `WelcomeScreen.tsx` | Desde Splash | INV | Sí |
| Login (Apple iOS / Google) | `LoginScreen.tsx` | Welcome | INV | Sí (Apple solo iOS) |
| LoginEmail | `LoginEmailScreen.tsx` | Login | INV | Sí (hCaptcha web) |
| RegisterStep1 / Step2 | `RegisterStep1Screen.tsx` / `RegisterStep2Screen.tsx` | Welcome o Login | INV | Sí |
| ForgotPassword / ResetPassword | `ForgotPasswordScreen.tsx` / `ResetPasswordScreen.tsx` | Login / automática tras el OTP | INV | Sí |
| Lock (Face ID / huella) | `LockScreen.tsx` | Automática si sesión restaurada y bloqueo activo | Todos | No (stub) |
| ConfirmAge (18+) | `ConfirmAgeScreen.tsx` | Automática hasta `age_confirmed_at` | Todos | Sí |
| Onboarding | `screens/onboarding/OnboardingScreen.tsx` | Una vez, si `onboarding_completed` es falso | Nuevos | Sí (pasos distintos) |

### 1.3 Pestañas y perfil/social
| Pantalla | Archivo | Cómo se llega | Roles | Web |
|---|---|---|---|---|
| Mapa | `screens/map/MapScreen.tsx` | Pestaña 1 (aterrizaje por defecto) | CF, CD, EMP, OWN | No |
| Cerca de mí | `screens/nearby/NearbyScreen.tsx` | Pestaña 2 | idem | No |
| Ofertas | `screens/offers/OffersScreen.tsx` | Botón central | idem | Sí (`WebOffers`) |
| Mensajes (DMs + notificaciones + pedidos) | `screens/dms/MessagesScreen.tsx` | Pestaña 4 | idem | Sí (`WebMessages`) |
| Perfil | `screens/profile/ProfileScreen.tsx` | Pestaña 5 | idem | No (el mismo componente sirve `UserProfile`) |
| WebNoVenue ("Entrar a un chat") | `screens/web/WebNoVenueScreen.tsx` | Raíz web | CF, CD | Solo web |
| UserProfile / ProfileSheet | `ProfileScreen.tsx` / `ProfileSheetScreen.tsx` | Avatar en chat, push `follower`, Match | Todos | Sí |
| Friends, EditProfile | `screens/friends/FriendsScreen.tsx`, `screens/profile/EditProfileScreen.tsx` | Perfil | Todos | Sí |
| CreatePost / PostDetail | `screens/feed/CreatePostScreen.tsx`, `screens/posts/PostDetailScreen.tsx` | "Publicar" en Perfil / `jchat://post/:id`, push `like`/`comment` | Todos | PostDetail sí; CreatePost no |

### 1.4 DMs y sala de chat
| Pantalla | Archivo | Cómo se llega | Roles | Web |
|---|---|---|---|---|
| DMInbox / DMChat | `screens/dms/DMInboxScreen.tsx`, `DMChatScreen.tsx` | Mensajes; push `dm`, `gift_*`, `match_match` | Todos | Sí |
| ChatRoom (2354 líneas) | `screens/chat/ChatRoomScreen.tsx` | `jchat://room/:id`, mapa, Cerca de mí, QR, VenueDock | CD tras la geocerca; OWN sin compuerta; EMP por permisos | Sí (sin escáner QR) |

### 1.5 Menú, pedidos, reservas
| Pantalla | Archivo | Roles | Web |
|---|---|---|---|
| Menu, ProductDetail, Cart | `screens/menu/MenuScreen.tsx`, `ProductDetailScreen.tsx`, `CartScreen.tsx` | CD (CF solo ver, según servidor) | No |
| MenuWebPreview | `screens/menu/MenuWebPreviewScreen.tsx` | CD, CF | WebView nativa; en web, pantalla huérfana |
| MenuSheet | `screens/menu/MenuSheetScreen.web.tsx` | CF, CD | Solo web (iframe `/m/<slug>?embed=1`) |
| Checkout, PaymentSuccess | `screens/checkout/*` | CD (CF si el servidor lo permite) | Entrada solo nativa |
| OrderTracking, MyOrders | `screens/orders/*` | CF, CD | Sí |
| MyReservations / ReservationScreen (incrustada) | `screens/reservations/*` | CF, CD | MyReservations sí |

### 1.6 Match y Truth or Dare
| Pantalla | Archivo | Roles | Web |
|---|---|---|---|
| MatchHome, MatchProfile, MatchItsAMatch, MatchActivity | `screens/match/*` | CD solamente (`useRequireMatchPresence`); OWN no juega | Sí (sin escáner QR) |
| MatchMyProfile, MatchInterests | `MatchMyProfileScreen.tsx`, `MatchInterestsScreen.tsx` | CD, CF | Sí |
| TodHome | `screens/games/TodHomeScreen.tsx` | CD (no OWN) | Sí |

### 1.7 Ajustes
Settings (`SettingsScreen.tsx`; incluye Juegos, Mi perfil de Match, borrar cuenta), Privacy, BlockedUsers, ChangePassword: todos los roles, también en web (Settings recortado, sin Modo Trabajo ni sección push). WorkMode (`WorkModeScreen.tsx`): EMP/OWN con `pos_access`, no en web.

### 1.8 Modo Trabajo / POS (EMP, OWN; no en web)
PosRoot, PosHome, PosTableHub, PosOrder, PosCheckout, PosSplit, PosPickup, PosInventory (solo `inventory_manage` o dueño), PosReceipts, PosApproval, PosMyPrinters — `screens/settings/Pos*.tsx`, dentro de `PosNavigator` (Stripe Terminal, impresión BT/TCP).

### 1.9 Pantallas muertas (registradas o no, sin ruta de entrada)
FeedScreen, StoryViewerScreen, EventsScreen, EventDetailScreen, LoyaltyScreen, GiftsReceivedScreen, PricingScreen ("Coming soon", fuera de la v1). Modales muertos: AddEmployeeSheet, ReviewList, el modal de StoryViewer, MapReactionOverlay (no montado).

### 1.10 Modales y hojas (resumen; todo vía `components/common/AppModal`)
- **Transversales:** DialogHost (alert/confirm), BiometricEnrollSheet, ImageViewerModal, ReportReasonSheet, VenueDock (barra flotante; no es modal), InviteToastHost/OpenInAppBanner (solo web).
- **Chat (17):** hoja de entrada (geocerca + juegos + incógnito), PasswordEntrySheet, MatchQrScanner (solo nativo), UserActionSheet, UserQuickCard, MessageActionSheet, PinMessageSheet, PinnedBanner, CreateOfferSheet, ChatNotificationsSheet, ChatMoreSheet, OwnProfileMenu, ProfileMenuHint, ServiceCallSheet, AttachmentPanel (en línea), GiftSheet (+ GiftPayPage web).
- **Match/ToD/regalos:** MatchSafety (menú, reporte, ayuda), MatchLightbox, TodWelcome (reglas + tutorial), TodCardModal, GiftDetails/Accept.
- **Mapa/Ofertas/Pedidos/Perfil/POS:** hoja de vista previa del local, modal de reserva, BusinessCardSheet, FilterPanel, RadiusSheet, ProcessingOverlay y ErrorSheet del checkout, hojas de "Avisar al local" y llamar al mesero, RatingPrompt, menús de perfil y de post, selector de tema, y las de POS (escáner, AdjustSheet, LinkSheet, ModifierSheet, combinar mesas, PrinterPickerSheet, banner de llamada de servicio).
- Presentaciones modales de ruta: ProfileSheet, MenuSheet (web), ProductDetail.

### 1.11 Enlaces profundos
`jchat://room/:id`, `jchat://post/:id`, `jchat://confirm?code=` (PKCE), `jchat://auth/callback` (OAuth), `jchat://stripe-return`, `jchat://c/<token>`, `jchat://v/<local>[/<mesa>-<código>]`; universales `https://<local>.jchat.cloud/[<mesa>-<código>]`, `https://jchat.cloud|<local>.jchat.cloud/c/<token>` y `/t/<token>` (AASA + `assetlinks.json`). El enlace guarda la entrada antes del login y abre el chat tras login + 18+ + onboarding; la geocerca se exige igual.

### 1.12 Push (14 tipos)
`dm`, `follower`, `like`, `comment`, `work_alert` (sin ruta, a propósito), `match_like`, `match_super`, `match_match`, `match_new_people`, `match_photo_approved`, `match_photo_rejected`, `order_status`, `gift_offer`, `gift_response`. En primer plano solo muestran banner `gift_offer`, `gift_response`, `order_status` y `match_match`. Web no tiene push.
**Defecto confirmado (mío, de Match v2):** `VALID_NOTIFICATION_TYPES` en `mobile/hooks/useNotifications.ts:392` no incluye `match_photo_approved` ni `match_photo_rejected`, así que tocar el push de esos dos tipos abre la app sin navegar (tocar la misma fila dentro de la app sí funciona). Se corrige después de tu OK; ya está en producción vía OTA.

## 2. Web

### 2.1 Sitio público `jchat.cloud` (proyecto Vercel `jchat-3`, carpeta `web/`)
| Ruta | Acceso | Contenido | ¿Enlaza privacidad / términos / borrado? |
|---|---|---|---|
| `/` | público | Landing; botón "Download app" es `href="#"` | P sí, T sí, D **no** |
| `/pricing` | público | Planes de negocio, promo, consentimiento de renovación | P, T; D no |
| `/privacy`, `/terms` | público | Contenido real EN/ES, actualizados 21-sep-2026 | pie legal: P, T, D |
| `/account/delete` | página pública; borrar exige sesión | Escribir DELETE/ELIMINAR → edge function `delete-account`; dueños reciben 409 | pie legal |
| `/support`, `/contact`, `/safety` | público | `/safety` incluye sección "Child safety (CSAE)" | pie legal |
| `/c/[token]`, `/t/[token]` | público, sin ubicación | "Puerta" del QR de sala/mesa; "Entrar al chat" va a `{local}.jchat.cloud/c/{token}` | **sin enlaces legales** |
| `/m/[slug]` | público (única página embebible) | Menú público y checkout de invitado (`?embed=1`) | sin enlaces legales |
| `/b/[slug]`, `/nearby` | público | Perfil público del negocio; lista | sin enlaces legales |
| `/o/[code]`, `/r/[code]` | público con código | Seguimiento de pedido de invitado (12 h); recibo digital | no |
| `/auth/login`, `/register`, `/welcome`, `/confirm-age`, `/callback` | público / sesión | Registro con casilla de términos; 18+ | register y confirm-age: P, T; login no |
| `/business/register`, `/business/verify` | sesión | Asistente de negocio (1744 líneas) | no |
| `/terminal` | EMP | Terminal de mesero | no |
| `sitemap.xml`, `robots.txt`, `.well-known/*` | público | Sitemap lista 8 URL; robots bloquea `/dashboard`, `/super-admin`, `/api`, `/auth` | n/a |
| `/api/csp-report`, `/api/verify`, `/api/super-admin/match-photos/remove` | POST público / sin inspeccionar / super-admin | | |

### 2.2 Dashboard (`/dashboard/*`) — solo OWN y admin
Guardia: sesión → 18+ → admin (RPC `is_platform_admin`) o plan business/pro activo. Las páginas `sales` y `summary` tienen `TODO` de acceso de empleados (no construido). 41 páginas: overview, analytics, bar, billing, chat-rooms, chat, configuration (+ businesses, devices, printers), create, disputes, employees, roles, events (+ new), floor, tables, inventory, inventory-kpis, inventory-report, purchase-suggestion, kds, metrics, loyalty, match, truth-or-dare, menu (+ assistant), offers, orders, payments, posts, queue, receipt, receipts, reports, reservations, reviews, sales, summary, service.
### 2.3 Super-admin (`/super-admin/*`) — solo ADM
Resumen, users, businesses, verification, disputes, alerts, announcements, revenue, team, locations, business-radius, radius-requests, promo-codes, afiliados. Guardia: sesión + `is_platform_admin`; si no, redirige a `/dashboard`.

### 2.4 `{local}.jchat.cloud` (Expo web)
Una sola SPA para todos los locales (`web.output: 'single'`, el local sale de `window.location.hostname`), proyecto Vercel `jchat-app-web`, comodín `*.jchat.cloud` configurado en Vercel/DNS (no está en el repo: **sin verificar**). Despliegue: `expo export -p web` → `dist`. Pantallas disponibles: ver columna "Web" de la sección 1.

### 2.5 Cabeceras, cookies, analítica
| Tema | `jchat.cloud` (`web/next.config.ts`) | `*.jchat.cloud` (`mobile/vercel.json`) |
|---|---|---|
| CSP | Aplicada; `script-src` con `'unsafe-inline'` y `'unsafe-eval'` | **Ninguna** |
| HSTS | `max-age=63072000; includeSubDomains; preload` | No en el repo (**sin verificar** en producción) |
| X-Frame-Options / frame-ancestors | DENY (salvo `/m/*`) | **Ninguna** |
| nosniff, Referrer-Policy | Sí | Sí |
| Permissions-Policy | cámara/micro desactivados | cámara/micro/ubicación `self` |
- Banner de cookies: **no existe**. Sentry/analítica en web: **ninguno** (solo Stripe JS, Google Maps, hCaptcha). Las cookies de sesión se comparten entre `jchat.cloud` y los subdominios.
- Next.js `16.4.0`. El build web puede salir con código 1 y un aviso "Your version of Next.js is affected by a known security vulnerability" (`SecurityFatalError`); **el texto no indica ni CVE ni versión corregida**, solo remite a `registry.npmjs.org/-/npm/v1/security/advisories/bulk`, y pide ejecutar `next upgrade`. **No se ejecutó.** Reintentar el mismo comando da exit 0. Qué advisory aplica y qué versión lo corrige: **sin verificar** (hay que consultar el advisory; en el FASE 6 lo haré sin actualizar nada). Aviso adicional del build: la convención `middleware` está obsoleta (usar `proxy`).
- Contactos de soporte inconsistentes: `safety@jchat.cloud`, `jgarcia@otunitylabs.com` (páginas legales), `support@jchat.cloud` y `support@jchat.app` (asistente de negocio; dominio `.app` parece obsoleto).
- Marcadores de posición en la web: enlaces de tienda (`href="#"` en la landing; `APP_STORE_URL …/id000000000` y `PLAY_STORE_URL` marcados TODO en `/b/[slug]`), JSON-LD con `https://jchat.app/b/…`, Smart App Banner comentado, `nearby` con conteo de activos fijo en 0 y textos en inglés.

## 3. Permisos

Fuente de verdad: `mobile/app.config.ts` + `mobile/config-plugins/*` + `assets/locales/{en,es}.json` (las carpetas `ios/` y `android/` locales están en `.gitignore` y son salida de prebuild **desactualizada**: no sirven como evidencia).

| Permiso | Texto (EN; ES equivalente en `assets/locales/es.json`) | Dónde se pide | Si se deniega |
|---|---|---|---|
| Ubicación mientras se usa (iOS `NSLocationWhenInUse…`; Android fine/coarse) | "JChat uses your location only while you use the app, to confirm you are at the venue and open its chat, show nearby venues on the map, and connect to card readers." | `services/geoPosition.ts`, `screens/chat/useGeofenceGate.ts` (solo al pulsar Entrar/Reintentar), `MapScreen.tsx`, `useNearbyBusinesses.ts`, `OffersScreen.tsx` | Compuerta `permission_denied`; mapa con aviso y "Abrir Ajustes" |
| Ubicación siempre / segundo plano | No declarada (claves "Always" borradas; `ACCESS_BACKGROUND_LOCATION` removida) | **Nunca se pide**. Existe código muerto `requestAlwaysPermission` en `services/geofence.ts` | n/a |
| Cámara | "JChat uses the camera to take photos for chat, posts and your profile, and to scan inventory barcodes." | ChatInput, DMChat, CreatePost, MatchMyProfile, escáneres | Alertas traducidas / botón "Conceder" |
| Fotos | "JChat uses your photos for your profile, posts, messages and Match." | **No se pide permiso**: selector del sistema (`services/photoPicker.ts`; un test lo exige) | n/a |
| Micrófono | "JChat needs access to your microphone to send voice messages." | `VoiceRecorderBar.tsx` | Alerta con "Abrir Ajustes" |
| Notificaciones | permiso del sistema | `services/notifications.ts:registerForPushNotifications` (una vez por sesión; con sesión, desbloqueada y 18+) | Silencioso, sin modal |
| Face ID / huella | "JChat uses Face ID to unlock the app when you turn on biometric lock." | `services/biometric.ts`, Settings, Checkout | Falla suave |
| Bluetooth (lector Stripe Terminal / impresoras) | "…connect to Stripe Terminal card readers…" | SDK de Terminal; `services/btPrinter.ts` (Android 12+) | Enlace a Ajustes en impresoras |
| Red local | "…connect to WiFi-enabled card readers." | SDK de Terminal; impresoras LAN | **sin verificar** |
| Movimiento | "JChat uses your device's motion sensors…" | Solo para evitar ITMS-90683 (la cámara lee el acelerómetro) | n/a |
| ATT / seguimiento | **No hay** (`NSPrivacyTracking=false`, sin SDKs de anuncios; `AD_ID` bloqueado) | | |

Android: además declara `RECORD_AUDIO`, `USE_BIOMETRIC`, `USE_FINGERPRINT` (obsoleto, probablemente sobra), `BLUETOOTH_*`, `INTERNET`, `VIBRATE`, `MODIFY_AUDIO_SETTINGS`, `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` con `AudioControlsService` (viene de `expo-audio`, **probablemente innecesario** para notas de voz y Google Play puede pedir declaración). `android:allowBackup="true"`. iOS: `UIBackgroundModes` con `bluetooth-central` (Terminal; Apple puede pedir justificación), `UISupportedExternalAccessoryProtocols: []`. Higiene: el `AndroidManifest.xml` local (ignorado por git) contiene una clave de Google Maps en claro; no se imprime aquí.

## 4. Configuración de tienda legible en el repo

| Elemento | Valor | Evidencia / observación |
|---|---|---|
| Expo SDK / RN / React | 57 (`~57.0.29`) / 0.86.3 / 19.2.3 | `mobile/package.json` |
| Bundle ID iOS / package Android | `com.otunitylabs.jchat` / `com.otunitylabs.jchat` | `app.config.ts` |
| Versión | `1.0.0` (`version`) | `app.config.ts` |
| Número de build | **gestionado en remoto** (`appVersionSource: "remote"`, `production.autoIncrement: true`); en el proyecto local `versionCode 1` / `CURRENT_PROJECT_VERSION 1` no son los reales | `eas.json`. Valor actual en EAS: **sin verificar** |
| compileSdk / targetSdk Android | **36 / 36** (`buildTools 36.0.0`) | `node_modules/react-native/gradle/libs.versions.toml` y el modelo lint de `expo` (`targetSdkVersion="36.0"`). Cumple el requisito 36. No hay `expo-build-properties` que lo cambie |
| minSdk Android | 26 | plugin `withAndroidMinSdkVersion` |
| Deployment target iOS | **16.4** (`Podfile`: `ios.deploymentTarget` no definido → 16.4) | cumple ≥ 13 |
| Imagen EAS / Xcode para iOS | `eas.json` **no define `image`** → EAS usa la predeterminada del SDK 57. Xcode local de este Mac: 27.1 (no es el de EAS) | Que EAS compile con Xcode 26/SDK iOS 26: **NO SE PUEDE VERIFICAR desde el repo**. Hay que mirar el log de un build real o `eas build:inspect` |
| Nueva arquitectura / Hermes / edge-to-edge | activas | `android/gradle.properties` local |
| Canales EAS | `development`, `preview`, `staging`, `production`; actualizaciones `u.expo.dev/6fd667cf-…`, `checkAutomatically: ON_LOAD` | `eas.json`, `app.config.ts` |
| Runtime EAS Update | política `fingerprint`: iOS `3760a588d7f43619b331660b4527b716db128d5a`, Android `1237ce003f532b7083ac3b41a60c2d0cc4dabf35` | `expo-updates fingerprint:generate`, `preflight-eas.mjs` ✔ |
| Última OTA (canal production) | iOS grupo `7138c3fe-8b3c-4a86-8b5b-88bfcb0135b2`; Android grupo `e579584a-e08c-4596-a306-4d6e5f94b72e` (commit `9bd62175`) | EAS |
| Envío a App Store | `ascAppId 6824292679` | `eas.json` |
| Manifiesto de privacidad iOS | `NSPrivacyTracking=false`; tipos recogidos declarados; APIs: UserDefaults, FileTimestamp, SystemBootTime, DiskSpace | `app.config.ts`; un test lo compara con `docs/store-listing/app-privacy-labels.md` |
| Otros | Sign in with Apple activo; dominios asociados `jchat.cloud` y `*.jchat.cloud`; Apple Pay `merchant.com.otunitylabs.jchat`; `supportsTablet: false` | |

## 5. SDKs de terceros y datos que reciben

| Servicio | Para qué | Datos que recibe | Consentimiento |
|---|---|---|---|
| Supabase (auth, DB, Storage, Realtime, funciones) | Backend | Correo, nombre, teléfono, año de nacimiento, contenido (mensajes, fotos, voz), pedidos, token push; coordenadas solo hacia la RPC de geocerca (no se guardan, según la propia app) | Términos + 18+ al registrarse |
| Sentry (solo móvil) | Errores y rendimiento | `sendDefaultPii:false`, `setUser({id})`; `beforeSend` quita correo, IP, ubicación y tokens; replay solo en error y enmascarado. Inactivo si no hay DSN | **Sin opt-out dentro de la app**; declarado como diagnósticos |
| Stripe (pagos, Connect, Terminal, Billing) | Pedidos, regalos, propinas, cobros presenciales y planes del dueño | Tarjeta directo a Stripe; el servidor envía correo, importes y metadatos. Terminal `0.0.1-beta.32` (**beta**) | La propia acción de pago |
| Expo Push → FCM/APNs | Notificaciones | Token push; título, **texto del mensaje** y nombre del remitente pasan por los servidores de Expo | Permiso del sistema |
| Firebase | Solo configuración FCM (sin Analytics/Crashlytics) | Token del dispositivo vía Expo | n/a |
| EAS Update | OTA | Versión del dispositivo/app | Ninguno |
| Google Maps | Mapa Android y dashboard web | Teselas y viewport; la posición del usuario se muestra en local | Permiso de ubicación |
| **Google Cloud Vision (SafeSearch)** | Moderación automática de fotos de Match y de DMs | **Los bytes completos de cada foto** se envían a Vision | **No hay diálogo de consentimiento**; **sin verificar** si privacidad/términos lo mencionan |
| Anthropic / OpenAI / Google Gemini | Asistente de menú (texto e imágenes) | Solo datos del negocio (tipo, nombres de platos) y prompts; **no datos de clientes** | Iniciado por el dueño (plan Pro) |
| hCaptcha | Anti-bots en registro/login y pagos de invitado | Señales del dispositivo e IP | Ninguno adicional |
| Apple / Google Sign-In | Acceso | Token de identidad, nombre/correo | Hoja del proveedor |
| Resend | Aviso por correo a `safety@jchat.cloud` en reportes urgentes | Id de reporte, motivo, tipo, enlace | n/a |
| Impresión BT (Classic) / TCP LAN | Comandas y recibos | Datos del pedido a la impresora local | Permiso del sistema |
| Anuncios / analítica / atribución | **Ninguno** | | |
- **Corregido (2026-11-02, solo lectura en producción):** sí existe un filtro de palabras en la BD: el trigger `trg_message_filter` (función `message_is_objectionable`) actúa sobre `messages`, `comments` y `dm_messages`. **No** cubre `posts.caption`, `tod_cards.body`, `users.bio`/`display_name`/`username` ni `rooms.name`/`description`. Imágenes: Vision. Reportes: ver arriba.

## 6. Seguridad, moderación y borrado de cuenta (para la FASE 6)
- **Reportar/bloquear:** chat (mensaje/usuario), DMs, posts y comentarios, historias, perfiles, Match (`match_report`, ayuda discreta), Truth or Dare (reporte del mensaje + autoocultar por reportes + términos propios), bloqueo con pantalla de gestión. **Reseñas usan otra vía** (`reportReview` solo cambia el estado a `reported`; la cola de moderación de reseñas es TODO). Reporte central `report_content` con 9 motivos (`child_safety` primero), tope de 20/día, correo urgente. Moderación por local: silenciar, vetar, avisar, expulsar, con registro.
- **18+:** RPC `confirm_age` en servidor; guarda solo el año de nacimiento; autodeclarado, sin verificación de documento. Términos `TERMS_VERSION 2026-10`. **No encontré comprobación en servidor de edad/términos en la publicación ordinaria (posts, chat, DMs)** ni re-aceptación al cambiar la versión (**sin verificar**).
- **Borrado de cuenta:** en la app (Ajustes → dos confirmaciones → función `delete-account`) y en la web (`/account/delete`). **Bloqueado con 409 si el usuario es dueño de un negocio** (debe escribir a `safety@jchat.cloud`). **No elimina objetos de Storage** (avatares, fotos de posts/historias/DM/Match, voz) **ni cancela suscripciones de Stripe** (**sin verificar** si hay limpieza del lado de la base de datos).

## 7. Cuenta de revisor
Existe un kit en `docs/app-review/` (`RUNBOOK-revisor.md`, `notas-revisor-apple.md`, `notas-revisor-google.md`, `google-data-safety.md`, `ficha-tienda.md`) y un local de demostración (`https://jchat-demo.jchat.cloud`, 4 personas ficticias, presencia de 14 días) que Juan crea con `supabase/scripts/demo_venue_seed.sql` tras crear la cuenta de revisor. **La cuenta de revisor no está en el repo y no sé si ya existe en producción**: hay que confirmarlo con Juan. El kit lista cosas "sin comprobar en pantalla" (Cerca de mí muestra "JChat Demo", Match con perfiles de demo, `fix/store-blockers` fusionada, pedido con tarjeta de prueba).

## 8. Candidatos a hallazgo detectados durante el inventario (aún sin probar en dispositivo)
| # | Tema | Severidad provisional | Nota |
|---|---|---|---|
| C-1 | Push de `match_photo_approved/rejected` no navega al tocarlo | P2 | Confirmado en código; mío |
| C-2 | Dueños no pueden borrar su cuenta desde la app (409) | P1 | Apple 5.1.1(v) pide borrado dentro de la app; hoy exige correo a soporte |
| C-3 | Borrado de cuenta sin purga de Storage ni cancelación de Stripe | P1 | Verificar en BD |
| C-4 | Filtro de palabras existente en `messages`, `comments` y `dm_messages`; faltan posts, retos de ToD, perfil y salas (corregido; ver `RESUMEN.md` §2.2) | P1 (decisión de Juan: opción B) | Apple 1.2 pide método de filtrado de contenido ofensivo (el reporte, el bloqueo y la moderación humana ya existen) |
| C-5 | Fotos a Google Vision sin divulgación/consentimiento verificable | P1 | Apple 5.1.1/5.1.2, Play Data safety |
| C-6 | Enlaces de tienda de relleno (`#`, `id000000000`) y JSON-LD con dominio `.app` | P1 (2.1 placeholders) | Web |
| C-7 | CSAE sin URL propia (sección dentro de `/safety`) | P1 Play | Usar `https://jchat.cloud/safety` o crear página |
| C-8 | `*.jchat.cloud` sin CSP, X-Frame-Options ni HSTS en el repo | P2 | Web |
| C-9 | Sin banner de cookies pese a cookies compartidas | P2 | Web, según jurisdicción |
| C-10 | Correos de soporte inconsistentes (`.app`/`.cloud`/otunitylabs) | P2 | Web y asistente de negocio |
| C-11 | Páginas públicas de cliente (`/c`, `/t`, `/m`, `/b`) sin enlaces legales | P2 | |
| C-12 | `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `USE_FINGERPRINT`, `MODIFY_AUDIO_SETTINGS` probablemente sobran; `allowBackup=true` | P2 | Play |
| C-13 | Código muerto `requestAlwaysPermission` (puede confundir al revisor) y 7 pantallas muertas | P3 | |
| C-14 | Stripe Terminal en beta; `bluetooth-central` en segundo plano | P2 | Justificar a Apple |
| C-15 | Reseñas con ruta de reporte distinta; sin cola de moderación | P2 | |
| C-16 | Empleados sin herramientas de moderación (TODO en ChatRoom) | P3 | |
| C-17 | Sentry sin opt-out en la app | P3 | |
| C-18 | Advertencia de Next 16.4.0 en el build y `middleware`→`proxy` | P2 | Informar, no actualizar |

## 9. Propuesta de bloques para la FASE 5 (11 bloques, orden sugerido por riesgo de rechazo)

| # | Bloque | Contenido | Por qué en este orden |
|---|---|---|---|
| 1 | Arranque, acceso y 18+ | Splash, Welcome, Login (Apple/Google/correo), Registro 1–2, Recuperar/Restablecer, Lock biométrico, ConfirmAge, Onboarding, entrada por QR/enlace antes del login | Es lo primero que ve el revisor; incluye 4.8 y 5.1.1 |
| 2 | Cuenta, privacidad y seguridad | Ajustes, Privacidad, Usuarios bloqueados, Cambiar contraseña, Borrar cuenta (cliente y dueño), Mi perfil de Match (entrada), páginas legales web | Puntos duros de Apple/Google: 5.1.1(v), App Privacy, Data safety |
| 3 | Entrada a un local y sala de chat | Compuerta de geocerca, hoja de entrada (juegos, idioma), ChatRoom, sub-salas, mensajes, anclados, ofertas, hojas de usuario/mensaje, reportar/bloquear, VenueDock | Contenido de usuarios (1.2) y ubicación |
| 4 | DMs, notificaciones y regalos | Mensajes, DMInbox/Chat, fotos con moderación, regalos, push y enlaces profundos (incluye C-1) | Contenido de usuarios y permisos |
| 5 | Match v2 | Perfil, intereses, baraja, Match mutuo, actividad, seguridad, fotos en revisión | Datos sensibles y 18+; ya probado en parte |
| 6 | Truth or Dare | Reglas, cartas, publicar, reportar | Contenido adulto y clasificación |
| 7 | Mapa, Cerca de mí y Ofertas | Mapa, filtros, vista previa, búsqueda, Cerca de mí, Ofertas (radio), tarjeta de local, reserva | Ubicación y flujo principal |
| 8 | Perfil y social | Perfil propio/ajeno, editar, amigos, publicar, post y comentarios | UGC |
| 9 | Menú, pedidos y pagos del cliente | Menú, producto, carrito, checkout (Stripe), éxito, seguimiento, mis pedidos, reservas, reseñas | 3.1.1/3.1.3 |
| 10 | Modo Trabajo / POS (empleado y dueño) | PIN, mesas, pedidos, cobro, dividir, recoger, inventario, recibos, impresoras, aprobaciones | Bluetooth, Terminal beta, permisos |
| 11 | Web: dashboard, super-admin y web pública | Dashboard (con la cuenta de la dueña, sin cambiar configuración real), jchat.cloud, `{local}.jchat.cloud`, Lighthouse | Cierra con FASE 6 |

Plataformas para cada bloque: iOS (simulador reciente + uno pequeño tipo SE), Android (API 36 + uno antiguo ≥ 26) y web móvil donde exista.
