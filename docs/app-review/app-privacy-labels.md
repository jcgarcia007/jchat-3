# App Privacy (App Store Connect) — tabla final de datos

> **BORRADOR para revisión de Juan · 2026-11-06.** Sustituye en la práctica a `docs/store-listing/app-privacy-labels.md` (que se escribió antes de Match v2 y de la moderación con Vision). Fuente comparada: `COLLECTED_DATA_TYPES` en `mobile/app.config.ts` (líneas 27-41) y el código/migraciones de hoy.
> En todas las filas: **vinculado a la identidad = Sí**, **uso para seguimiento (tracking) = No**. La app no tiene SDK de publicidad, ni ATT, ni ID de publicidad (`AD_ID` bloqueado en Android), ni comparte datos con corredores de datos.

## 1. Tabla por tipo de dato

| Tipo de dato (Apple) | ¿Se recoge? | Vinculado a identidad | Tracking | Finalidad | Qué es en la app | En `app.config.ts` hoy |
|---|---|---|---|---|---|---|
| Contact Info → Email Address | Sí | Sí | No | App Functionality | Correo de la cuenta | ✔ `EmailAddress` |
| Contact Info → Name | Sí | Sí | No | App Functionality | Nombre y usuario del perfil | ✔ `Name` |
| Contact Info → Phone Number | Sí (opcional) | Sí | No | App Functionality | Teléfono de contacto en pedidos de invitado | ✔ `PhoneNumber` |
| Location → **Precise Location** | Sí | Sí | No | App Functionality | Coordenadas que se envían a la función de geocerca para comprobar que estás en el local. **No se guardan**; no se muestran a nadie; solo "mientras se usa" | ✔ `PreciseLocation` |
| Location → Coarse Location | No como dato aparte | — | — | — | Lo cubre Precise Location | (no declarada, correcto) |
| User Content → Photos or Videos | Sí (opcional) | Sí | No | App Functionality | Foto de perfil, publicaciones, historias, DMs, Match, selfies de verificación | ✔ `PhotosorVideos` |
| User Content → Audio Data | Sí (opcional) | Sí | No | App Functionality | Notas de voz | ✔ `AudioData` |
| User Content → Other User Content | Sí | Sí | No | App Functionality | Mensajes, publicaciones, comentarios, reseñas, respuestas de Verdad o Reto, perfil de Match (intereses) | ✔ `OtherUserContent` |
| Identifiers → User ID | Sí | Sí | No | App Functionality | Id de cuenta | ✔ `UserID` |
| Identifiers → **Device ID** | Sí (opcional) | Sí | No | App Functionality | Token de notificaciones push de Expo (identifica el dispositivo) | ✘ **falta** (hoy solo `UserID` con la nota "push token") |
| Purchases → Purchase History | Sí | Sí | No | App Functionality | Pedidos, propinas y regalos de una bebida o plato | ✔ `PurchaseHistory` |
| Financial Info → Payment Info | Sí (opcional) | Sí | No | App Functionality | La tarjeta se teclea en los campos de Stripe; la app no la guarda en sus servidores | ✔ `PaymentInfo` |
| Diagnostics → Crash Data | Sí | Sí | No | Analytics | Sentry | ✔ `CrashData` |
| Diagnostics → Performance Data | Sí | Sí | No | Analytics | Sentry | ✔ `PerformanceData` |
| **Sensitive Info** | Sí (Match) | Sí | No | App Functionality | **Sexo** (`woman/man/nonbinary`) e **interés** (`seeking`: mujeres/hombres/todos) del perfil de Match v2 (`match_profiles.gender`, `seeking`, migración 254). Apple lo trata como información sensible (orientación sexual) | ✘ **falta** |
| Other Data Types | Sí | Sí | No | App Functionality | Año de nacimiento (confirmar la edad, solo el año) | ✔ `OtherDataTypes` |

No se recogen: contactos, calendario, historial de navegación ni de búsqueda propio, salud, datos de uso para publicidad, información de otras apps, SMS.

## 2. Diferencias con `app.config.ts` (lo que hay que decidir)

1. **Sensitive Info (sexo e interés de Match).** El manifiesto no lo declara y Match v2 lo recoge. Propuesta: declararlo en App Store Connect (`Sensitive Info`, App Functionality, vinculado, sin tracking) y añadir la clave al manifiesto (`NSPrivacyCollectedDataTypeSensitiveInfo`). Cambiar `app.config.ts` es un cambio de manifiesto iOS → **entra en el fingerprint**, así que sería build 13 (no OTA). Mientras tanto, declararlo en App Store Connect es suficiente para la ficha; el manifiesto y la ficha pueden diferir por un build, pero Apple las coteja: preferible alinear ambos.
2. **Device ID (token push).** Mismo tratamiento: declarar en App Store Connect; añadir `DeviceID` al manifiesto en el build 13.
3. **Proveedores que procesan datos (no cambian la tabla, pero deben salir en la política):** Supabase, Stripe, Google Cloud Vision (recibe los bytes de las fotos de DM y Match para SafeSearch), Google Maps (mapa), Expo Push, Sentry, hCaptcha (captcha al iniciar sesión: recibe IP y señales del dispositivo), Resend (correos). hCaptcha en la app móvil puede contar como dato de terceros ("Other Data" / Device ID, no vinculado): **pendiente de Juan** (ver abajo).
4. **Sin diferencias** en: correo, nombre, teléfono, ubicación precisa, fotos, audio, contenido, id, compras, pago, fallos, rendimiento, año de nacimiento.

## 3. Texto de la URL y del enlace de privacidad
- URL de la política: `https://jchat.cloud/privacy` (EN/ES). Soporte: `https://jchat.cloud/support`. Términos: `https://jchat.cloud/terms`. Borrado: `https://jchat.cloud/account/delete`.
- La política con proveedores y plazos está en la rama `fix/a6-web-legal` (sin fusionar a `main` todavía); la web publicada debe tenerla **antes** de enviar.

## 4. Pendiente de Juan
1. ¿Declaro `Sensitive Info` y `Device ID` en App Store Connect **ya** y los añado al manifiesto en el build 13 (recomendado)?
2. ¿hCaptcha en el móvil se declara? Propuesta: sí, como "Other Data Types" no vinculado, o confirmar con hCaptcha su declaración como SDK de terceros.
3. ¿Qué dato retiene Sentry (IP, id de usuario)? No lo puedo ver desde el repo; si manda el id de usuario, va "vinculado".
