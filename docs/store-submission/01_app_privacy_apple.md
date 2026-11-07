# 01 — App Store Connect › App Privacy (2026-11-07)

> Base: `main` + D5 (rama `docs/store-submission-2026-11`). Evidencia = archivo:línea del código de esa base. Actualiza `docs/app-review/app-privacy-labels.md` (2026-11-06). Lo que el código no dice va como **PREGUNTA PARA JUAN**.
> **Rastreo (tracking): NO en todas las filas.** No hay SDK de publicidad, ni ATT (`NSUserTracking…` no existe en `mobile/app.config.ts`), ni ID de publicidad (`com.google.android.gms.permission.AD_ID` bloqueado, `app.config.ts:167`), ni datos a corredores. `NSPrivacyTracking: false`, `NSPrivacyTrackingDomains: []` (`app.config.ts:98-99`).
> **Vinculado a la identidad: SÍ en todas** (cuentas con id de usuario; Sentry recibe el id, `mobile/services/monitoring.ts:38-41`).

## 1. Tipos de dato (lista de Apple)

| Tipo de Apple | ¿Se recoge? | Vinculado | Tracking | Finalidades | Evidencia | En el manifiesto hoy |
|---|---|---|---|---|---|---|
| Contact Info › Email Address | Sí | Sí | No | App Functionality | Registro por correo; Apple/Google nos dan el correo (`services/appleSignIn.ios.ts:45`) | ✔ `app.config.ts:28` |
| Contact Info › Name | Sí | Sí | No | App Functionality | Nombre/usuario del perfil; también el nombre de Apple la 1.ª vez (`appleSignIn.ios.ts:5`) | ✔ `:29` |
| Contact Info › Phone Number | Sí, opcional | Sí | No | App Functionality | Teléfono de contacto en pedido de invitado (`orders_contact_phone_len`, `supabase/migrations/245_baseline.sql:9025`) | ✔ `:30` |
| Contact Info › Physical Address / Other | No | — | — | — | No hay direcciones de usuario (no hay entrega) | — |
| Health & Fitness | No | — | — | — | Sin HealthKit ni datos de salud | — |
| Financial Info › Payment Info | Sí, opcional | Sí | No | App Functionality | Tarjeta tecleada en campos de Stripe (`@stripe/stripe-react-native`, `app.config.ts:217`); la app no la guarda. Apple Pay / Google Pay vía Stripe | ✔ `:37` |
| Financial Info › Other | No | — | — | — | Importes de pedido van en Purchases | — |
| Location › **Precise Location** | Sí | Sí | No | App Functionality | `Location.getCurrentPositionAsync` (`services/geoPosition.ts:41`), `watchPositionAsync` (`services/geofence.ts:207`), mapa (`screens/map/MapScreen.tsx:193-202`). Solo "mientras se usa" (`app.config.ts:254`; `ACCESS_BACKGROUND_LOCATION` bloqueado en `:165`). Las coordenadas se mandan al servidor para comprobar el radio (`join_room_via_qr(p_lat,p_lng)`, `245_baseline.sql:2669`); `match_presence` no tiene columnas de coordenadas (`:8691-8702`) | ✔ `:31` |
| Location › Coarse Location | No como dato aparte | — | — | — | Lo cubre Precise | — |
| Sensitive Info | **Sí (Match)** | Sí | No | App Functionality | Sexo declarado e interés (`seeking`) del perfil de Match v2 (`match_profiles.gender/seeking`, migración 254). Apple lo trata como orientación sexual | ✔ `app.config.ts:41` |
| Contacts | No | — | — | — | No hay `expo-contacts` en `mobile/package.json` | — |
| User Content › Emails or Text Messages | Sí | Sí | No | App Functionality | Chat, DMs (`messages`, `dm_messages`) | (cubierto por `OtherUserContent`, `:34`) |
| User Content › Photos or Videos | Sí, opcional | Sí | No | App Functionality | Perfil, posts, historias, DMs, Match, selfies de verificación (`expo-image-picker`/`expo-camera`, `app.config.ts:203-215`) | ✔ `:32` |
| User Content › Audio Data | Sí, opcional | Sí | No | App Functionality | Notas de voz (`expo-audio`, `app.config.ts:267-277`) | ✔ `:33` |
| User Content › Customer Support | Sí | Sí | No | App Functionality | Reportes (`report_content`, `services/reports.ts:35`), "Contacto" | (cubierto por `OtherUserContent`) |
| User Content › Other User Content | Sí | Sí | No | App Functionality | Posts, comentarios, reseñas, cartas de Verdad o Reto, intereses de Match | ✔ `:34` |
| Browsing History | No | — | — | — | Sin analítica de navegación | — |
| Search History | No | — | — | — | Las búsquedas no se guardan (**PREGUNTA PARA JUAN:** confirmar que ninguna búsqueda se persiste en servidor) | — |
| Identifiers › User ID | Sí | Sí | No | App Functionality; Analytics (Sentry) | `auth.users.id`; `Sentry.setUser({id})` (`monitoring.ts:40`) | ✔ `:35` |
| Identifiers › **Device ID** | Sí, opcional | Sí | No | App Functionality | Token push de Expo/APNs (`services/notifications.ts`; destino `https://exp.host/--/api/v2/push/send`, `supabase/functions/send-push/index.ts:24`). Invitados: id de dispositivo aleatorio + huella con hash + IP con hash (política `/privacy` §2) | ✔ `app.config.ts:42` |
| Purchases › Purchase History | Sí | Sí | No | App Functionality | Pedidos, propinas, regalos (`orders`, `gift_*`) | ✔ `:36` |
| Usage Data › Product Interaction / Advertising / Other | No | — | — | — | Sin analítica de producto ni publicidad | — |
| Diagnostics › Crash Data | Sí | Sí | No | Analytics | Sentry (`monitoring.ts:29`; `sendDefaultPii:false`, `utils/monitoringConfig.ts:82`) | ✔ `:38` |
| Diagnostics › Performance Data | Sí | Sí | No | Analytics | Sentry `tracesSampleRate: 0.2` (`monitoringConfig.ts:83`) | ✔ `:39` |
| Diagnostics › Other Diagnostic Data | Sí | Sí | No | Analytics | Sentry Session Replay solo en error, enmascarado por defecto (`monitoring.ts:31`, `monitoringConfig.ts:84-85`) | ✔ `app.config.ts:43` (Replay activo en el código: `services/monitoring.ts:31`) |
| Other Data Types | Sí | Sí | No | App Functionality | Año de nacimiento (`confirm_age` guarda solo `birth_year`, `245_baseline.sql:773-777`) | ✔ `:40` |

## 2. Manifiesto (build 13, rama `fix/privacy-manifest-b13`)
`app.config.ts` entra en el fingerprint de EAS: los tres tipos añadidos (`SensitiveInfo`, `DeviceID`, `OtherDiagnosticData`; líneas 41-43) viajan en el **build 13**, no por OTA. Hasta entonces se declaran en App Store Connect (la ficha es lo que cuenta). `mobile/scripts/privacy-manifest.test.mjs` compara `COLLECTED_DATA_TYPES` con la tabla de §1 de este archivo (tipos, finalidad principal y que ninguna fila "Sí" quede marcada ✘).

## 3. Servicios de terceros que reciben datos
| Servicio | Qué recibe | Dónde (evidencia) | ¿En `/privacy` de `main`? |
|---|---|---|---|
| Supabase (BD, auth, storage; EE. UU.) | Todo el dato de cuenta/contenido | `services/supabase.ts` | Sí (§4) |
| Stripe (+ Terminal, Connect) | Pago; id de cliente/cuenta | `app.config.ts:217-240`, funciones `payments`, `stripe-*`, `terminal` | Sí |
| Sentry (`@sentry/react-native`) | Errores, trazas, id de usuario, replay en error | `app.config.ts:263`, `monitoring.ts` | **No** (sí en la rama `fix/a6-web-legal`) |
| Google Cloud Vision (SafeSearch) | Bytes de fotos de DM y Match | `supabase/functions/_shared/safesearch.ts`, `moderate-dm-photo`, `moderate-match-photo` | **No** (a6 sí) |
| Google Maps | Android (mapa nativo, `JChatMap.tsx:83`) y web dashboard (`@vis.gl/react-google-maps`). iOS usa Apple Maps | `JChatMap.tsx:71-83` | Sí (solo Android) |
| Apple Maps / APNs / Sign in with Apple | Mapa iOS, push, identidad; token de revocación cifrado (D3, `apple_tokens`) | `appleSignIn.ios.ts`, `functions/apple-token` | Sí (Apple) |
| Google Sign-In / FCM | Identidad; push Android | `google-services.json`, `expo-notifications` | Sí |
| Expo Push (`exp.host`) / EAS Update | Token, **texto de la notificación**; bundles OTA | `send-push/index.ts:24`, `app.config.ts:65` | Sí (Expo), no dice que el texto pasa por Expo |
| hCaptcha | IP y señales del dispositivo al iniciar sesión / pedir sin cuenta | `services/captcha.tsx:39`, `guest-pay/index.ts:78`, `guest-tab/index.ts:74` | Sí |
| Resend | Correo del destinatario (reservas canceladas, avisos de seguridad interno) | `functions/_shared/ownerCloseEmails.ts`, `safety-alert`, `outbound-emails` | **No** (a6 sí) |
| Anthropic, OpenAI, Google Generative Language | Solo dueños con el asistente de menú (nombres/descripciones del menú; imágenes de referencia) | `functions/menu-assistant/index.ts:235,789,794` | Parcial: solo Anthropic |
| Have I Been Pwned (`api.pwnedpasswords.com`) | **Solo los 5 primeros caracteres del SHA-1 de la contraseña** (k-anonimato) + IP | `mobile/services/pwned.ts:12-24`, `web/lib/pwned.ts`; prefijo `utils/password.ts:30-33` | **No** |
| Vercel | Hosting web | — | Sí |

## 4. Privacy Manifest de iOS: ¿cuadra?
- `NSPrivacyCollectedDataTypes` = 16 tipos (`app.config.ts:27-43`), todos `Linked: true`, `Tracking: false`; coincide con la tabla de §1 (test).
- `NSPrivacyAccessedAPITypes`: UserDefaults CA92.1, FileTimestamp C617.1, SystemBootTime 35F9.1, DiskSpace E174.1 (`app.config.ts:101-106`); el propio comentario pide revalidarlos con los avisos ITMS del primer TestFlight. **PREGUNTA PARA JUAN:** ¿ya hubo avisos ITMS en TestFlight del build 12?
- Permisos con texto (iOS): ubicación en uso `:45`, cámara `:46`, Face ID `:47`, red local `:48`, movimiento `:49`, fotos `:206`, micrófono `:269`, Bluetooth (plugin de Stripe Terminal, `:230-236`). Modo en segundo plano: `bluetooth-central` (Stripe Terminal, `bluetoothBackgroundMode: true`, `:232`); audio en segundo plano desactivado (`enableBackgroundPlayback: false`, `app.config.ts:270-273`).
