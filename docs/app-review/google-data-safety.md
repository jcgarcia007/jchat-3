# Google Play — formulario "Data safety" (respuestas para copiar)

Basado en lo que recoge la app de verdad y **igual a la tabla de privacidad de Apple** (`docs/store-listing/app-privacy-labels.md`, rama `fix/store-blockers`; mismo origen: `COLLECTED_DATA_TYPES` en `mobile/app.config.ts`). Los nombres de categoría son los del formulario de Play Console; **contrástalos con el formulario real** antes de enviarlo (Google cambia los textos de vez en cuando; no pude abrir su política actual esta noche).

## 1. Preguntas iniciales

| Pregunta | Respuesta |
|---|---|
| ¿La app recoge o comparte algún tipo de dato de usuario requerido? | **Sí** |
| ¿Todos los datos se cifran en tránsito? | **Sí** (HTTPS/TLS con Supabase, Stripe y los demás) |
| ¿Se puede pedir el borrado de los datos? | **Sí**: dentro de la app (Ajustes → Eliminar cuenta) y en la web `https://jchat.cloud/account` |
| ¿Sigue la política de Familias? | No (app para mayores de 18) |
| ¿Revisión de seguridad independiente? | No |

## 2. Tipos de datos (todos "recogidos", ninguno "compartido" con terceros para sus fines)

Los proveedores que procesan datos por cuenta de JChat (Supabase, Stripe, Sentry, Firebase Cloud Messaging, Google Cloud Vision para escanear fotos) **no cuentan como "compartir"** en el formulario de Google (son encargados del tratamiento). Si prefieres ser más prudente, marca "compartido" solo para Stripe (datos de pago); lo normal es no hacerlo.

| Categoría de Play | Tipo | Se recoge | Se comparte | Obligatorio u opcional | Finalidades |
|---|---|---|---|---|---|
| Información personal | Nombre | Sí | No | Obligatorio | Funciones de la app, gestión de cuenta |
| Información personal | Dirección de correo | Sí | No | Obligatorio | Funciones de la app, gestión de cuenta |
| Información personal | ID de usuario | Sí | No | Obligatorio | Funciones de la app, gestión de cuenta |
| Información personal | Número de teléfono | Sí | No | **Opcional** (pedidos de invitado) | Funciones de la app |
| Información personal | Otra información (año de nacimiento) | Sí | No | Obligatorio | Funciones de la app (confirmar la edad) |
| Ubicación | Ubicación precisa | Sí | No | Obligatorio para entrar al chat de un local | Funciones de la app. Se envía al servidor para comprobar la presencia en el local y **no se guardan las coordenadas** |
| Ubicación | Ubicación aproximada | Sí | No | Obligatorio para entrar al chat de un local | Funciones de la app (lo mismo que la anterior; Android entrega ambas) |
| Información financiera | Información de pago | Sí | No | Opcional (solo al pagar) | Funciones de la app; los números de tarjeta los recoge Stripe |
| Información financiera | Historial de compras | Sí | No | Opcional | Funciones de la app (pedidos y regalos) |
| Mensajes | Otros mensajes en la app | Sí | No | Obligatorio para usar el chat | Funciones de la app |
| Fotos y vídeos | Fotos | Sí | No | Opcional | Funciones de la app (perfil, publicaciones, historias, chat, Match, selfies de verificación) |
| Archivos de audio | Grabaciones de voz | Sí | No | Opcional | Funciones de la app (notas de voz) |
| Actividad en la app | Otro contenido generado por usuarios | Sí | No | Opcional | Funciones de la app (publicaciones, comentarios, reseñas) |
| Información y rendimiento de la app | Registros de fallos | Sí | No | Obligatorio | Analítica (Sentry) |
| Información y rendimiento de la app | Diagnósticos | Sí | No | Obligatorio | Analítica (Sentry) |
| Identificadores de dispositivo u otros | ID de dispositivo u otros (token de notificaciones) | Sí | No | Opcional (solo si activa las notificaciones) | Funciones de la app |

No se recoge: contactos, calendario, historial de navegación, SMS, lista de apps, salud, ni ID de publicidad (Android: `AD_ID` bloqueado en `app.config.ts`).

## 3. Cómo coincide con Apple

| Apple (App Privacy) | Google (Data safety) |
|---|---|
| Email Address | Dirección de correo |
| Name | Nombre |
| Phone Number | Número de teléfono |
| Precise Location | Ubicación precisa (+ aproximada) |
| Photos or Videos | Fotos |
| Audio Data | Grabaciones de voz |
| Other User Content | Otros mensajes en la app + Otro contenido generado por usuarios |
| User ID | ID de usuario + ID de dispositivo (token de notificaciones) |
| Purchase History | Historial de compras |
| Payment Info | Información de pago |
| Crash Data / Performance Data | Registros de fallos / Diagnósticos |
| Other Data Types | Otra información (año de nacimiento) |

## 4. Otros formularios de la sección "Contenido de la app" (respuestas)

- **Acceso a la app:** restringido; instrucciones en `docs/app-review/notas-revisor-google.md`.
- **Anuncios:** no contiene anuncios.
- **Clasificación de contenido (IARC):** categoría "Red social / comunicación"; contenido generado por usuarios: sí; los usuarios pueden interactuar: sí; comparte ubicación con otros usuarios: **no**; compras de bienes físicos: sí; referencias a alcohol: sí (en los menús de los locales); sin violencia, sexo ni juego de azar. El resultado esperado es "Mayores de 17/18"; contesta con lo que muestre el cuestionario de hoy.
- **Público objetivo:** 18 años o más.
- **Aplicaciones de noticias, salud, gobierno, finanzas:** no.
- **ID de publicidad:** no se usa.
- **Permisos sensibles:** ubicación solo "mientras se usa" (sin segundo plano), y el texto del permiso es el de iOS/Android (`app.config.ts`).
- **URL de eliminación de cuenta:** `https://jchat.cloud/account` (comprueba que la página existe y explica el borrado).
