# Flujo QR de JChat — recorrido actual y propuesta de puerta de entrada única

Estado: **solo lectura + propuesta** (no se cambió código). Fuentes revisadas: `web/app/c/[token]/{page,RoomHub,JoinRoomButton}.tsx`, `web/app/c/[token]/room/{page,ChatRoom}.tsx`, `web/components/c/WaiterSheet.tsx`, `web/app/t/[token]`, `web/app/m/[slug]`, `supabase/migrations/026_room_qr_tokens.sql`, `supabase/functions/{guest-pay,guest-tab}`, `mobile/app.config.ts`, `mobile/navigation/AppNavigator.tsx`, `mobile/utils/venueQr.ts`.

---

## 1. Recorrido actual de `jchat.cloud/c/{token}`

### 1.1 Qué es el token
`rooms.qr_token` (columna asignada por trigger al crear la sala, migración 026). Cada sala (principal o subsala) tiene el suyo. El QR impreso es la URL `…/c/{qr_token}`.

### 1.2 Paso a paso

| # | Dónde | Qué pasa |
|---|---|---|
| 1 | `web/app/c/[token]/page.tsx` (Server Component) | Llama en paralelo a `resolve_room_qr(token)` y `auth.getUser()` (sesión por cookie). `resolve_room_qr` es `security definer`, **anon puede llamarla**, y devuelve `room_id, parent_room_id, business_id, business_name, room_name, is_sub_room` solo si la sala está activa. |
| 2a | Token inválido | Tarjeta "QR no válido" (`qrEntry.invalidTitle/invalidBody`). |
| 2b | Token válido **sin sesión** | Tarjeta de bienvenida con negocio y sala y un único botón **"Iniciar sesión para entrar"** → `/auth/login?next=/c/{token}`. No hay camino de invitado: sin cuenta no se ve ni el menú. |
| 2c | Token válido **con sesión** | Renderiza `<RoomHub>`. |
| 3 | `RoomHub.tsx` (client) | Al montar llama `join_room_via_qr(token)` (requiere sesión; idempotente). Estados: `joining` → "Verificando acceso…" (**texto sin traducir**), `ok`, `invalid_qr`, `error` (reintentar). Si `auth_required` redirige a login. |
| 4 | `join_room_via_qr` (SQL) | Inserta/renueva `room_members` 24 h para la sala y, si es subsala, también para la sala padre. **Ignora la contraseña** de la sala. Devuelve `(room_id, parent_room_id)`. |
| 5 | Hub (3 botones) | **Menú**: `menu_mode='external'` → enlace externo en pestaña nueva; `'web'` → `/m/{slug}`; otro → botón deshabilitado con etiqueta "pronto" (sin traducir). **Llamar al servicio**: abre `WaiterSheet` → `insert` en `service_calls` (política de inserción solo `authenticated`, migración 010; cooldown de 5 min solo en cliente). **Entrar al chat** → `router.push('/c/{token}/room')`. |
| 6 | `room/page.tsx` (Server) | Resuelve el token otra vez, exige sesión (si no, `/auth/login?next=/c/{token}/room`), exige edad confirmada (`requireAgeConfirmed`) y renderiza `ChatRoom`. |
| 7 | `room/ChatRoom.tsx` (client, ~2100 líneas) | Mensajes por Realtime, presencia por canal compartido `presence:{roomId}`, `can_access_room` antes de leer mensajes, subsalas con contraseña (`verify_room_password`), llamada a servicio, fotos. **No hay geocerca en web**: el QR es la prueba de presencia. |

### 1.3 Hallazgos relevantes

1. **La app no participa.** `mobile/app.config.ts` solo declara el esquema `jchat://`. No hay `associatedDomains` (iOS), `intentFilters` (Android) ni archivos `.well-known` en `web/public`. `AppNavigator` solo enlaza `jchat://room/:id` y `post/:postId`. Escanear el QR con la cámara siempre abre el navegador, tengas la app o no.
2. **La app no usa `join_room_via_qr`.** Solo aparece en `database.types.ts`. En móvil se entra por mapa/cercanos + geocerca (`check_geofence_and_join_room`). El único uso del token en la app es el escáner de Match (`MatchQrScanner` → `match_check_in(p_qr_token)`).
3. **El host del QR no está fijado.** `web/services/qr.ts` construye la URL con `window.location.origin` y, sin ventana, con `https://jchat-3.vercel.app`. Un QR generado desde otro dominio queda impreso con ese dominio. Los enlaces universales solo funcionan para el dominio verificado, así que hay que fijarlo a `https://jchat.cloud` (variable de entorno) y redirigir los QR ya impresos.
4. **`JoinRoomButton.tsx` parece código muerto** (el flujo actual usa `RoomHub`).
5. **Servicio sin cuenta no existe.** `service_calls` solo admite inserción de usuarios autenticados y `guest-tab` no tiene acción de llamada de servicio.
6. **Los pagos sin cuenta sí existen:** `guest-pay` (hCaptcha en servidor, orden con `user_id` NULL) y `guest-tab` (sesión de invitado por mesa); `/m/{slug}` y `/t/{token}` son públicos y `/t/{token}` ya reutiliza `join_room_via_qr` para el subchat de mesa.
7. **Expo Web no está montado.** Hay script `expo start --web` pero no `react-native-web`/`react-dom`, y la app usa módulos solo nativos (Stripe RN, cámara, BT, TCP).

### 1.4 Textos sin traducir en el hub (`RoomHub.tsx`)

| Texto actual | Ubicación | Clave propuesta (`qrEntry`) | es | en |
|---|---|---|---|---|
| `Verificando acceso…` | estado `joining` | `verifyingAccess` | Verificando acceso… | Checking access… |
| `Menú` (×3: externo, web, deshabilitado) | botón de menú | `menu` | Menú | Menu |
| `pronto` | etiqueta del botón deshabilitado | `soon` | pronto | soon |

---

## 2. Propuesta: el QR como puerta de entrada única

Objetivo: **un solo QR por sala que sirva a todos**: con la app instalada abre la app y entra directo; sin la app abre un hub web útil sin cuenta; y escanearlo deja la sesión de local y Match activas con método `qr`.

### 2.1 Enlaces universales (abrir la app si está instalada)

- **Dominio único:** `https://jchat.cloud` (fijar `NEXT_PUBLIC_SITE_URL` y usarlo en `roomQrUrl`; redirección 301 desde `jchat-3.vercel.app/c/*` para QR ya impresos).
- **iOS:** `ios.associatedDomains: ['applinks:jchat.cloud']` en `app.config.ts` y servir `/.well-known/apple-app-site-association` (sin extensión, `Content-Type: application/json`) con `appID: <TeamID>.com.juangarciacruz.jchatapp` y `paths: ["/c/*", "/t/*"]`.
- **Android App Links:** `android.intentFilters` con `autoVerify: true`, `scheme: https`, `host: jchat.cloud`, `pathPrefix: /c/` y `/t/`; servir `/.well-known/assetlinks.json` con `package_name` y las huellas SHA-256 del certificado de firma (Play App Signing **y** la de subida).
- **En la web (Next):** los dos archivos como Route Handlers o ficheros en `public/.well-known/` con cabecera `Content-Type` correcta y **sin redirección** (Apple/Google no siguen redirecciones).
- **En la app:** añadir `https://jchat.cloud` a `linking.prefixes` y rutas `c/:token` → pantalla nueva `QrEntry`.
- **Requiere build nuevo** (entitlement iOS y manifiesto Android).
- **Sin la app instalada:** abre la web. Para quien sí la tenga pero el navegador no la abra, botón "Abrir en la app" con `jchat://c/{token}` (esquema ya existente) y enlaces a las tiendas.

### 2.2 Pantalla `QrEntry` en la app

1. Resuelve el token con `resolve_room_qr` (anon-callable).
2. Si no hay sesión o falta confirmar la edad: guarda el token pendiente (AsyncStorage) y, al terminar login/edad, continúa. Hoy los enlaces profundos se pierden al cambiar de navegador por estado de auth.
3. Con sesión: `join_room_via_qr(token)` (membresía 24 h) → navega a `ChatRoom` con un parámetro `qrToken`.
4. `ChatRoom` con `qrToken`: el chat se abre por membresía de 24 h (el QR reemplaza a la geocerca **solo para el chat**). Match **no** se activa solo por el QR: ver decisiones en el §5 (siempre exige una lectura de ubicación dentro del radio; el QR solo destraba el caso de ubicación simulada).

### 2.3 Hub web sin cuenta (`/c/{token}`)

- Quitar la exigencia de sesión para **ver** el hub. Sin cuenta:
  - **Menú** → `/m/{slug}` (o enlace externo). Reutiliza `guest-pay`/`guest-tab`; no hay que construir nada de pagos.
  - **Llamar al servicio** → requiere un camino de invitado nuevo: acción `call_service` (en `guest-tab` o función propia, `verify_jwt = false`) con hCaptcha, límite por dispositivo/IP (hash, como `guest-tab`) y cooldown en servidor; inserta `service_calls` con `user_id` NULL. Necesita SQL de Planning (columna nullable/política); nada en esta propuesta lo ejecuta.
  - **Entrar al chat** → exige cuenta: login con `next` y vuelve al hub.
- Con sesión: igual que hoy, pero **sin bloquear el hub mientras se verifica**: el estado "Verificando acceso…" solo cubre el botón del chat, y los tres textos pasan a i18n (tabla 1.4).
- CTA adicional para Match: "Abrir en la app para usar Match" (Match es nativo).

### 2.4 "Entrar al chat" hacia el cliente Expo Web

Hoy el chat web es el `ChatRoom.tsx` de Next. Llevarlo al cliente Expo Web exige montar Expo Web (react-native-web, react-dom, metro web), dividir por plataforma los módulos nativos (`Foo.web.tsx` / `Foo.native.tsx`, como pide `CLAUDE.md`) y desplegar el export web aparte (por ejemplo subdominio). Es trabajo grande.

**Recomendación:** fase 1 mantiene `/c/{token}/room` (Next) detrás del botón; la fase 2 decide si se migra a Expo Web. Match no se promete en web.

### 2.5 Escaneo → sesión de local + Match con `qr`

- Estado actual del servidor (migraciones 189/196, **a cambiar por Planning según el §5**): `match_check_in(p_qr_token)` acepta el token de **cualquier sala activa del negocio** y fija `method = 'qr'`; hoy el QR por sí solo activa Match al instante.
- Decisión (§5): el QR por sí solo **no** activa Match. Match exige una lectura de ubicación dentro del radio; el QR solo destraba el caso `mocked_location` (Android) si además la lectura cae dentro del radio.
- Cliente: el escáner interno (`MatchQrScanner`) ya envía el token junto con la lectura de ubicación; con enlaces universales el mismo token llega por la cámara del sistema → mismo camino (`QrEntry`).

---

## 3. Riesgos y decisiones abiertas

1. ~~QR como llave remota.~~ **Resuelto en el §5** para Match: el QR solo ya no activa Match (exige ubicación dentro del radio). Riesgo residual aceptado: quien fotografíe el QR puede obtener membresía de chat de 24 h (comportamiento actual; el chat no depende de la ubicación). Sigue disponible la rotación diaria del token como mejora futura.
2. ~~Geocerca con entrada por QR.~~ **Resuelto en el §5:** el latido no expulsa del chat a quien entró por QR; solo controla Match.
3. **Servicio sin cuenta = superficie de abuso.** Mitigación: hCaptcha, límite por dispositivo/IP y aviso de "pedido de ayuda discreta" sin datos personales.
4. **Datos que necesito de Juan:** Apple Team ID, huellas SHA-256 de Android (subida y Play), y confirmar que `jchat.cloud` es el dominio definitivo para QR (**pendiente de confirmación**, ver §5).
5. **QR ya impresos** con `jchat-3.vercel.app`: mantener redirección permanente.

## 4. Fases propuestas (estimación relativa)

| Fase | Contenido | Tamaño |
|---|---|---|
| Q0 | Fijar dominio del QR (`NEXT_PUBLIC_SITE_URL`), redirección de dominios viejos, i18n de los 3 textos del hub, borrar `JoinRoomButton` si se confirma que sobra | S |
| Q1 | Hub web sin cuenta: ver hub anónimo, Menú por `/m`, "Entrar al chat" con login | M |
| Q2 | Llamada de servicio de invitado (EF + SQL de Planning + hCaptcha + límites) | M |
| Q3 | Enlaces universales: `.well-known`, `associatedDomains`, `intentFilters`, `linking`, `QrEntry`, token pendiente tras login, build nuevo | L |
| Q4 | Entrada por QR en `ChatRoom` + `match_check_in` con `qr` + decisión del punto 3.2 | M |
| Q5 | (Opcional) Expo Web como cliente de chat | XL |

---

## 5. Decisiones FINALES (Juan/Planning)

> Sustituyen a la versión anterior de este apartado y a cualquier afirmación en contra de §2–§4 (en particular: **el QR ya no exime la ubicación del chat**).

### Regla de oro (iOS, Android y web; con cuenta o sin cuenta)
- **DENTRO del área del local** (ubicación verificada **en el servidor**): todo.
- **FUERA del área o sin permiso de ubicación:** SOLO ver el menú y pedir para recoger (si `businesses.pickup_enabled`). Sin chat, sin llamar al mesero, sin pedidos a la mesa, sin Match ni regalos. Con `pickup_enabled` apagado y fuera del área: solo ver el menú, sin botón de pedir.
- **La verificación es del servidor;** la app y la web solo mandan coordenadas. "Fuera" nunca es un rechazo seco: se muestra "No pudimos confirmar que estés en {negocio}", el botón **Permitir ubicación / Reintentar** y lo que sí se puede hacer.

### Decisiones
1. **(a) Regla de oro como arriba, también por QR.** El QR **no** exime la ubicación: escanear resuelve la sala, pero el acceso al chat pasa por la misma verificación de ubicación del servidor. Fuera del área, el QR lleva a la pantalla de solo menú/recoger.
2. **(b) Match** se activa cuando el servidor ve la entrada al chat con ubicación (`venue_presence_ok`). El escáner de QR de Match queda solo para el caso `mocked_location` (Android): el QR destraba la ubicación simulada **si además** la lectura cae dentro del radio. *Planning ajusta `match_check_in` en la base.*
3. **(c) Pedidos para recoger** = interruptor del dueño (`businesses.pickup_enabled`, "Pedidos para recoger" en Configuración).
4. **(d) Mesero sin cuenta:** ubicación obligatoria; **1 llamada abierta por mesa/dispositivo**; **bloqueo de 24 h al dispositivo** en caso de abuso; **aviso al dueño** (notificación `work_alert` con `kind: 'service_abuse'`). Con cuenta sigue el flujo actual (también sujeto a la regla de oro).
5. **(e) Dominio único: `jchat.cloud` — confirmado.** Formato final de los QR en la fase 4: `barxzx.jchat.cloud/5-k3f9`. Mientras tanto, el host del QR se fija a `https://jchat.cloud` (nunca `window.location.origin` ni `vercel.app`) y se redirige `jchat-3.vercel.app/c/*`.
6. **(f) Enlaces universales** (`associatedDomains`, App Links, `.well-known`) **van en el build del cambio de cuentas a Otunity Labs**, no antes.

### Efecto sobre lo propuesto en §2–§4
- §2.2 punto 4: la entrada por QR **no** abre el chat sin ubicación; aplica la regla de oro.
- §2.3 (hub web): se pide la ubicación del navegador **antes** del hub; dentro → hub completo; fuera o sin permiso → hub reducido (Menú + "Pedir para recoger" si `pickup_enabled` + texto de la regla + "Permitir ubicación"). Entrar al chat exige dentro + cuenta + edad. `join_room_via_qr` pasa a recibir coordenadas.
- §3 puntos 1 y 2: **resueltos** (el QR no es llave remota para el chat ni para Match; el latido de geocerca controla chat y Match).
- §4: **Q3** ligada al build de Otunity Labs; **Q4** pasa a ser "misma verificación de ubicación en la entrada por QR"; **Q2** (mesero sin cuenta) incluye ubicación, 1 llamada abierta, bloqueo de 24 h y aviso al dueño.
