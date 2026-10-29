# App Privacy (App Store Connect) — datos que recoge JChat

Misma tabla que `COLLECTED_DATA_TYPES` en `mobile/app.config.ts` (el privacy manifest de la app). Un test (`mobile/scripts/privacy-manifest.test.mjs`) las mantiene iguales. Copiar tal cual en App Store Connect → App Privacy → "Yes, we collect data".

**Seguimiento (tracking): ninguno.** La app no usa publicidad, ni ID de publicidad, ni comparte datos con corredores de datos. En todas las filas: vinculado al usuario = **Sí**, tracking = **No**.

| Tipo de dato (App Store Connect) | Categoría | Vinculado al usuario | Tracking | Finalidades |
|---|---|---|---|---|
| Email Address | Contact Info | Sí | No | App Functionality |
| Name | Contact Info | Sí | No | App Functionality |
| Phone Number | Contact Info | Sí | No | App Functionality (opcional, pedidos de invitado) |
| Precise Location | Location | Sí | No | App Functionality (comprobar presencia en el local; no se guardan las coordenadas) |
| Photos or Videos | User Content | Sí | No | App Functionality (perfil, posts, stories, DMs, Match, selfies de verificación) |
| Audio Data | User Content | Sí | No | App Functionality (mensajes de voz) |
| Other User Content | User Content | Sí | No | App Functionality (mensajes, publicaciones, comentarios, reseñas) |
| User ID | Identifiers | Sí | No | App Functionality (id de cuenta, token de notificaciones) |
| Purchase History | Purchases | Sí | No | App Functionality (pedidos, regalos) |
| Payment Info | Financial Info | Sí | No | App Functionality (datos de tarjeta, los recoge Stripe) |
| Crash Data | Diagnostics | Sí | No | Analytics (Sentry) |
| Performance Data | Diagnostics | Sí | No | Analytics (Sentry) |
| Other Data Types | Other Data | Sí | No | App Functionality (año de nacimiento para confirmar la edad) |

Notas:
- Payment Info en vez de Other Financial Info: el número de tarjeta se teclea en los campos de Stripe; la app no lo guarda en sus servidores.
- Google Play (Data safety) debe decir lo mismo: ubicación precisa, fotos, audio, mensajes, correo, nombre, teléfono opcional, ID de usuario, compras, información de pago (Stripe), fallos y rendimiento (Sentry), año de nacimiento.
