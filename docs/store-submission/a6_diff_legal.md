# a6 — diff de textos legales para la revisión legal de Juan (2026-11-07)

Rama `fix/a6-web-legal-2026-11` (main `ee627ad5` + 5 commits de `fix/a6-web-legal` + resolución de conflictos + H10). "Antes" = lo que dice `main` hoy. Cada cambio existe en **es y en** con el mismo sentido. Los puntos marcados ⚠ son decisiones de contenido que no están revisadas por un abogado (hay un comentario `DRAFT FOR LEGAL REVIEW` en el código, no en la página).

## /privacy (`web/content/legal/privacy.{en,es}.tsx`)
| § | Antes | Después (EN; el ES dice lo mismo) |
|---|---|---|
| Fecha | Last updated: November 6, 2026 | **November 7, 2026** (es: 7 de noviembre de 2026) |
| 2 Información que recogemos — cuenta | "name, username, profile photo, bio, language and app settings" | + "and the **year of birth** you give us to confirm you are 18 or older (we keep only the year)" |
| 2 — Match | (no existía) | **Nuevo punto:** "Match profile (optional): your gender (woman, man or non-binary), who you want to meet (women, men or everyone), your interests and your photos. This is sensitive information: it is used only to show you people who fit and to show you to them. Your likes, matches and Match chats are erased when you leave the venue (except with people who follow each other)." ⚠ (la parte "se borran al salir del local, salvo seguidos mutuos" viene de a6/T2; verifícala con el comportamiento real de `match_leave_venue`) |
| 2 — diagnóstico | "push-notification token, crash and error logs." | + "(attached to your account ID only, never to your name, email or IP address)" |
| 4 Con quién compartimos | Párrafo corrido con 6 proveedores | **Lista**: Supabase (EE. UU.), Stripe (sin ver la tarjeta), **Google Cloud Vision** (los bytes de las fotos de Match y DMs), Google Maps + FCM / Apple, **Expo** (el título y texto de la notificación pasan por su servicio push; builds y actualizaciones), **Sentry** (solo id de cuenta, sin nombre/correo/IP), hCaptcha (también al recuperar contraseña), **Have I Been Pwned (nuevo, H10)**, **Resend**, Vercel ⚠ |
| 4 — **H10 (nuevo)** | (no existía) | "**Have I Been Pwned** — when you create an account we check whether your password has appeared in a known data breach. Only the first 5 characters of the password's SHA-1 hash are sent (k-anonymity), together with your IP address as in any web request, and only when you sign up. Your password and the rest of the hash never leave your device." ES: "…Solo se envían los 5 primeros caracteres del hash SHA-1 de la contraseña (k-anonimato), junto con tu dirección IP como en cualquier petición web, y solo al registrarte. Tu contraseña y el resto del hash nunca salen de tu dispositivo." (Evidencia: `mobile/services/pwned.ts`, `web/lib/pwned.ts`; se llama solo en el registro.) |
| 4 — IA de menús | "(Anthropic / Claude)" | sin cambio. ⚠ **PREGUNTA PARA JUAN (H8):** el código también usa OpenAI y Google Generative Language (`menu-assistant/index.ts:789,794`); no lo añadí porque no estaba en el alcance |
| 6 Conservación | "Order and payment records are kept… (generally up to 7 years). Guest ordering identifiers are kept for a limited period… When you delete your account we permanently delete your profile, content and personal data, except records we are legally required to keep." | Lista: borrado **inmediato** de perfil, fotos, mensajes, perfil de Match y publicaciones; se conservan **pedidos y pagos 7 años sin datos personales; registros de seguridad 90 días; reportes de moderación 1 año; regalos sin tu identidad**; identificadores de invitados un tiempo limitado ⚠ (plazos 90 días y 1 año = decisión de Juan, no verificados en el código) |
| 7 Eliminar tu cuenta | contacto `jgarcia@otunitylabs.com` (2 veces) | contacto **`soporte@jchat.cloud`**; el párrafo de **dueños de locales (D4/F2) se conserva tal cual** |

## /account/delete (`page.tsx` + `DeleteAccountClient.tsx` + `web/messages/{en,es}.json › accountDelete`)
| Elemento | Antes | Después |
|---|---|---|
| Acceso sin sesión | redirigía a `/auth/login` (H2) | **Página pública:** explicación renderizada en el servidor + botón "Sign in to delete my account" que vuelve a la misma página; sin redirección |
| Explicación | texto breve dentro del formulario | Secciones: "How to delete your account" (app, web, correo), "What is deleted right away" (perfil; mensajes y comentarios; Match; publicaciones, historias, seguidos, bloqueos, reseñas, notificaciones, ajustes), "What is kept and for how long" (pedidos y pagos 7 años sin datos personales; seguridad 90 días; reportes 1 año; regalos sin identidad), "Deletion is immediate and cannot be undone." |
| Dueños (`ownerNote`) | a6: "eliminar tu cuenta eliminaría también tu negocio, primero debes cerrarlo o transferirlo…" (obsoleto desde D4) | **"If you own a venue: deleting your account closes it (it does not reopen) and your subscription is cancelled. Orders and payments are kept for 7 years without your personal data. If Stripe still holds a balance for you, it must reach your bank first. You will see exactly what happens before you confirm."** (es: equivalente). El flujo de dueños de D4 (casilla, ELIMINAR/DELETE, bloqueos por saldo o pedidos) se conserva |
| Contacto | `safety@jchat.cloud` (D4) / `jgarcia@…` | **`soporte@jchat.cloud`** + enlace a /contact |
| Metadatos | — | `meta.legal.accountDelete` = título "Delete your account — JChat" y descripción (ver nota de corrección abajo) |

## /support, /terms, /contact, /safety
| Página | Antes | Después |
|---|---|---|
| /support (§ contacto) | `jgarcia@otunitylabs.com`; fecha Sep 21, 2026 | `soporte@jchat.cloud`; fecha **November 7, 2026**. La frase de dueños de D4 ("Business owners: deleting your account closes your venue (it does not reopen)…") **se conserva** |
| /terms (contacto) | `jgarcia@otunitylabs.com`; fecha Sep 21, 2026 | `soporte@jchat.cloud`; fecha **November 7, 2026**. ⚠ Solo cambian contacto y fecha (los términos no se revisaron más) |
| /contact | `jgarcia@otunitylabs.com`; Oct 8, 2026 | `soporte@jchat.cloud` (general; `safety@` solo seguridad); fecha **November 7, 2026** |
| /safety | Oct 8, 2026 | ancla `#csae` en "Child safety (CSAE)"; fecha **November 7, 2026** |

## Corrección encontrada al fusionar (no es texto legal nuevo)
Los textos de dueños de D4 de `web/messages/*.json` (ownerCheckbox, ownerButton, ownerBalance, ownerOpen, ownerError, ownerDeleteButtonBusy y los textos nuevos de ownerTitle/ownerBody/ownerBodyNoName/ownerHelp) estaban **dentro de `meta.legal.accountDelete`** en lugar de `accountDelete` (error mío en D4: se editó el primer objeto con ese nombre). Resultado en `main`: la pantalla de dueños mostraría las claves sin traducir y la descripción meta de la página se perdía. En esta rama quedan en `accountDelete` y `meta.legal.accountDelete` vuelve a `{title, description}`. Además, `safety@jchat.cloud` → `soporte@jchat.cloud` en `error` y `ownerError` (contacto general).

---

# D6 — filas añadidas (2026-11-07, rama `fix/d6-retention`)
Retención con borrado automático (`retention_purge`, migración 267), evidencia de reportes y huella del correo de las cuentas suspendidas. Lo que se dice aquí es lo que hace el cron; los plazos son los de la spec aprobada por Juan. ⚠ = sin revisión de abogado.

## /privacy §6 "Data retention" / "Conservación" (`privacy.{en,es}.tsx`)
| Elemento | Antes (a6) | Después (EN; el ES dice lo mismo) |
|---|---|---|
| Registros de seguridad | "Security logs: 90 days." | "Security logs: 90 days. **The record of moderation actions and account suspensions: 1 year.**" |
| Reportes | "Moderation reports: 1 year." | "**Closed reports** (with the evidence attached to them): **1 year after they are resolved**. Reports about **child safety, or sent to the authorities (NCMEC): 2 years** after they are resolved. **Open reports are kept until they are resolved.**" ⚠ (2 años = conservación voluntaria por encima del mínimo legal de 1 año, decisión de Juan) |
| Moderación y reservas | (no existía) | "**Moderation records** of venue chats and games, and **table reservation records**: 1 year." |
| Escaneo de fotos y correos | (no existía) | "**Photo-scan records** and **e-mail delivery records**: 90 days (30 days for e-mails that were delivered)." |
| Pedidos, pagos, regalos, invitados | sin cambio | sin cambio |
| Párrafo nuevo | (no existía) | "When you delete your account, the reports you made or received stay **without your identity** until their term above ends. If your account was suspended for a confirmed violation, we keep an **encrypted fingerprint of your e-mail address (not the address itself) for up to 2 years** to prevent new accounts from being opened. To appeal, write to soporte@jchat.cloud." ES: "Cuando eliminas tu cuenta, los reportes que hiciste o recibiste se conservan sin tu identidad hasta que termine su plazo de arriba. Si tu cuenta estaba suspendida por una infracción confirmada, guardamos una huella cifrada de tu correo (no el correo) hasta 2 años para impedir que se abran cuentas nuevas. Para apelar, escribe a soporte@jchat.cloud." ⚠ |

## /account/delete — "What is kept and for how long" (`web/messages/{en,es}.json › accountDelete.keep3/keep5/keep6`, `page.tsx`)
| Línea | Antes | Después |
|---|---|---|
| keep3 | "Moderation reports: 1 year." | "Moderation reports: 1 year after they are resolved (2 years for child safety)." / "Reportes de moderación: 1 año desde que se resuelven (2 años los de seguridad infantil)." |
| keep5 (nueva) | — | "Reports you made or received stay without your identity until their term ends." / "Los reportes que hiciste o recibiste se conservan sin tu identidad hasta que termine su plazo." |
| keep6 (nueva) | — | "If your account was suspended for a confirmed violation, we keep an encrypted fingerprint of your e-mail for up to 2 years to prevent new accounts. To appeal, write to soporte@jchat.cloud." / "Si tu cuenta estaba suspendida por una infracción confirmada, guardamos una huella cifrada de tu correo hasta 2 años para impedir cuentas nuevas. Para apelar, escribe a soporte@jchat.cloud." |

## Textos de la app y del panel (no legales, para completar el inventario)
| Dónde | Texto (EN / ES) |
|---|---|
| Registro (móvil `register.alerts.signupBlocked`, web `authErrors.signupBlocked`) | "We couldn't create an account with this e-mail. If you think this is a mistake, write to soporte@jchat.cloud." / "No pudimos crear una cuenta con este correo. Si crees que es un error, escribe a soporte@jchat.cloud." (no revela el bloqueo) |
| Super-admin › Reportes | "Deleted account" / "Cuenta eliminada" cuando el reportante o el reportado borró su cuenta; sección "Remove an e-mail block" / "Quitar bloqueo de correo" |

Fecha de "Last updated" de /privacy y de las páginas tocadas: 7 de noviembre de 2026 (hoy, ya puesta en a6).
