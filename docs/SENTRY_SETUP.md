# Sentry — qué falta para activarlo (pasos de Juan)

La app ya trae Sentry (`mobile/services/monitoring.ts`, privacidad en `mobile/utils/monitoringConfig.ts`). **Sin DSN no se
inicializa nada** y la app funciona igual. No hay ningún valor en el repo.

## 1. Crear el proyecto y el DSN
1. En sentry.io, organización `otunity-labs`, crear el proyecto **`jchat-mobile`** (plataforma React Native).
2. Copiar el **DSN** (es público, no es secreto).
3. Añadirlo en EAS como variable **plain**, nombre `EXPO_PUBLIC_SENTRY_DSN`, en el entorno de cada build (production /
   preview / staging). En local: `mobile/.env.local` con `EXPO_PUBLIC_SENTRY_DSN=...` (el archivo no se versiona).

## 2. Token para subir los source maps (opcional, recomendado)
1. En Sentry: Settings → Developer Settings → Auth Tokens → crear uno con permisos de releases / source maps.
2. Añadirlo en EAS como **secret**, nombre `SENTRY_AUTH_TOKEN`. Nunca en el repo ni en `app.config.ts`.
3. Cambiar `SENTRY_DISABLE_AUTO_UPLOAD` a `"false"` en los perfiles de `mobile/eas.json` (o quitar esa línea).

## Por qué `SENTRY_DISABLE_AUTO_UPLOAD=true` por defecto
El plugin sube los source maps en las fases de build de Xcode (`sentry-xcode.sh`) y de Gradle. Sin `SENTRY_AUTH_TOKEN` esa subida
**falla y rompe el build** ("error: sentry-cli …"). Con `SENTRY_DISABLE_AUTO_UPLOAD=true` el build sigue sin token y solo se
omite la subida (los errores llegan, pero con stack traces minificados). `mobile/eas.json` lo trae en todos los perfiles.
En builds locales (`npx expo run:ios|android`): `export SENTRY_DISABLE_AUTO_UPLOAD=true` antes del comando.

## Privacidad (no desactivar)
- `sendDefaultPii: false`; el usuario es solo su `id` (nunca correo ni nombre).
- `beforeSend` borra `user.email`, `user.ip_address`, `contexts.location` y cualquier campo `lat`, `lng`, `latitude`, `longitude`,
  `token`, `table_qr_token`, `password` (y `access_token`, `refresh_token`, `authorization`, `tracking_code`) a cualquier profundidad.
- Los breadcrumbs de `console` se descartan.
- Replay de sesión: 0 % de sesiones, 100 % de las que tienen un error, con las **máscaras por defecto** (texto, imágenes y campos
  enmascarados). No se añade en web.

## Comprobar que llegan eventos
En un build de desarrollo, llamar `captureTestError()` (`mobile/utils/monitoringSmoke.ts`) desde un botón temporal. No hace nada
en builds de release ni sin DSN.
