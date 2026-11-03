# JChat — Levantamiento pre-envío a tiendas: RESUMEN (BORRADOR)

Fecha: 2026-11-02 · Base: main `9bd62175` (OTA vigente) · Producción solo en lectura · Nada commiteado.
**Estado: cierre de la auditoría (2026-11-03).** Todos los bloques están hechos; lo marcado **«pendiente»** o «no probado» es lo que no se pudo ejercitar y está listado en cada informe y en §6. Los informes de detalle y las capturas están en esta carpeta (`00`…`11`, `screenshots/b01`…`b11`).

## 0. Estado de los bloques
| Bloque | Informe | Estado |
|---|---|---|
| 0 Inventario | `00-inventario.md` | Hecho |
| 1 Arranque / acceso / 18+ | `01-arranque-acceso.md` | **Hecho** (Onboarding y prueba de menor de 18 con registro por correo realizadas; ConfirmAge no aparece con ese registro; Lock y Splash sin probar, ver §6) |
| 2 Cuenta / privacidad / seguridad | `02-cuenta-privacidad-seguridad.md` | **Hecho (2026-11-03)**: borrado desde la app OK (también con un mensaje de chat: B2-1 verificado), 0 filas en las 9 tablas, **4 archivos huérfanos en Storage** (17 en total), prueba de menor de 18 rechazada sin crear cuenta. Sin verificar: hilo de DM y foto de Match. Android 35, build de desarrollo |
| 3 Entrada a local / chat | `03-entrada-local-chat.md` | Hecho (con lo no probado listado) |
| 4 DMs / notificaciones / regalos | `04-dms-notificaciones-regalos.md` | Hecho (B4-1 sin reproducir en móvil real) |
| 5 Match v2 | `05-match-v2.md` | Hecho |
| 6 Truth or Dare | `06-truth-or-dare.md` | **Hecho**: reglas sin aceptación previa probadas (2026-11-03) |
| 7 Mapa / Cerca / Ofertas | `07-mapa-cerca-busqueda.md` | Hecho |
| 8 Perfil y social | `08-perfil-social.md` | Hecho |
| 9 Menú / pedidos / pagos | `09-menu-pedidos-pagos.md` | Hecho (sin pagos reales) |
| 10 Modo Trabajo / permisos | `10-modo-trabajo-permisos.md` | **Hecho** (las pantallas detrás del PIN del POS solo se revisaron por código; ver B11-15) |
| 11 Web | `11-web-dashboard-publico.md` | **Completo (2026-11-03)**: páginas públicas y dashboard de @jchatreview en solo lectura (§6 del informe). **Sin visitar, P3 para revisar si da tiempo:** Analytics, Reviews, Loyalty, Posts, Inventory, KDS, Tables, Devices, Printers y Businesses |

## 1. Resumen de los Bloques 0 y 1 (pegado tal como está en `00` y `01`)

### Levantamiento pre-envío — Bloque 0: Inventario

Fecha: 2026-11-02 · Base: main `9bd62175` (Match v2 pulido, ya con OTA publicada) · Solo lectura de código; no se aplicó nada en producción.
Método: lectura del repo (app Expo `mobile/`, dashboard `web/`, `supabase/`). Lo que no se pudo confirmar va marcado **sin verificar**.

Roles: INV invitado · CF cliente fuera de un local · CD cliente dentro (sesión de local activa) · EMP empleado · OWN dueño · ADM admin.
La app no tiene un enum de roles: CD = `VenueSessionContext.session` + `VenueDock`; OWN = `user.id === business.owner_id`; EMP = permiso `pos_access` y flags de `getChatPermissions()`. **ADM no tiene ninguna pantalla en la app móvil**: solo existe en la web (`/super-admin`).
Las pestañas reales son **Mapa, Cerca de mí, Ofertas (botón central), Mensajes, Perfil** (no hay "Inicio").

#### 1. Pantallas y modales de la app

##### 1.1 Orden de las compuertas (`navigation/AppNavigator.tsx`)
Recuperación de contraseña → AuthStack → Bloqueo biométrico → ConfirmAge (18+) → MainStack. Toda pantalla exige sesión; INV solo ve AuthStack (con `EntryVenueCard` si hay una entrada por QR pendiente).

| Navegador | Contenido |
|---|---|
| AuthStack | Splash, Welcome, Login, LoginEmail, RegisterStep1, RegisterStep2, ForgotPassword |
| RecoveryStack / LockStack / AgeStack | ResetPassword / Lock / ConfirmAge |
| MainStack | 30 rutas (secciones 1.2–1.9) |
| Tabs | Map, Nearby, Messages, Profile + Offers (botón central). En web no hay tabs: la raíz es `WebNoVenueScreen` |
| DMStack / SettingsStack / PosStack | DMInbox, DMChat / SettingsHome, Privacy, BlockedUsers, WorkMode, ChangePassword, MyOrders, MyReservations, PosRoot / 10 pantallas de POS |

Totales: **65 registros de ruta**, **57 pantallas vivas** (58 con `ReservationScreen`, incrustada), **~52 modales/hojas**, **7 pantallas muertas**, **14 tipos de push**.

##### 1.2 Autenticación y arranque
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

##### 1.3 Pestañas y perfil/social
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

##### 1.4 DMs y sala de chat
| Pantalla | Archivo | Cómo se llega | Roles | Web |
|---|---|---|---|---|
| DMInbox / DMChat | `screens/dms/DMInboxScreen.tsx`, `DMChatScreen.tsx` | Mensajes; push `dm`, `gift_*`, `match_match` | Todos | Sí |
| ChatRoom (2354 líneas) | `screens/chat/ChatRoomScreen.tsx` | `jchat://room/:id`, mapa, Cerca de mí, QR, VenueDock | CD tras la geocerca; OWN sin compuerta; EMP por permisos | Sí (sin escáner QR) |

##### 1.5 Menú, pedidos, reservas
| Pantalla | Archivo | Roles | Web |
|---|---|---|---|
| Menu, ProductDetail, Cart | `screens/menu/MenuScreen.tsx`, `ProductDetailScreen.tsx`, `CartScreen.tsx` | CD (CF solo ver, según servidor) | No |
| MenuWebPreview | `screens/menu/MenuWebPreviewScreen.tsx` | CD, CF | WebView nativa; en web, pantalla huérfana |
| MenuSheet | `screens/menu/MenuSheetScreen.web.tsx` | CF, CD | Solo web (iframe `/m/<slug>?embed=1`) |
| Checkout, PaymentSuccess | `screens/checkout/*` | CD (CF si el servidor lo permite) | Entrada solo nativa |
| OrderTracking, MyOrders | `screens/orders/*` | CF, CD | Sí |
| MyReservations / ReservationScreen (incrustada) | `screens/reservations/*` | CF, CD | MyReservations sí |

##### 1.6 Match y Truth or Dare
| Pantalla | Archivo | Roles | Web |
|---|---|---|---|
| MatchHome, MatchProfile, MatchItsAMatch, MatchActivity | `screens/match/*` | CD solamente (`useRequireMatchPresence`); OWN no juega | Sí (sin escáner QR) |
| MatchMyProfile, MatchInterests | `MatchMyProfileScreen.tsx`, `MatchInterestsScreen.tsx` | CD, CF | Sí |
| TodHome | `screens/games/TodHomeScreen.tsx` | CD (no OWN) | Sí |

##### 1.7 Ajustes
Settings (`SettingsScreen.tsx`; incluye Juegos, Mi perfil de Match, borrar cuenta), Privacy, BlockedUsers, ChangePassword: todos los roles, también en web (Settings recortado, sin Modo Trabajo ni sección push). WorkMode (`WorkModeScreen.tsx`): EMP/OWN con `pos_access`, no en web.

##### 1.8 Modo Trabajo / POS (EMP, OWN; no en web)
PosRoot, PosHome, PosTableHub, PosOrder, PosCheckout, PosSplit, PosPickup, PosInventory (solo `inventory_manage` o dueño), PosReceipts, PosApproval, PosMyPrinters — `screens/settings/Pos*.tsx`, dentro de `PosNavigator` (Stripe Terminal, impresión BT/TCP).

##### 1.9 Pantallas muertas (registradas o no, sin ruta de entrada)
FeedScreen, StoryViewerScreen, EventsScreen, EventDetailScreen, LoyaltyScreen, GiftsReceivedScreen, PricingScreen ("Coming soon", fuera de la v1). Modales muertos: AddEmployeeSheet, ReviewList, el modal de StoryViewer, MapReactionOverlay (no montado).

##### 1.10 Modales y hojas (resumen; todo vía `components/common/AppModal`)
- **Transversales:** DialogHost (alert/confirm), BiometricEnrollSheet, ImageViewerModal, ReportReasonSheet, VenueDock (barra flotante; no es modal), InviteToastHost/OpenInAppBanner (solo web).
- **Chat (17):** hoja de entrada (geocerca + juegos + incógnito), PasswordEntrySheet, MatchQrScanner (solo nativo), UserActionSheet, UserQuickCard, MessageActionSheet, PinMessageSheet, PinnedBanner, CreateOfferSheet, ChatNotificationsSheet, ChatMoreSheet, OwnProfileMenu, ProfileMenuHint, ServiceCallSheet, AttachmentPanel (en línea), GiftSheet (+ GiftPayPage web).
- **Match/ToD/regalos:** MatchSafety (menú, reporte, ayuda), MatchLightbox, TodWelcome (reglas + tutorial), TodCardModal, GiftDetails/Accept.
- **Mapa/Ofertas/Pedidos/Perfil/POS:** hoja de vista previa del local, modal de reserva, BusinessCardSheet, FilterPanel, RadiusSheet, ProcessingOverlay y ErrorSheet del checkout, hojas de "Avisar al local" y llamar al mesero, RatingPrompt, menús de perfil y de post, selector de tema, y las de POS (escáner, AdjustSheet, LinkSheet, ModifierSheet, combinar mesas, PrinterPickerSheet, banner de llamada de servicio).
- Presentaciones modales de ruta: ProfileSheet, MenuSheet (web), ProductDetail.

##### 1.11 Enlaces profundos
`jchat://room/:id`, `jchat://post/:id`, `jchat://confirm?code=` (PKCE), `jchat://auth/callback` (OAuth), `jchat://stripe-return`, `jchat://c/<token>`, `jchat://v/<local>[/<mesa>-<código>]`; universales `https://<local>.jchat.cloud/[<mesa>-<código>]`, `https://jchat.cloud|<local>.jchat.cloud/c/<token>` y `/t/<token>` (AASA + `assetlinks.json`). El enlace guarda la entrada antes del login y abre el chat tras login + 18+ + onboarding; la geocerca se exige igual.

##### 1.12 Push (14 tipos)
`dm`, `follower`, `like`, `comment`, `work_alert` (sin ruta, a propósito), `match_like`, `match_super`, `match_match`, `match_new_people`, `match_photo_approved`, `match_photo_rejected`, `order_status`, `gift_offer`, `gift_response`. En primer plano solo muestran banner `gift_offer`, `gift_response`, `order_status` y `match_match`. Web no tiene push.
**Defecto confirmado (mío, de Match v2):** `VALID_NOTIFICATION_TYPES` en `mobile/hooks/useNotifications.ts:392` no incluye `match_photo_approved` ni `match_photo_rejected`, así que tocar el push de esos dos tipos abre la app sin navegar (tocar la misma fila dentro de la app sí funciona). Se corrige después de tu OK; ya está en producción vía OTA.

#### 2. Web

##### 2.1 Sitio público `jchat.cloud` (proyecto Vercel `jchat-3`, carpeta `web/`)
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

##### 2.2 Dashboard (`/dashboard/*`) — solo OWN y admin
Guardia: sesión → 18+ → admin (RPC `is_platform_admin`) o plan business/pro activo. Las páginas `sales` y `summary` tienen `TODO` de acceso de empleados (no construido). 41 páginas: overview, analytics, bar, billing, chat-rooms, chat, configuration (+ businesses, devices, printers), create, disputes, employees, roles, events (+ new), floor, tables, inventory, inventory-kpis, inventory-report, purchase-suggestion, kds, metrics, loyalty, match, truth-or-dare, menu (+ assistant), offers, orders, payments, posts, queue, receipt, receipts, reports, reservations, reviews, sales, summary, service.
##### 2.3 Super-admin (`/super-admin/*`) — solo ADM
Resumen, users, businesses, verification, disputes, alerts, announcements, revenue, team, locations, business-radius, radius-requests, promo-codes, afiliados. Guardia: sesión + `is_platform_admin`; si no, redirige a `/dashboard`.

##### 2.4 `{local}.jchat.cloud` (Expo web)
Una sola SPA para todos los locales (`web.output: 'single'`, el local sale de `window.location.hostname`), proyecto Vercel `jchat-app-web`, comodín `*.jchat.cloud` configurado en Vercel/DNS (no está en el repo: **sin verificar**). Despliegue: `expo export -p web` → `dist`. Pantallas disponibles: ver columna "Web" de la sección 1.

##### 2.5 Cabeceras, cookies, analítica
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

#### 3. Permisos

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

#### 4. Configuración de tienda legible en el repo

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

#### 5. SDKs de terceros y datos que reciben

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
- No existe moderación automática de texto ni filtro de palabras (solo reportes + Vision para imágenes).

#### 6. Seguridad, moderación y borrado de cuenta (para la FASE 6)
- **Reportar/bloquear:** chat (mensaje/usuario), DMs, posts y comentarios, historias, perfiles, Match (`match_report`, ayuda discreta), Truth or Dare (reporte del mensaje + autoocultar por reportes + términos propios), bloqueo con pantalla de gestión. **Reseñas usan otra vía** (`reportReview` solo cambia el estado a `reported`; la cola de moderación de reseñas es TODO). Reporte central `report_content` con 9 motivos (`child_safety` primero), tope de 20/día, correo urgente. Moderación por local: silenciar, vetar, avisar, expulsar, con registro.
- **18+:** RPC `confirm_age` en servidor; guarda solo el año de nacimiento; autodeclarado, sin verificación de documento. Términos `TERMS_VERSION 2026-10`. **No encontré comprobación en servidor de edad/términos en la publicación ordinaria (posts, chat, DMs)** ni re-aceptación al cambiar la versión (**sin verificar**).
- **Borrado de cuenta:** en la app (Ajustes → dos confirmaciones → función `delete-account`) y en la web (`/account/delete`). **Bloqueado con 409 si el usuario es dueño de un negocio** (debe escribir a `safety@jchat.cloud`). **No elimina objetos de Storage** (avatares, fotos de posts/historias/DM/Match, voz) **ni cancela suscripciones de Stripe** (**sin verificar** si hay limpieza del lado de la base de datos).

#### 7. Cuenta de revisor
Existe un kit en `docs/app-review/` (`RUNBOOK-revisor.md`, `notas-revisor-apple.md`, `notas-revisor-google.md`, `google-data-safety.md`, `ficha-tienda.md`) y un local de demostración (`https://jchat-demo.jchat.cloud`, 4 personas ficticias, presencia de 14 días) que Juan crea con `supabase/scripts/demo_venue_seed.sql` tras crear la cuenta de revisor. **La cuenta de revisor no está en el repo y no sé si ya existe en producción**: hay que confirmarlo con Juan. El kit lista cosas "sin comprobar en pantalla" (Cerca de mí muestra "JChat Demo", Match con perfiles de demo, `fix/store-blockers` fusionada, pedido con tarjeta de prueba).

#### 8. Candidatos a hallazgo detectados durante el inventario (aún sin probar en dispositivo)
| # | Tema | Severidad provisional | Nota |
|---|---|---|---|
| C-1 | Push de `match_photo_approved/rejected` no navega al tocarlo | P2 | Confirmado en código; mío |
| C-2 | Dueños no pueden borrar su cuenta desde la app (409) | P1 | Apple 5.1.1(v) pide borrado dentro de la app; hoy exige correo a soporte |
| C-3 | Borrado de cuenta sin purga de Storage ni cancelación de Stripe | P1 | **CONFIRMADO en producción (2026-11-02, solo lectura): 13 objetos huérfanos; ver §2.2 «Borrado de cuenta»** |
| C-4 | ~~Sin filtro automático de texto~~ **CORREGIDO (2026-11-02): sí existe un filtro de palabras en la BD para chat, comentarios y DMs; faltan posts, ToD y la lista es corta (ver §2.2)** | P1 (decisión de Juan) | Apple 1.2 pide método de filtrado de contenido ofensivo (el reporte, el bloqueo y la moderación humana ya existen) |
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

#### 9. Propuesta de bloques para la FASE 5 (11 bloques, orden sugerido por riesgo de rechazo)

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


### Bloque 1 — Arranque, acceso y 18+ (parcial)

Fecha: 2026-11-02 · main `9bd62175` + OTA del mismo commit · Evidencia: `screenshots/b01/` (31 capturas, sin commit).
Estado: **PARCIAL** (actualizado tras instalar más dispositivos). Se probó todo lo que se puede hacer sin credenciales ni crear cuentas; el resto se lista en "No probado".

#### Dispositivos usados
| Plataforma | Dispositivo | Notas |
|---|---|---|
| Android 36 | AVD **Pixel_API36** (Google Play, arm64), sesión limpia | Instalado en esta sesión con `sdkmanager` (herramientas de línea de comandos de Google, `dl.google.com`, SHA-256 `7bc5c72b…7e64` coincide con el publicado) |
| Android 35 | AVD **Pixel_8_clean**, sesión limpia | Clon de Pixel_8 con `-wipe-data` |
| Android 26 (mínimo soportado, `minSdk 26`) | AVD **Pixel_API26** (Google APIs, arm64), sesión limpia, barra de navegación de 3 botones | Instalado en esta sesión |
| iOS | **iPhone 17e**, iOS 26.5, sesión limpia (app copiada desde el simulador de @test) | **iOS anterior no disponible**: Xcode 27.1 responde "iOS 18.6 / 18.2 / 18.0 / 17.5 is not available for download". **iPhone SE no existe**: Xcode 27 ya no trae ese tipo de dispositivo; el más pequeño es el 16e/17e (6,1") |
| Web | Chromium (Playwright) a 375×812 y 430×932; **Safari iOS** real en el simulador (carga correcta de Welcome) contra `bar-xzx-omd2.jchat.cloud` | Chrome Android real no probado (el emulador trae Chrome pero no se abrió la web allí) |

La app instalada en los emuladores es la compilación de desarrollo local (APK de depuración) con el JS actual servido por Metro; los binarios nativos de las tiendas (EAS) no se pueden probar sin `eas build`.

Para no perder las sesiones de @test y @test1 (no tengo sus contraseñas), todo lo "sin sesión" se hizo en los dispositivos limpios. Esos dos dispositivos siguen en producción solo como lectura: no se creó ninguna cuenta ni se envió ningún formulario de registro; los únicos intentos contra el servidor fueron un inicio de sesión vacío, uno con correo mal formado y un envío de código con correo mal formado (los dos últimos pararon en hCaptcha, que no se resolvió).

#### Resultado por pantalla
| Pantalla | Android 35 | iOS 17e | Web 375/430 | Veredicto |
|---|---|---|---|---|
| Welcome | OK en API 26, 35 y 36 (EN/ES) | OK; Safari iOS carga bien | OK, sin desbordes ni objetivos pequeños | OK (ver B1-8) |
| Login (Apple/Google/correo) | OK a 1,0× y 1,5×; degradado a 2,0×; en **API 26 con 3 botones el enlace "Create account" nace tapado por la barra (B1-11)** | **Falla con letra máxima (B1-1)** | OK; objetivo pequeño (B1-3), `lang` fijo (B1-4) | Con hallazgos |
| LoginEmail | Vacío → diálogo "Missing fields" (igual en API 26, 35, 36); correo inválido → hCaptcha (B1-5) | — | — | Con hallazgos |
| ForgotPassword | Vacío → "Please enter a valid email address." (API 26, 35, 36); correo inválido → hCaptcha, una vez no cargó el verificador (B1-5) | — | — | Con hallazgos |
| RegisterStep1 | (API 35 y 36) `Continue` desactivado hasta ser válido; lista de reglas de contraseña en vivo y con estado leído ("met"/"pending") | — | — | OK |
| RegisterStep2 | Se llegó a verla (fecha de nacimiento, idioma, usuario, términos, "Create my account"); **no se envió** | — | — | Sin probar el envío |
| Splash, ResetPassword, Lock, ConfirmAge, Onboarding, EntryVenueCard | — | — | — | **No probado** (ver abajo) |

#### Hallazgos
| ID | Sev. | Pantalla / plataforma | Pasos | Esperado → Obtenido | Captura | Propuesta (sin implementar) |
|---|---|---|---|---|---|---|
| B1-1 (agrupado en DT-1, ver 07) | **P1** | Login · iOS 17e | `xcrun simctl ui content_size accessibility-extra-extra-extra-large`, abrir Login | La pantalla debe seguir siendo usable con Dynamic Type → el titular se parte letra a letra ("You / r / plac…"), "JCH / LOCAL" se desborda, los botones "Continue with email" y "Google" quedan cortados y el contenido se sale por la derecha; el selector ES/EN queda recortado | `ios17e-04-login-dynamictype-AXXXL.png`, `ios17e-05-login-AXXXL-scroll.png` | Limitar `maxFontSizeMultiplier` en la tarjeta (≈1,3–1,5), permitir que la tarjeta crezca/haga scroll y que la fila de marca envuelva |
| B1-2 | P2 | Login · Android 35 a 2,0× | `settings put system font_scale 2.0` | Texto usable → la fila de marca se corta ("JCH / LOCAL / 01"), "Continuar con email" pisa su flecha y el enlace "Crear cuenta" queda bajo la barra de gestos | `android35-18-login-fuente200-es.png` | Mismo arreglo que B1-1; respetar el inset inferior |
| B1-3 | P2 | Login · web 375 | Medir objetivos táctiles | WCAG 2.2 AA (2.5.8) pide ≥ 24 px → el enlace "Create account" mide **107×21**; los botones de idioma 44×32 (el estándar de la tienda es 44) | `web375-02-login.png` | Añadir relleno/`hitSlop` a los enlaces de texto y a los botones de idioma |
| B1-4 | P2 | Todas · web | Cambiar a español | `<html lang>` debe cambiar → se queda en `en`; el título de la pestaña ("Login") tampoco se traduce | (medido con script) | Actualizar `document.documentElement.lang` y el título al cambiar de idioma (WCAG 3.1.1) |
| B1-5 | P2 | LoginEmail y ForgotPassword · Android | Correo `notanemail` / `bad@` y pulsar Entrar / Enviar código | Validar el formato antes de nada → se pasa directo al desafío hCaptcha (arrastrar una forma). Si se cancela: "Verification needed". Una vez el verificador no cargó ("We couldn't load the verification") | `android35-05-loginemail-invalido-en.png`, `android35-06-tras-captcha-back.png`, `android35-09-forgot-invalido-en.png` | Validar formato de correo en el cliente antes de pedir captcha; reintento visible si el captcha no carga |
| B1-6 | P2 | Login / Registro · Android e iOS | Ver los botones sociales | Marca oficial → en Android "Apple" y "Google" son solo texto; en iOS el botón de Apple sí es el negro con logo, pero el de Google no lleva la "G" (TODO ya anotado en el código) | `android35-02-login-en.png`, `ios17e-03-login.png` | Usar el botón estándar de Apple (HIG) y el logo de Google (guía de marca de Google) |
| B1-7 | P3 | Login vs Registro/Olvidé · ES | Comparar textos | Un solo término → "Continuar con **email**" / "Entra con tu email" frente a "**CORREO**" en registro y recuperación | `android35-20-login-es.png`, `android35-23-register1-es.png` | Unificar a "correo" |
| B1-8 | P3 | Welcome · todas | Ver la pantalla | Indicador de 4 pasos ("Step 1 of 4", puntos) en una pantalla sin carrusel visible, con un icono de móvil genérico como ilustración | `ios17e-02-welcome.png`, `web375-01-welcome.png` | Confirmar con diseño si es un carrusel (no probé el deslizamiento: **sin verificar**) o quitar los puntos |
| B1-9 | P3 | RegisterStep1 · Android | Teclado cerrado | Botones sociales visibles → los botones "Apple"/"Google" de abajo se cruzan con la barra de gestos (hay que desplazar) | `android35-12-register1-clave-corta-en.png` | Añadir relleno inferior por el inset de navegación |
| B1-10 | P3 | Web | Abrir cualquier pantalla | Consola limpia → 2 avisos en cada carga: `expo-notifications` (token push no soportado en web) y `useNativeDriver` | `.playwright-mcp/console-*.log` | Silenciar el listener de push en web |
| B1-11 | P2 | Login · Android 26 (barra de 3 botones) | Abrir Login | Todo el contenido visible → el pie "New here? Create account" aparece debajo de la barra de navegación; el primer toque cae en la barra (no abre el registro). Al desplazar la tarjeta sí aparece (no hay indicio de que se pueda desplazar). **Probable en cualquier Android con navegación de 3 botones; no verificado en API 35/36** | `android26-02-login.png`, `android26-06-login-scroll.png`, `android26-05-register1.png` | Aplicar el inset inferior y/o quitar el espacio muerto de la tarjeta para que el enlace quede sobre la barra |

Cosas que están bien (para que no se pierdan): lista de reglas de contraseña con estado leído por lector de pantalla, `Continue` desactivado hasta que el formulario es válido, nombres de accesibilidad presentes en los controles del Login (Show password, Go back, Language), mensajes de error con diálogo y botón OK, cancelar hCaptcha no deja la pantalla bloqueada, idioma ES completo en Login, LoginEmail, Olvidé y Registro 1 (sin claves sin traducir), foco visible en web (contorno del navegador), sin desbordes horizontales en web a 375 y 430, y tema oscuro sin cambios de contraste (la tarjeta de acceso es fija y clara).

#### No probado (y por qué)
| Qué | Motivo |
|---|---|
| iOS anterior a 26.5 e iPhone SE | Imposible con Xcode 27.1 (no ofrece runtimes 17/18 ni el tipo de dispositivo SE). Alternativa: un iPhone físico o una Mac con Xcode anterior |
| Chrome Android real; Safari iOS más allá de cargar Welcome | Solo se verificó que Welcome carga en Safari iOS; el resto de la web se midió en Chromium |
| Registro paso 2 enviado, edad menor de 18, términos | Enviar crea una cuenta real en producción (no permitido) |
| ConfirmAge, Lock biométrico, ResetPassword, Onboarding, Splash | Requieren sesión o un correo de recuperación; @test/@test1 ya están dentro y no tengo sus contraseñas |
| Apple / Google OAuth completos | Piden credenciales reales |
| QR / `EntryVenueCard` y enlaces `jchat://` / universales sin sesión | No se probaron en este pase |
| Modo avión, red lenta, sesión caducada | No se simularon |
| VoiceOver / TalkBack leyendo la pantalla; orden de foco en nativo | Solo se leyó el árbol de accesibilidad (UIAutomator, Playwright), no con lector real |
| Crashes / Sentry | No se revisó el panel de Sentry |
| Landscape, iPad | La app es solo vertical y sin tablet |

#### Para el siguiente paso
1. Para ConfirmAge, Lock, Reset y Onboarding necesito o bien una cuenta de prueba nueva creada por Juan (con su contraseña solo en una variable de entorno, nunca en el repo) o permiso para cerrar sesión en @test1 sabiendo que no podré volver a entrar sin su contraseña.

#### Actualización (2026-11-02, con la cuenta QA @test002 y el emulador con huella)
| Pendiente del Bloque 1 | Resultado |
|---|---|
| Inicio de sesión con la cuenta QA (Android 36) | OK la primera vez, sin captcha ni pantalla de edad (la cuenta ya tenía edad y onboarding completos). Tras un restablecimiento de contraseña, el siguiente inicio de sesión mostró **hCaptcha** y no pudo continuar (ver B2-6) |
| Lock biométrico | **OK** (Android 35, huella del emulador): activar, reabrir, desbloquear con la huella correcta, "Cancelar" → pantalla "JChat está bloqueado" con Desbloquear y Cerrar sesión. Hallazgos menores B2-7 y B2-8 |
| ConfirmAge (adulto y menor de edad) | **No probado**: solo aparece al registrar una cuenta nueva (la cuenta QA ya la superó) y no se puede recrear la QA mientras B2-1 impida borrarla |
| Restablecer contraseña | **No probado** más allá de la solicitud: hCaptcha pide resolver un desafío (no se resuelve) y el código llega a un correo que no puedo leer |
| Onboarding | **No probado** (misma razón que ConfirmAge) |
| Android 36 / 26 / 35, iOS 17e, web 375/430/390 | Hecho; ver arriba y `02-cuenta-privacidad-seguridad.md` |


---

## 2. Tabla única de hallazgos (B1 a B11)
Leyenda: **OTA** = se publica con EAS Update (JS, mismo runtime); **Nativo** = exige nuevo build de tienda (cambia manifiesto, `Info.plist` o módulos nativos y, por la política `fingerprint`, el runtime); **Servidor** = función de Supabase / Vercel, sin build; **Web** = despliegue de `web/` en Vercel. «Migración»: número en `supabase/migrations/`. Reservadas: **253** (Truth or Dare, respuesta escrita), **256** (`match_join_venue`); **255** ya está **aplicada en producción** (`account_delete_fks`); las nuevas empiezan en **257**. Archivos entre paréntesis = ver el informe del bloque para el detalle. «Norma» = la regla de tienda más cercana (puede ser un riesgo, no un rechazo seguro).

### 2.1 P0
| ID | Prio | Plataforma | Resumen | Norma de tienda | ¿Build? | ¿Migración? | Archivos |
|---|---|---|---|---|---|---|---|
| B2-1 (grupo **Borrado de cuenta**, ver §2.2; **verificado con mensajes el 2026-11-03**: con un mensaje de chat la cuenta se borra sin error, 0 filas en todas las tablas y el mensaje se borra por cascada, porque `messages.user_id` es ahora `ON DELETE CASCADE`; prueba en Android 35 con un build de desarrollo) | **P0** | Todas (servidor) | Borrar cuenta falla si la persona escribió en un chat: `messages.user_id` es NOT NULL con FK `SET NULL` (igual en `gifts`, `pinned_messages`, `disputes`) | Apple 5.1.1(v); Play: borrado de cuenta | **Servidor** (migración ya aplicada + `delete-account` sin cambios de código; el merge de `fix/account-delete-fks` y el deploy de la función van después) | **255** (aplicada) | `supabase/functions/delete-account/index.ts`, rama `fix/account-delete-fks` (26f45d54). **Verificación completa: pendiente del Bloque 2** |

### 2.2 P1
| ID | Prio | Plataforma | Resumen | Norma de tienda | ¿Build? | ¿Migración? | Archivos |
|---|---|---|---|---|---|---|---|
| **Borrado de cuenta** (B2-1 P0 + C-3) | P1 (C-3 **confirmado**) | Todas (servidor) | `delete-account` solo borra la fila de `auth.users`: **no purga Storage** y **no toca Stripe**. En producción hay **13 objetos de Storage de cuentas que ya no existen, más 4 de @test002 borrada el 2026-11-03 (17 en total)** (`post-media` 9, `avatars` 3, `covers` 1). Con B2-1 forman un solo arreglo de borrado de cuenta | Apple 5.1.1(v); Play: borrado de cuenta y datos (Data safety) | **Servidor** (edge function + posible función SQL; sin build) | Posible **258** (función SQL `purge_user_storage` / lista de rutas por usuario; puede ir junto con B2-3) | `supabase/functions/delete-account/index.ts`; **Fase A** (detalle abajo) |
| **DT-1** (B1-1, B1-2, B3-2, B7-1, B5-4) | P1 | iOS (texto máximo) y Android 2,0× | Dynamic Type / escala de fuente: Login, chat, Mapa, Cerca de mí, Mensajes y dock se recortan o desbordan (alturas fijas) | Apple 4.0 / HIG accesibilidad; Play: accesibilidad (WCAG) | **OTA** (`maxFontSizeMultiplier`, alturas flexibles); B7-2 (abajo) es la parte nativa | No | `LoginScreen.tsx`, `ChatRoomScreen.tsx` (cabecera, pestañas, burbujas, campo), `MapScreen.tsx`, `NearbyScreen.tsx`, `MessagesScreen.tsx`, `VenueDock` (inventario completo en `07-…` §DT-1) |
| B3-1 | P1 | Android e iOS | Compuerta del chat con ubicación denegada dice "No estás en Bar XZX" y "Permitir ubicación" no hace nada; la persona queda atascada fuera de todos los chats | Apple 5.1.1 (permisos) / 2.1 | **OTA** | No | `screens/chat/useGeofenceGate.ts`, `ChatRoomScreen.tsx` (usar `Linking.openSettings`) |
| B5-1 | P1 | Android e iOS | "Salir" de Match no se mantiene: el latido (`useMatchPresence`) vuelve a inscribir a la persona (`game_optins` se recrea); no existe una RPC de entrada explícita | Apple 2.1 (sin salida) y 5.1.1 (se promete borrar todo); Play Data safety | **OTA** + servidor | **256** (`match_join_venue`, reservada) | `hooks/useMatchPresence.ts`, `services/matchPresence.ts`, `context/VenueSessionContext.tsx:333`, `utils/matchLeave.ts`, `ChatRoomScreen.tsx:520-558,1025`, `services/match.ts:76`; SQL `match_check_in` (`245_baseline.sql:2716`) |
| **Locales cerrados** (B9-3 + B9-7 + B7-4) | P1 (B7-4 es decisión de Juan) | Todas | Se puede entrar y llegar a pagar un pedido en un local cerrado: el servidor no consulta el horario; la app calcula Abierto/Cerrado con el reloj del dispositivo y no con `businesses.timezone` | Apple 2.1 / 3.1 (pedidos que no se pueden cumplir); Play: engaño al usuario | **Servidor + OTA** | **257** (función SQL de horario `businesses.hours` + `timezone` y rechazo `venue_closed`) | `supabase/functions/payments/index.ts` (`quote_order`, `create_payment_intent`), SQL `create_paid_order` / `assert_venue_order_allowed`, `mobile/utils/hours.ts`, `errors.json` es/en |
| **Borrado web** (B2-2 + B11-3) | P1 | Web | `/account/delete` redirige al login sin explicar nada; Google Play exige explicar antes del login pasos, datos borrados, datos conservados y plazo, y contacto | Play: URL de borrado de cuenta (Data safety) | **Web** | No | `web/app/(legal)/account/delete/DeleteAccountClient.tsx:42`, `page.tsx`, `web/messages/{en,es}.json` |
| B2-3 | P1 | App (dueños) | Una cuenta dueña de un local no puede borrarse desde la app (409 `owns_business`; debe escribir a soporte) | Apple 5.1.1(v) | **Servidor + OTA** | Posible (transferir/cerrar local; número a decidir, **258**) | `supabase/functions/delete-account/index.ts`, pantalla de borrado en `SettingsScreen.tsx` |
| B2-4 + C-5 | P1 | Web legal | `/privacy` no declara Google Cloud Vision (fotos) ni Sentry, y `/terms` solo menciona Vision. **Basta con declararlo en `/privacy`, sin diálogo de consentimiento.** Proveedores que `/privacy` debe nombrar: Google Cloud Vision (fotos), Sentry (diagnósticos) y **Expo Push (el texto de los mensajes pasa por Expo al enviar la notificación)**; revisar también Stripe, Supabase y hCaptcha | Apple 5.1.1/5.1.2, App Privacy; Play Data safety | **Web** (texto; revisar con asesor legal) | No | `web/app/(legal)/privacy/page.tsx`, `web/messages`; `supabase/functions/send-push` |
| B10-1 | P1 | iOS y Android | `UIBackgroundModes: audio` y `FOREGROUND_SERVICE_MEDIA_PLAYBACK` declarados sin reproducción en segundo plano | **Apple 2.5.4**; Play: declaración de servicios en primer plano | **Nativo** | No | `mobile/app.config.ts` (plugin `expo-audio`: `enableBackgroundPlayback: false`, ~l.266) |
| B11-1 | P1 (lanzamiento) | Web | El dashboard web no tiene "¿Olvidaste tu contraseña?" (ni `/forgot-password`, ni `/reset-password`); la app móvil sí | Apple 5.1.1 (cuenta); buena práctica de acceso del revisor | **Web** | No | `web/app/auth/login/page.tsx`, nuevas rutas; patrón en `ForgotPasswordScreen.tsx` / `ResetPasswordScreen.tsx` |
| B11-15 | **P1** (Fase A) | App + servidor | El dueño de un local no tiene acceso al POS de su local si no es empleado: @jchatreview no ve «Modo Trabajo» ni puede crear un PIN. El revisor queda bloqueado en el POS. **Causa (leída en el código y en la BD de producción):** el POS solo reconoce a empleados aceptados con un rol personalizado con `pos_access`. `pos_can_access` (`supabase/migrations/245_baseline.sql:4260-4272`) solo mira `employees` + `custom_roles`; **@jchatreview es dueña de Demo Lounge pero no es empleada (0 empleados)**, así que no ve «Modo Trabajo» y no puede crear ni introducir un PIN. **Arreglo propuesto: el dueño de un local tiene acceso al POS de su local por defecto, sin ser empleado.** Migración **260** (el siguiente número libre; 253, 256, 257, 258 y 259 ya están reservadas), con estos cambios, todos con `create or replace function`: (1) **`pos_can_access`** (`245:4260`): devolver verdadero también si `exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = auth.uid())`, además de la condición actual de empleado con `pos_access`. Con eso se arreglan de golpe todos los RPC que solo llaman a `pos_can_access`: `pos_set_pin` (5153-5158) y `pos_verify_pin` (5360-5367), `pos_combine_tables` (4329), `pos_create_check` (4361), `pos_create_split` (4487), `pos_kds_metrics` (4691), `pos_kds_settings` (4809), `pos_pickup_board` (5009), `pos_set_party_size` (5135), `pos_table_items` (5229), `pos_tables_overview` (5280), `pos_uncombine_table` (5341), `pos_void_order` (5390) y la función de borde `supabase/functions/terminal/index.ts:154` (llama al RPC). Los que ya escriben «`pos_can_access` o dueño» (líneas 4182, 4222, 4284, 4309, 4738, 4866, 4915, 4946, 5063, 5254 y 5328) no necesitan cambio. (2) **`pos_my_businesses`** (`245:4886-4903`): hoy parte de `employees`; añadir un `union` con los locales de `businesses.owner_id = auth.uid()` (rol `'owner'`, `employee_id` nulo, `has_pin` desde `pos_pins` por `user_id` y `business_id`, `plan` del local). (3) **`pos_create_order`** (`245:4392`, comprobación en las líneas 4402-4405): exige una fila en `employees` y `pos_access` (`raise exception 'not an active employee of this business'`); añadir la rama «dueño del local» antes de esa comprobación. `v_emp` solo se usa ahí (4397, 4402, 4404), así que no hay más dependencias. (4) **`pos_tables_overview`** (`245:5280`, `v_emp_id` en la línea 5287): hoy busca la fila de empleado para mostrar las mesas asignadas; debe tolerar `v_emp_id` nulo para el dueño. **En la app:** la fila «Modo Trabajo» se muestra con `hasPosAccess` (`mobile/screens/settings/SettingsScreen.tsx:268, 318-319`, `setHasPosAccess(rows.length > 0)` tras `posMyBusinesses()`) y `WorkModeScreen.tsx:77` carga la misma lista; no hace falta cambiar la condición, basta con que `pos_my_businesses` devuelva también los locales del dueño. Sí hay que ajustar los tipos: `PosMyBusinessesRow.employee_id: string` (`mobile/services/pos.ts:20`) pasa a `string | null` y el uso en `WorkModeScreen.tsx:133` (`employeeId: b.employee_id`) debe aceptar nulo. Todo esto es OTA. **Permisos dentro del POS:** el cliente ya da todo al dueño: `getChatPermissions` (`mobile/services/permissions.ts`, rama «Owner check», ~líneas 111-121) devuelve todos los permisos en verdadero si `businesses.owner_id = userId`, y `PosHomeScreen.tsx:92` lo usa para `inventory_manage`. En el servidor, los checks de `inventory_manage` (`245:2309, 2387, 4140, 4841, 5520`) y las funciones `inventory_kpis`, `inventory_report`, `pos_apply_stock_movement`, `pos_link_barcode` y `purchase_suggestion` **ya miran `owner_id`**. Lo que hay que ajustar es solo lo listado arriba: `pos_can_access`, `pos_my_businesses`, `pos_create_order` y `pos_tables_overview`. **Pruebas SQL** (nuevo `supabase/tests/12_pos_owner_access.sql`, con los ayudantes de `_helpers.sql`): (a) el dueño de un local sin empleados pasa `pos_can_access`, ve su local en `pos_my_businesses` y puede crear y verificar un PIN con `pos_set_pin` / `pos_verify_pin`; (b) una persona que no es empleada ni dueña no pasa `pos_can_access` y `pos_set_pin` falla con `no pos access`; (c) una empleada aceptada **sin** `pos_access` tampoco pasa; (d) el dueño de **otro** local no accede a este; (e) `pos_create_order` funciona para el dueño y sigue fallando para una empleada sin `pos_access`. **Atribución de pedidos y cobros del dueño (verificado en la BD de producción y en el código, solo lectura):** la única clave foránea hacia `employees` es `table_waiters.employee_id` (**NOT NULL**, `ON DELETE CASCADE`). `orders.taken_by` (nullable, FK a `auth.users`, `ON DELETE SET NULL`), `orders.approved_by` y `pos_payments.paid_by` (nullable, FK a `auth.users`) **ya guardan el `user_id`**, no un id de empleado; `pos_create_order` inserta `taken_by` con `auth.uid()` (`245:4420`) y los cobros guardan `paid_by = auth.uid()` (`245:4058, 4064, 4381, 4509, 4530`). **Un pedido o cobro hecho por el dueño sin fila en `employees` NO fallaría por una clave foránea ni por columnas NOT NULL** (una vez resuelto el acceso con la 260). **Propuesta de atribución: se queda como está, `taken_by` / `paid_by` = `user_id` del dueño; no hace falta una columna `acted_by_user_id`.** Lo único que el dueño no puede hacer es que se le asigne una mesa (`table_waiters` exige un empleado); `resolve_table_waiter_for_attribution` ya cae a `v_uid` (`245:4202`) y la pantalla de asignación de la web solo lista empleados (`web/app/dashboard/tables/page.tsx:1124`). **Métricas y recibos con el dueño (sin fila en `employees`):** (a) KDS/meseros: `pos_kds_metrics_v2` agrupa `by_waiter` por `taken_by` (`245:4784-4790`), así que el dueño aparece como un mesero más por su `user_id`; la página `metrics` ya acepta `taken_by` nulo; no comprobé cómo resuelve el nombre (probablemente muestra el id abreviado). (b) Ventas y resumen (`web/app/dashboard/sales/page.tsx:698-700`, `summary/page.tsx:184-186`): los pedidos cuyo `taken_by` no está en `employees` van al grupo **«Sin asignar»** (`salesUnassigned`): **se cuentan en los totales pero no quedan atribuidos al dueño por nombre**; mejora opcional (P3, web): añadir al dueño como vendedor en el mapa `byUserId`. (c) Recibos: `pos_receipts_today` trata al dueño de forma explícita (`v_is_owner`, `245:5047`) y el comprobante usa `left join employees` (`245:4980`), así que tolera la ausencia de empleado; la página `receipts` muestra `paid_by` como id abreviado para todos (ya ocurre hoy, P3). **Pruebas SQL añadidas a `supabase/tests/12_pos_owner_access.sql`:** (f) el dueño, sin fila en `employees`, crea un pedido de prueba con `pos_create_order` y la fila queda en `orders` con `taken_by` = su `user_id`; (g) el dueño cobra ese pedido (`pos_create_check` + `pos_apply_external_payment`, o `pos_create_split`) y la fila queda en `pos_payments` con `paid_by` = su `user_id`; (h) `pos_kds_metrics_v2` devuelve ese pedido en `by_waiter` con `taken_by` = el dueño (cuenta ≥ 1); (i) `pos_receipts_today` lista ese cobro para el dueño y no para un tercero; (j) `pos_tables_overview` responde sin error con `v_emp_id` nulo; (k) no se crea ninguna fila en `employees` ni en `table_waiters` como efecto lateral. **Después del arreglo:** Juan crea el PIN de @jchatreview en la app (Ajustes → Modo Trabajo → Establecer PIN), lo guarda como `REVIEW_POS_PIN` en `/Users/jcgarcia/.jchat-qa.env` y lo pone en las notas de revisión. **Apple 2.1 / 2.3.1:** el Modo Trabajo debe estar visible y poder probarse por el revisor | Apple 2.1 / 2.3.1 | **Servidor** (migración) + **OTA** (tipos) | **260** | `supabase/migrations/245_baseline.sql` (`pos_can_access` 4260, `pos_my_businesses` 4886, `pos_create_order` 4392, `pos_tables_overview` 5280), `mobile/services/pos.ts:20`, `WorkModeScreen.tsx:133`, `supabase/tests/12_pos_owner_access.sql` (nuevo) |
| B9-1 | decisión de Juan (P1 si el lanzamiento cobra de verdad) | Todas | Stripe sigue en modo prueba en producción (`pk_test_`, insignia TEST) | Apple 2.1 / 3.1; Play: funcionalidad completa | **Claves de la app: OTA, sin build nativo.** `EXPO_PUBLIC_STRIPE_PK` se lee en `mobile/components/StripeRoot.native.tsx:20` (`process.env.EXPO_PUBLIC_STRIPE_PK`) y Expo la incrusta en el bundle JS al exportarlo; no está en `Info.plist` ni en el manifiesto. Se define en `mobile/.env:6` (ignorado por git) y los perfiles de `eas.json` usan `"environment": "production"` (variables de EAS). **Cuidado:** la clave queda fijada cuando se exporta el update, así que hay que publicarlo con la variable ya en `pk_live_`. Las claves secretas y webhooks son del servidor (secretos de funciones y Vercel), tampoco requieren build | No | `StripeRoot.native.tsx:20`, `mobile/.env:6`, `eas.json`; variables listadas en `09-…` («Pasar a live») |
| C-4 | P1 (**Recomendado: opción B** — ampliar lista y triggers en la 259. **Pendiente de la decisión de Juan**) | Todas (servidor) | **El inventario se equivocó: sí hay filtro de texto** (corregido también en `00-inventario.md`). `trg_message_filter` (BEFORE INSERT/UPDATE de `body`) llama a `message_is_objectionable` en `messages`, `comments` y `dm_messages`. **Cómo compara hoy** (leído en la BD y probado con textos de ejemplo, solo `SELECT`): **44 palabras** y **18 frases** (conteo manual del texto de la función); pasa a minúsculas, quita acentos, cambia dígitos y símbolos por letras (`0→o 1→i 3→e 4→a 5→s 7→t @→a $→s`), reduce 3 o más letras repetidas a una, convierte todo lo que no es letra en espacio, junta letras separadas (`k i k e`) y busca **palabra completa**, no subcadena (`Scunthorpe`, `spice`, `retardo`, `slutty` pasan; los plurales deben estar escritos uno a uno). **Falsos positivos reales:** `kike` (apodo muy común de Enrique) se bloquea incluso en «Enrique (kike) llegó»; `te voy a matar a risas` se bloquea por la frase. **Evasiones que pasan:** `mata te`, variantes no listadas (`nigga`, `fag`). **Lo que NO pasa por el filtro hoy** (sin trigger, comprobado): `posts.caption`, `tod_cards.body`, `users.bio`, `users.display_name`, `users.username`, `rooms.name` y `rooms.description` (y `businesses.name`/`description`, del dueño). **Propuesta (migración 259, sin build):** (1) ampliar la lista es/en con las formas más graves, sin apodos ni palabras cortas ambiguas; **quitar `kike` de la lista o acotarlo** (p. ej. solo con otras señales); (1b) **batería de pruebas SQL de falsos positivos**, que se corre contra la función **antes de aplicar** la 259: nombres y apodos hispanos comunes (Kike, Paco, Chino, Negro/Negra como apodo cariñoso, Mongo, etc.) y expresiones coloquiales como «matar a risas» / «te voy a matar a risas», «me muero de risa», «está de muerte», «me mata de la risa»; cada caso con el resultado esperado (pasa) y los casos graves que deben seguir bloqueándose; (2) generalizar el trigger: `message_filter_trigger()` lee `new.body`, que no existe en `posts` (su columna es `caption`) ni en `users`/`rooms`; hace falta una función que reciba el nombre de la columna (`TG_ARGV` / `to_jsonb(new)`); (3) poner el trigger en `posts.caption`, `tod_cards.body`, `users.bio`, `users.display_name`, `users.username`, `rooms.name` y `rooms.description`; (4) **la respuesta escrita de ToD (253) debe usar este mismo filtro**; (5) **cuidado en `users`:** aplicar solo a `UPDATE OF` y no a la creación de la fila de registro (nombres que vienen de Google o Apple podrían romper el alta), y definir qué hacer con nombres de usuario ya existentes (el trigger no revisa filas antiguas); (6) mapear el error `message_not_allowed` (22023) a un mensaje es/en en perfil, publicaciones, retos y salas (OTA). **OpenAI (moderación asíncrona) queda como mejora posterior** (si se elige, el secreto `OPENAI_API_KEY` se confirma entonces) | Apple 1.2; Play UGC | **Servidor** + mensajes de error por **OTA** | **259** | SQL `message_filter_trigger`, `message_is_objectionable` (`211_message_filter.sql` en archivo; estado actual en `245_baseline.sql`), tablas arriba; errores en `i18n/locales/{es,en}` |

### 2.3 P2
| ID | Prio | Plataforma | Resumen | Norma de tienda | ¿Build? | ¿Migración? | Archivos |
|---|---|---|---|---|---|---|---|
| B7-2 | P2 | Android | Cambiar el tamaño de letra con la app abierta recrea la actividad: se pierde el chat y el dock (`configChanges` sin `fontScale`) | Apple/Play: calidad (4.0, estabilidad) | **Nativo** (config plugin que añada `fontScale`) | No | `android/app/src/main/AndroidManifest.xml:44` (generado; el arreglo va en un plugin de `app.config.ts`) |
| B10-3 | P2 | iOS | Textos de Face ID (omite confirmar pagos) y de red local (omite impresoras de red) incompletos | Apple 5.1.1 | **Nativo** (cadenas de `Info.plist`) | No | `app.config.ts` consts `FACE_ID`, `localNetworkUsagePermission`; `assets/locales/{es,en}.json` |
| B10-4 | P2 | iOS y Android | El SDK beta de Stripe Terminal se evalúa al arrancar para todos | Apple 4.0 / 2.1 (beta) | **OTA** (carga diferida de `PosNavigator`) | No | `navigation/lazyScreens.tsx:17`, `services/terminalSdk.ts:42` |
| B4-1 | P2 | Android | Tras recuperar la red, el chat privado se queda en "Reconectando…" más de 8 min (una vez, emulador) | 2.1 (fiabilidad) | **OTA** (no verificado en móvil real) | No | Suscripción Realtime de `DMChatScreen.tsx` |
| B4-2 | P2 | iOS y Android | Tocar el push de `match_photo_approved/rejected` no navega | — | **OTA** | No | `hooks/useNotifications.ts:392` |
| B5-5 | P2 | Todas | El botón dice "Salir del local" pero solo sale de Match | Apple 2.1 | **OTA** | No | `i18n/locales/{es,en}/match.json` (`leave.*`) |
| B8-1 | P2 | Todas | Dos selectores de idioma distintos (el del perfil no cambia la app) | — | **OTA** | No | `EditProfileScreen.tsx`, `AuthContext.tsx:228` |
| B8-2 | P2 | Android | La reserva pide fecha y hora como texto libre | Apple 4.0 | **OTA** | No | `ReservationScreen.tsx` |
| B9-2 | P2 | Android | Las opciones elegidas de un plato no se ven en carrito, checkout ni detalle del pedido | Apple 2.1 | **OTA** | No | `CartScreen.tsx`, `CheckoutScreen.tsx`, `screens/orders/*` |
| B9-6 | P2 | App | Queda `PricingScreen.tsx` que abre Stripe Checkout (inalcanzable): quitar para no dar ruta de compra digital | Apple 3.1.1 | **OTA** | No | `screens/settings/PricingScreen.tsx:80`, `i18n/locales/{es,en}/pricing.json` |
| B11-8 | P2 | Web | El dashboard a 375 px deja la barra lateral fija y corta el contenido | Apple/Play: calidad | **Web** | No | `web/app/dashboard/layout.tsx`, `Sidebar` |
| B1-3 | P2 | Web | Objetivos táctiles de 21 px en el login web (WCAG 2.5.8) | — | **Web / OTA** | No | `LoginScreen` web |
| B1-4 | P2 | Web | `<html lang>` y título no cambian con el idioma | — | **OTA** | No | `LoginScreen` / layout web |
| B1-5 | P2 | Android | Un correo mal formado salta directo a hCaptcha | — | **OTA** | No | `LoginEmailScreen.tsx`, `ForgotPasswordScreen.tsx` |
| B1-6 | P2 | Android e iOS | Botones de Apple/Google sin la marca oficial | Apple 4.8 / HIG; Google branding | **OTA** | No | `LoginScreen.tsx`, `RegisterStep1Screen.tsx` |
| B1-11 | P2 | Android (3 botones) | El enlace "Create account" queda bajo la barra de navegación | — | **OTA** | No | `LoginScreen.tsx` |
| B1-12 | P2 | App (recuperar contraseña; la pantalla de nueva contraseña debe mostrar **las reglas en vivo como `RegisterStep1`** y un error específico) | Al elegir la nueva contraseña, `updateUser` falla con 422 «Password is known to be weak» (protección de contraseñas filtradas de Supabase) y la app solo dice «No pudimos completar la recuperación. Inténtalo de nuevo.», sin decir que la contraseña es débil. **Visto en producción el 2026-11-03** (4 intentos seguidos, solo en los registros de Auth; el código de 6 dígitos sí se verificó bien). Sin el motivo, una persona real se queda atascada; es el mismo flujo que usará el revisor | Apple 2.1 / 5.1.1 (cuenta recuperable) | **OTA** | No | `screens/auth/ResetPasswordScreen.tsx:66-70` (mapear `weak_password` / `same_password` a un mensaje es/en propio), `i18n/locales/{es,en}/auth.json` (`resetPassword.*`) |
| B2-12 | P2 | App (hoja de entrada) | La hoja dice «Photos and text are reviewed before they are posted», pero solo hay filtro de palabras en chat, comentarios y DMs y revisión de fotos posterior. **Texto propuesto (Fase B):** es «Usamos filtros automáticos y revisamos los reportes. Puedes reportar o bloquear a cualquiera.» · en “We use automatic filters and review reports. You can report or block anyone.” | Apple 2.3.1 / 1.2 | **OTA** (texto) | No | `i18n/locales/{es,en}` de la hoja de entrada, ver C-4 |
| B2-5 | P2 | Todas | El error de borrado es un mensaje genérico, sin motivo ni contacto | Apple 5.1.1(v) | **OTA** | No | pantalla de borrado en `SettingsScreen.tsx` |
| B2-6 | P2 | Android | hCaptcha escala tras un reset de contraseña y bloquea el siguiente login | Apple 2.1 (acceso del revisor) | **OTA / servidor** (config de captcha) | No | `LoginEmailScreen.tsx`, Supabase Auth |
| B2-7 | P2 | Android | El bloqueo biométrico no ofrece PIN/patrón del dispositivo como respaldo | — | **OTA** | No | `LockScreen.tsx`, `services/biometric.ts` |
| B3-3 | P2 | Android | Enviar sin red borra el texto y no deja burbuja reintentable | — | **OTA** | No | `ChatRoomScreen.tsx` |
| C-6 | P2 (lanzamiento) | Web | Enlaces de tienda de relleno (`#`, `id000000000`) y JSON-LD con dominio `.app`. Los enlaces reales solo existen después de la aprobación, así que se rellenan en el lanzamiento (no bloquea el envío) | Apple 2.1 (placeholders), solo si el revisor los ve | **Web** | No | ver `00-inventario.md` §8 |
| C-7 | P2 | Web | CSAE sin URL propia (hoy una sección dentro de `/safety`). **Propuesta:** ancla `https://jchat.cloud/safety#csae` o página `/child-safety`, con estándares publicados y **contacto designado** (`safety@`, confirmar alias en B11-4); el mecanismo de reporte dentro de la app ya existe | Play: estándares contra CSAE | **Web** | No | `web/app/(legal)/safety/page.tsx` |
| *C-8 a C-12, C-14, C-15, C-18* | *P2 (inventario, sin probar)* | Web / app | CSP en `*.jchat.cloud`; cookies; contactos inconsistentes; enlaces legales en páginas públicas; permisos sobrantes (`USE_FINGERPRINT`, `MODIFY_AUDIO_SETTINGS`, `allowBackup`); Terminal beta; reseñas sin cola; aviso de Next 16.4.0 | Varios | Web / Nativo / OTA | No | `00-inventario.md` §8 |

### 2.4 P3
| ID | Prio | Plataforma | Resumen | Norma | ¿Build? | ¿Migración? | Archivos |
|---|---|---|---|---|---|---|---|
| B10-2 | P3 | iOS | `NSBluetoothPeripheralUsageDescription` sin función | Apple 5.1.1 | **Nativo** | No | `app.config.ts:229` (`bluetoothPeripheralPermission`) |
| B10-5 | P3 | iOS | "Rol: todo" muestra la clave interna | — | OTA | No | `WorkModeScreen.tsx` |
| B10-6 | P3 | Todas | Permiso de ubicación sin pantalla previa al abrir el Mapa | Apple 5.1.1 | OTA | No | `MapScreen.tsx` |
| B10-7 | P3 (comprobado) | iOS | Claves de desarrollo en la config; se quitan en Release salvo `NSAllowsLocalNetworking` (plantilla Expo) | — | — (confirmar en IPA) | No | `app.config.ts` |
| B11-2 | P3 | Web | hCaptcha bloquea herramientas; confirmar que no añade reto extra al revisor (B2-6) | Apple 2.1 | — | No | — |
| B11-4 | P3 (P1 si no existen los alias) | Correo | `jchat.cloud` tiene MX (ImprovMX); falta confirmar `safety@` y `soporte@` | Apple 1.2 (contacto), Play | — | No | panel de ImprovMX |
| B11-5 | P3 | Web | `/pricing` usa un acento naranja distinto de la marca | — | Web | No | `web/app/pricing/page.tsx` |
| B3-4, B3-5 | P3 | App | Aviso al salir del local no menciona Match; enlaces del chat no pulsables | — | OTA | No | `ChatRoomScreen.tsx` |
| B4-3 | P3 | App | Enviar un mensaje vacío no avisa | — | OTA | No | `DMChatScreen.tsx` |
| B5-2, B5-3 | P3 | Android | Lista de matches y mazo no se refrescan solos | — | OTA | No | `screens/match/*` |
| B6-1, B6-2 | P3 | iOS / Android | Botón "Aleato…" recortado; temporizador de ToD ruidoso para lectores | Apple/Play accesibilidad | OTA | No | `TodCardModal` |
| B7-3 | P3 | Android | Selector Normal/Satélite siempre desplegado; contador sin fondo | — | OTA | No | `MapScreen.tsx` |
| B8-3 | P3 | Android | Distancia "a 1 mi" para un local a 10 m (mostrar "Aquí") | — | OTA | No | `OffersScreen.tsx` |
| B9-4, B9-5 | P3 | Android | "Impuesto (8%) $0.00"; detalle de pedido sin desglose ni recibo | — | OTA | No | `CheckoutScreen.tsx`, `screens/orders/*` |
| B2-13 | P3 | App (registro) | El rechazo por edad no recuerda el intento: tras «Not eligible» se vuelve al paso 1 y se puede repetir con otro año de nacimiento de inmediato. **Propuesta:** recordar el rechazo en el dispositivo durante 24 h (bloquear nuevos intentos de registro con fecha declarada) y no explicar el requisito en el mensaje (hoy «You don't meet the requirements to use JChat.» sin mencionar los 18 años, lo que está bien; mantenerlo así) | Apple 1.4 / 5.1.4 (menores), Play (Families/edad) | **OTA** | No | pantalla de registro paso 2, almacenamiento local |
| B2-11, B1-13 | P3 | Android | Borrar cuenta sin indicador de progreso (unos 35 s medidos); el icono del cohete del Onboarding tiene un rectángulo oscuro detrás | — | OTA | No | `SettingsScreen.tsx` (`performDeleteAccount`), pantalla de Onboarding |
| B1-7 a B1-10 | P3 | Varias | "email" vs "correo"; indicador de pasos en Welcome; botones bajo la barra de gestos; avisos de consola en web | — | OTA | No | `LoginScreen.tsx`, `WelcomeScreen.tsx`, `RegisterStep1Screen.tsx` |
| B2-8, B2-9, B2-10 | P3 | Android / web | "Face ID o Touch ID" en Android; aviso informativo con estilo de error; pie legal partido | — | OTA / Web | No | `LockScreen.tsx`, `PrivacyScreen.tsx`, `web/app/(legal)/layout.tsx` |
| B11-6 | P3 | Web | `ERR_ABORTED` de precarga de Next (artefacto) | — | — | No | — |
| B11-7, B11-9 a B11-14 | P3 | Dashboard web | Cuenta sin local termina en `auth/register?upgrade=1` sin aviso; «Change plan» falla con «No billing account yet» (el revisor no llega al portal ni a Checkout); Reports «coming soon» visible; los reportes de chat se atienden en `/super-admin/alerts` (existe; ver notas de revisión); estado de menú incorrecto; reserva vencida sin resolver; textos sin traducir en ES | Apple 2.1 (revisor) | Web | No | `11-…` §6 |
| *Cerrados / sin acción* | — | — | B6-3 (regla "Sin alcohol", se queda), B8-4 (EXIF del dato de prueba) | — | — | — | — |
| *Pendiente del Bloque 2 / 11* | — | — | Cualquier hallazgo nuevo de ConfirmAge, Onboarding, Reset, borrado completo, reglas ToD sin aceptación y del dashboard web (moderación, personal/PIN, menú, pedidos, facturación, `/account/delete` con sesión, 390 px, consola) | — | — | — | **pendiente** |

---

## 3. Checklist de tiendas
Estado: **OK** · **falta** (hay que cambiar algo) · **pendiente de Juan** (acción o dato fuera del repo) · **pendiente** (depende del Bloque 2 u 11). Las fechas límite de las tiendas hay que **confirmarlas en sus consolas**; aquí van como recordatorio, no como dato verificado.

### 3.1 Apple
| Requisito | Estado | Evidencia / observación |
|---|---|---|
| Build con Xcode 26 / SDK iOS 26 | **pendiente de Juan** | `eas.json` no define `image`; EAS usa la del SDK 57. No verificable desde el repo: revisar el log del primer build de producción o `eas build:inspect`. El Xcode 27.1 de este Mac no cuenta (`00` §4). Confirmar la fecha límite en developer.apple.com |
| 1.2 Contenido generado por usuarios | **falta (parcial)** | Reportar: **OK** (9 motivos, `child_safety` primero, tope diario, correo urgente a `safety@`; `03`). Bloquear: **OK** (confirmación y lista; no se confirmó contra personas reales). Contacto publicado: **OK** (`/contact`) con alias por confirmar (**B11-4**). Filtro: imágenes con Vision; texto: **filtro de palabras en la BD para chat, comentarios y DMs; faltan posts y ToD, lista corta** (C-4, decisión de Juan). Acción en 24 h: promesa publicada, proceso humano **pendiente de Juan**; cola de reseñas TODO (C-15). Moderación: Match y ToD tienen pestañas de reportes en el dashboard del local y la **cola de plataforma está en `/super-admin/alerts`** (RPC `admin_resolve_report`, `admin_hide_content`, `admin_suspend_user`; 4 reportes en producción, todos cerrados con `resolved_by`); las notas de revisión dicen «se atienden en `/super-admin/alerts`, en menos de 24 h» (B11-11, P3) |
| 1.4.3 Alcohol / drogas | **OK con nota** | La app no promueve consumo; ToD tiene la regla "Sin alcohol" (B6-3, se queda por decisión de Juan); 18+ obligatorio (`ConfirmAge`). Los locales venden alcohol en su carta: ficha de la tienda debe decirlo |
| 2.1 / 2.3.1 Cuenta demo, funciones completas y notas de revisión | **falta (B11-15) + pendiente de Juan** | **El Modo Trabajo debe ser visible y probable para el revisor**: hoy @jchatreview (dueña) no lo ve; se arregla con la migración 260.  Kit en `docs/app-review/` (runbook, notas Apple/Google, local de demostración con `supabase/scripts/demo_venue_seed.sql`). **No sé si la cuenta de revisor existe en producción.** Las notas deben incluir: correo y contraseña de @jchatreview, **PIN del POS de Modo Trabajo** (`10` §5c), el aviso de que puede aparecer hCaptcha (B11-2), el local de demostración, y la justificación de `bluetooth-central` (Stripe Terminal). **PIN del POS: no existe y @jchatreview ni siquiera ve el Modo Trabajo** (no es empleada del local; **B11-15, P1**): Juan sigue los pasos de §5 punto 7 |
| 2.4.1 iPad en modo compatibilidad | **pendiente** | La app es solo iPhone (`supportsTablet: false`, `app.config.ts:84`), pero Apple la prueba en iPad con el modo de compatibilidad. **Probar en un simulador de iPad disponible en Xcode 27.1, cuando terminen los Bloques 2 y 11:** Login, Mapa, chat y Match, en vertical. Nada probado todavía |
| 2.5.4 Modos de fondo | **falta** | `audio` sin uso (B10-1). `bluetooth-central` se queda (lo usa Stripe Terminal) y se justifica en las notas |
| 3.1.1 / 3.1.3 Pagos | **OK tras B9-6** | Todo el cobro es Stripe para bienes y servicios que se consumen en el local (pedidos, propinas, regalos de platos físicos): permitido por 3.1.3(e). Sin compras digitales dentro de la app: Verified/Pro están "Próximamente"; los planes de local se contratan en la web. Quitar `PricingScreen.tsx` (B9-6). Stripe en modo prueba (B9-1) |
| 4.0 / 4.2 Calidad | **falta** | 7 pantallas muertas y código muerto (C-13), marcadores en la web (C-6), Terminal beta (B10-4), DT-1 (accesibilidad), B3-1 y B5-1 (usuarios atascados) |
| 5.1.1 Permisos y borrado de cuenta | **falta** | Textos de permisos: **OK** (existen en es/en, ninguno vago; `10` §3) salvo B10-3. Borrado dentro de la app: **falla con mensajes (B2-1, arreglo 255 aplicado; verificación completa pendiente del Bloque 2)** y **bloqueado para dueños (B2-3)** |
| 5.1.2 Uso de datos | **falta** | Vision, Sentry y Expo Push no declarados en `/privacy` (B2-4 + C-5; basta declararlo, sin diálogo); Sentry sin opt-out (C-17); ATT: no hay |
| App Privacy (etiquetas) | **pendiente de Juan** | Borrador en `docs/store-listing/app-privacy-labels.md` (hay un test que lo compara con `app.config.ts`). Incluir: **sexo e interés de Match como información sensible**, ubicación (precisa mientras se usa; sin almacenar según la app: confirmar con la BD), fotos (Vision), contenido de usuario, identificadores, diagnósticos (Sentry), compras. Sin seguimiento |
| Clasificación por edad | **pendiente de Juan** | Con Match, contenido de usuarios y alcohol: **18+** (recomendado) |
| URLs de soporte y privacidad | **OK / pendiente de Juan** | `/support`, `/privacy` responden 200 y son públicas (`11`). Falta confirmar los alias de correo (B11-4) |

### 3.2 Google Play
| Requisito | Estado | Evidencia / observación |
|---|---|---|
| targetSdk 36 | **OK** | `compileSdk/targetSdk 36` (`00` §4). Confirmar la fecha límite en Play Console |
| Data safety | **pendiente de Juan** | Borrador en `docs/app-review/google-data-safety.md`; incluir ubicación aproximada y precisa (primer plano), fotos, mensajes, datos sensibles de Match, diagnósticos (Sentry), Vision. Debe coincidir con `/privacy` (B2-4) |
| URL web de borrado de cuenta | **falta** | B11-3 / B2-2 |
| Declaración de servicios en primer plano | **falta** | B10-1: quitar `FOREGROUND_SERVICE_MEDIA_PLAYBACK` (si no, hay que justificarla con vídeo) |
| Permisos sensibles y ubicación | **OK** | Solo primer plano; `ACCESS_BACKGROUND_LOCATION`, almacenamiento, medios y `AD_ID` bloqueados (`10` §3). Bluetooth solo en Modo Trabajo. Sobran `USE_FINGERPRINT` y `MODIFY_AUDIO_SETTINGS` (C-12, P2) |
| Clasificación de contenido (IARC) | **pendiente de Juan** | Cuestionario; usuarios interactúan, ubicación compartida con locales, contenido adulto generado por usuarios |
| Política de citas / Match | **pendiente de Juan** | Si Play considera Match una función de citas, revisar su política (solo mayores de edad, seguridad); aquí hay 18+ obligatorio, reporte, bloqueo y ayuda discreta |
| Estándares contra CSAE | **falta (P2)** | Existe la sección en `/safety` pero no una URL propia (C-7: ancla `/safety#csae` o página `/child-safety`); Play pide estándares publicados, mecanismo de reporte dentro de la app (OK) y un contacto designado |
| Cuenta de prueba para la revisión | **pendiente de Juan** | Igual que Apple (credenciales, PIN del POS, captcha) |
| Play Billing | **No aplica** | Solo bienes físicos y servicios que se consumen fuera de la app (comida, bebida, propinas, reservas) cobrados con Stripe; ninguna compra digital dentro de la app (tras B9-6) |

---

## 4. Propuesta del lote de correcciones (por fases)
Nada de esto se ha implementado. **Nota de plan:** la app aún no está en las tiendas, así que todo sale en el primer build. Las fases A–D se prueban por partes con OTA en los builds de prueba, y al final hay **UN solo build nativo para tiendas** que incluye A–D (y E si da tiempo). **Orden:** A → B en paralelo con C cuando se pueda; D y E tras la aprobación de A–C. La **fase C va en un solo build nativo** para tiendas (cualquier cambio de manifiesto, `Info.plist` o módulos cambia el runtime por la política `fingerprint`; antes, correr `node scripts/preflight-eas.mjs`).

| Fase | Incluye | Vía | Migraciones | Tests | Riesgo |
|---|---|---|---|---|---|
| **A — Servidor y migraciones (P0/P1)** | Merge de `fix/account-delete-fks` (26f45d54) y **deploy de `delete-account`** (la 255 ya está aplicada); **257** función SQL de horario con `businesses.timezone` + rechazo `venue_closed` en `create_paid_order`/`assert_venue_order_allowed`/`quote_order` y en `payments`; **256** `match_join_venue` (entrada explícita a Match; `match_check_in` deja de ser llamada por el latido); **253** respuesta escrita de ToD (reservada; no bloquea tiendas); posible **258** (borrado de dueños, B2-3) y el grupo **Borrado de cuenta** (B2-1 + C-3, **confirmado**; además, **corregir el comentario desactualizado de `delete-account`**, cuya cabecera (líneas 8-9 de `supabase/functions/delete-account/index.ts`) dice que `messages` y otras columnas «SET NULL» se anonimizan, cuando `messages.user_id` es hoy `ON DELETE CASCADE`): `delete-account` purga los objetos del usuario en todos los buckets con datos de usuario **antes** de borrar la fila (si la purga falla, devuelve error y no borra; la persona puede reintentar). **Buckets reales** (no los nombres de la lista inicial): `avatars/<uid>/…`, `profile-media/<uid>/…`, `post-media/<uid>/…`, `match-photos/<uid>/…`, `covers/<uid>/…`, `dm-media/<conversación>/<uid>/…` (el usuario va en la 2.ª carpeta), `voice-notes/room/<sala>/<id>/…` (revisar de quién es cada id); `verification-selfies` está vacío pero entra por si acaso; `menu-photos` **verificado: no son huérfanas** (sus 2 carpetas son ids de `businesses` existentes: 238 y 90 objetos; son del local y no se purgan al borrar una persona); **no existe un bucket de historias ni de «dm-photos»**. Se borra por la API de Storage (no con `delete` en SQL). Más un **script de limpieza única para los 13 huérfanos**, que aplica Juan. **Stripe:** hoy `delete-account` no llama a Stripe; `users.stripe_customer_id` / `stripe_subscription_id` y `subscriptions` existen (no conté cuántas filas tienen datos); los dueños quedan bloqueados (409) y por eso nunca se cancela su cuenta Connect ni su suscripción. Propuesta: cancelar la suscripción activa y borrar el cliente de Stripe de la persona antes de borrar, y decidir qué pasa con los dueños (B2-3). **B11-15 (dueño con acceso al POS) en la migración 260** con pruebas SQL; filtro de texto **C-4, opción B recomendada (pendiente de decisión de Juan)** en la migración **259** (lista ampliada + trigger en posts, retos, perfil y salas; la respuesta escrita 253 lo usa) Web: `/account/delete` pública (B11-3), recuperación de contraseña (B11-1), `/privacy` con Vision y Sentry (B2-4), alias y contactos | Servidor + Web (sin build) | 253, 256, 257, 258, 259, 260 (**Juan las aplica por MCP**; nunca `db push`) | Pruebas SQL de horario (abierto, cerrado, cruce de medianoche, zona), borrado de una cuenta con mensajes y con regalos (en @test002), tests de la función `payments`, tests de la web | **Medio**: toca el cobro y el borrado de cuentas; probar primero con @test002 y un local de prueba |
| **B — App P1 (OTA)** | DT-1 (límites de escala y alturas flexibles en Login, chat, Mapa, Cerca de mí, Mensajes, dock); B3-1 (compuerta con permiso denegado + `openSettings`); B5-1 (usar `match_join_venue`, no reinscribir tras salir) y B5-5; B9-3 (mensaje `venue_closed`, estado Abierto/Cerrado con la zona del local, B7-4 según decisión de Juan); B9-6 (borrar `PricingScreen.tsx` y textos) + test con el grep; B4-2 | OTA (mismo runtime) | 256 y 257 deben estar ya aplicadas | Tests de pantalla con `fontScale`, test de que no queda ningún enlace a Stripe Checkout, tests de Match (salir y no volver), pruebas manuales en iOS y Android 26/35/36 | **Medio**: DT-1 toca muchas pantallas |
| **C — Build nativo para tiendas** | B10-1 (`enableBackgroundPlayback: false` en `expo-audio`); B10-2 (quitar `bluetoothPeripheralPermission`); B10-3 (textos de Face ID y red local, es/en); B7-2 (plugin que añade `fontScale` a `configChanges`); quitar `USE_FINGERPRINT`/`MODIFY_AUDIO_SETTINGS` si se confirma; comprobar `Info.plist` y manifiesto finales y el log del build (Xcode 26) | Build EAS (iOS y Android); ir con las notas de revisión | No | Inspección del IPA/AAB (`Info.plist`, `AndroidManifest`), `expo-updates fingerprint:generate` = hash del log, prueba en dispositivo (letra máxima sin recrear) | **Medio**: el binario cambia; sin OTA de vuelta para versiones ya instaladas |
| **D — P2 (OTA salvo lo indicado)** | B10-4 (carga diferida del SDK de Terminal), B4-1 (reintento del tiempo real; primero reproducir en móvil real), B8-1, B8-2, B9-2, B1-3 a B1-6, B1-11, B2-5, B2-6 (revisar captcha), B2-7, B3-3, resto de P2 del inventario | OTA + web | No | Tests por pantalla; prueba manual | Bajo–medio |
| **E — P3** | Todos los P3 de §2.4 (textos, estilos, accesibilidad menor, avisos de consola) | OTA + web | No | Revisión visual | Bajo |
| **Limpieza** | Borrar la publicación **QA8** ("QA8 publicacion de prueba" + comentario "Comentario QA8" en @test); mensajes de prueba (`QA3…`, `QA-borrado-prueba-1`, DMs de @test/@test1, un reto de ToD activo, presencias); decidir si se borra @test002 tras el Bloque 2; revisar `.playwright-mcp/` en la raíz y las carpetas sin seguimiento del repo (`.agents/`, `docs/audits/…`); desactivar el biométrico y el PIN del emulador; comprobar que ninguna cuenta de prueba quede con datos reales | Manual / SQL (lo hace Juan) | No | Conteo de filas antes y después | Bajo |

---

## 5. Pendientes de Juan (fuera del código)
1. **Textos legales:** `/privacy` con Google Cloud Vision y Sentry; plazos de conservación de datos tras borrar la cuenta (los pide Play en la página de borrado); revisión de asesor legal; texto de Face ID y red local aprobados.
2. **Correo:** confirmar en ImprovMX que existen `safety@jchat.cloud` y `soporte@jchat.cloud` y que alguien los atiende en 24 h / 1–2 días; decidir el correo de soporte público (hoy `jgarcia@otunitylabs.com`).
3. **Decisión de locales cerrados (B7-4):** ¿se puede entrar a un local cerrado (solo aviso) o no? El bloqueo del pago (B9-3) va en servidor de todos modos.
4. **Stripe en modo real (B9-1):** cuándo pasar a claves live (app por OTA con `EXPO_PUBLIC_STRIPE_PK` ya en `pk_live_` al exportar el update; funciones, Vercel y Dashboard de Stripe) y reconfigurar webhooks.
5. **Alerta de presupuesto en GCP** (Vision, Maps y demás APIs) y cuota diaria de Vision.
6. **Prueba de B4-1 en un teléfono real** (modo avión con el chat privado abierto).
7. **Cuenta de revisor y notas de revisión:** confirmar su contraseña y el seed del local de demostración. **Tras el arreglo de B11-15 (migración 260), Juan crea el PIN de @jchatreview en la app (Ajustes → Modo Trabajo → Establecer PIN), lo guarda como `REVIEW_POS_PIN` en `/Users/jcgarcia/.jchat-qa.env` y lo pone en las notas de revisión**, junto con la explicación del captcha, la justificación de `bluetooth-central` / Stripe Terminal y «los reportes se atienden en `/super-admin/alerts`, en menos de 24 h».
8. **Fichas de tienda:** etiquetas de App Privacy (con sexo e interés de Match como sensibles), Data safety, clasificación por edad (18+) y cuestionario IARC, política de citas de Play, estándares CSAE con URL propia, enlaces reales de descarga (hoy `#` e `id000000000`).
9. **Builds:** confirmar que el build de iOS usa Xcode 26 / SDK iOS 26 (log o `eas build:inspect`) y las fechas límite vigentes de ambas tiendas; planificar la ventana del build nativo (fase C).
10. **Limpieza tras el Bloque 2:** los **17 archivos huérfanos de Storage** (13 anteriores + 4 de la primera @test002); @test002 es ahora `5bc06f38…` (cuenta de prueba, Onboarding sin completar). **Decisión de producto:** al borrar una cuenta sus mensajes se **borran** de las salas (cascada), no se anonimizan. Sin verificar: hilo de DM tras el borrado y foto de Match. Las pruebas del Bloque 2 se hicieron en **Android 35 con un build de desarrollo** (el emulador no es API 36).
11a. **Decisión registrada (pendiente de confirmación de Juan):** los mensajes de una cuenta borrada **se borran para todos** (`ON DELETE CASCADE` en `messages.user_id`, verificado el 2026-11-03). **Recomendado mantenerlo** (borrado real de datos personales; coherente con la página de borrado y con Apple 5.1.1(v) / Play). Alternativa descartada: anonimizar.
11. **C-4 (filtro de texto): decisión pendiente.** Recomendado: opción B (ampliar la lista es/en y poner triggers en posts, retos, perfil y salas, en la 259). Si Juan la aprueba, revisa la lista ampliada y los resultados de la batería de falsos positivos antes de aplicar. OpenAI queda como mejora posterior.
12. **Limpieza de los 13 huérfanos de Storage** (`post-media` 9, `avatars` 3, `covers` 1): ejecutar el script único por la API de Storage tras revisar la lista; se prepara en la Fase A.
13. **Prueba en iPad (2.4.1):** simulador de iPad de Xcode 27.1 en vertical (Login, Mapa, chat y Match) cuando terminen los Bloques 2 y 11; la hago yo si Juan lo confirma.
14. **Lo que salga del Bloque 2, del Bloque 11 y de las dos listas de arriba** (**pendiente**).

## 6. Qué NO se pudo probar (resumen)
ConfirmAge de menores de edad, repetir el borrado con una cuenta con mensajes y regalos, restablecer contraseña de punta a punta (captcha y correo), OAuth de Apple/Google, pagos reales, regalos completos, pantallas del POS detrás del PIN, Terminal/impresoras, Tap to Pay, push en iOS (APNs), TalkBack/VoiceOver reales, iOS anteriores a 26.5 e iPhone SE, Chrome Android real, el super-admin y las pantallas del dashboard no visitadas (Analytics, Reviews, Loyalty, Posts, Inventory, KDS, Devices, Printers), Lighthouse, `{local}.jchat.cloud` completo, el manifiesto e `Info.plist` finales de EAS, la app en iPad (2.4.1, **pendiente**) y el filtro de texto en ejecución (solo leído en la BD).
