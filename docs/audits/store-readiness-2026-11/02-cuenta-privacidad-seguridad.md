# Bloque 2 — Cuenta, privacidad y seguridad (COMPLETO el 2026-11-03: borrado y recreación probados)

Fecha: 2026-11-02 · main `9bd62175` (OTA vigente) · Evidencia: `screenshots/b02/` (sin commit).
Estado: **PARCIAL**. El hallazgo B2-1 (P0) impide completar el borrado de cuenta, el nuevo registro de la cuenta QA y la comprobación de "no queda ningún dato".

## Cómo se probó
- **Android 36** (AVD Pixel_API36, sesión limpia) con la cuenta QA **@test002**, leída de `~/.jchat-qa.env` sin imprimirla. Inicio de sesión correcto la primera vez (sin captcha).
- **Android 35** (emulador de @test) para el bloqueo biométrico, con la huella de pruebas del emulador (revertido).
- **Web** (Chromium, 390 px) para las páginas legales públicas.
- No se tocó `@jchatreview` ni el correo/contraseña de ninguna cuenta; no se envió ningún formulario de registro.
- **Contraseñas/correos:** nunca se guardaron en informes ni capturas. **Incidente:** un volcado de la pantalla Ajustes de Android **imprimió una vez el correo de la cuenta QA en la salida de mi herramienta** (no en el repo). Borré la captura que lo mostraba y desde entonces mi herramienta oculta cualquier correo (`[email]`). Conviene saberlo.

## Datos creados con la cuenta QA antes del borrado
Biografía y ciudad, avatar (imagen neutra del repo), 1 publicación con foto, 1 mensaje en el chat de Bar XZX (`QA-borrado-prueba-1`, con presencia en el local), perfil de Match (Hombre/Mujeres, foto del avatar aprobada). **No** se creó un DM (la otra persona podía ser real).

Línea base en la base de datos (solo lectura, antes del borrado): filas con el id de la cuenta en `users`, `posts`, `messages`, `match_profiles`, `match_photos`, `match_presence`, `game_optins`, `room_geo_presence`, `notifications` (1 cada una) y 4 objetos en Storage (`avatars` 2, `match-photos` 1, `profile-media` 1).

## Hallazgos
| ID | Sev. | Pantalla / plataforma | Pasos | Esperado → Obtenido | Evidencia | Propuesta (sin implementar) |
|---|---|---|---|---|---|---|
| B2-1 | **P0** | Ajustes → Borrar cuenta · Android 36 (afecta a todas las plataformas: es el servidor) | Con @test002 (1 mensaje en un chat de local): Borrar cuenta → Continuar → "Delete my account" | La cuenta se borra → **"Deletion failed — We couldn't delete your account"**; la cuenta, el perfil y la publicación **siguen existiendo** (`auth.users`=1). Causa: `messages.user_id` es `NOT NULL` pero su clave foránea es `ON DELETE SET NULL`, así que Postgres no puede anonimizar el mensaje y aborta. Mismo patrón en `gifts.from_user`, `gifts.to_user`, `pinned_messages.pinned_by` y `disputes.opened_by`. Hoy 3 de 36 usuarios tienen mensajes en chats; cualquier persona que escriba en un chat **no podrá borrar su cuenta** | `android36-12-borrar-3-resultado.png`; consultas de catálogo (`pg_constraint`/`pg_attribute`) y `information_schema` (`messages.user_id` `is_nullable = NO`) | Migración que permita `NULL` en esas 5 columnas (o que la función borre/anonimice primero con `UPDATE … SET user_id = NULL` tras relajar la restricción) y probar con una cuenta que tenga mensajes; además, que la app muestre el motivo y el correo de soporte |
| B2-2 | **P1** | `https://jchat.cloud/account/delete` sin sesión · web | Abrir la URL sin sesión | Debe describir cómo borrar la cuenta y qué datos se eliminan (requisito de Google Play de una URL pública) → muestra "Checking your session…" y redirige al **login del panel de negocios** ("JChat Business dashboard — Sign in") sin ninguna explicación | `web390-01-account-delete-sin-sesion.png` | Mostrar contenido público (pasos, datos borrados/retenidos, plazos, contacto) y solo pedir sesión para el botón final |
| B2-3 | **P1** | Borrar cuenta de dueños (ya inventariado como C-2) | Revisión de código (`delete-account/index.ts`): si la cuenta es dueña de un local responde 409 `owns_business` | Apple 5.1.1(v) pide poder borrar dentro de la app → el dueño debe escribir a soporte. **No se ejecutó en producción** (solo la cuenta QA es borrable) | Código | Permitir transferir/cerrar el local desde la app o cascada con aviso explícito |
| B2-4 | **P1** | Política de privacidad `/privacy` · web | Búsqueda de texto en las páginas legales | La política debe declarar el envío de fotos a Google Cloud Vision y el uso de Sentry → `/privacy` **no los menciona**; `/terms` sí menciona Vision. Revisar con asesor legal | Script de texto sobre `/privacy`, `/terms`, `/safety`, `/contact`, `/support` | Añadir proveedores y finalidad (moderación de imágenes, diagnóstico de errores) y alinear con App Privacy / Data safety |
| B2-5 | P2 | Borrar cuenta · todas | Cualquier fallo del servidor | El usuario debe saber qué hacer → un solo mensaje genérico ("Please try again") que no sirve si el fallo es permanente (B2-1); no hay correo de contacto ni código de error | `android36-12-borrar-3-resultado.png` | Mostrar el motivo cuando sea conocido y un enlace a soporte tras el fallo |
| B2-6 | P2 | Login / Olvidé contraseña · Android | Pedir un código de restablecimiento y luego iniciar sesión | El acceso legítimo no debe bloquearse → tras enviar el código de restablecimiento, **hCaptcha** (arrastrar una forma) apareció en el restablecimiento y después **también en el inicio de sesión**; no lo resolví. Un usuario que no pueda resolverlo queda fuera | (captcha) | Revisar sensibilidad de hCaptcha, ofrecer alternativa accesible y no escalar el login tras un reset |
| B2-7 | P2 | Pantalla de bloqueo biométrico · Android | Activar el bloqueo, cerrar la app, reabrir | Debe poder recuperarse → el único camino alternativo a la huella es "Cerrar sesión" (no hay PIN del dispositivo como respaldo) | `android35-bio-05-lock-pantalla-app.png` | Permitir el PIN/patrón del dispositivo como respaldo |
| B2-8 | P3 | Pantalla de bloqueo · Android | Ver el texto | "Desbloquea con **Face ID o Touch ID**" en Android | idem | Texto neutro ("biometría / huella") por plataforma |
| B2-9 | P3 | Ajustes de privacidad · Android | Abrir Ajustes de privacidad | Un aviso informativo ("Tu ubicación en tiempo real nunca se comparte…") aparece con estilo de error (rojo) | `android36-06-privacidad.png` | Usar el estilo informativo |
| B2-10 | P3 | Páginas legales · web 390 px | Ver el pie | Los enlaces del pie se parten en dos líneas ("Delete account" queda cortado) | `web390-01-account-delete-sin-sesion.png` | Permitir que el pie envuelva en una cuadrícula |

## Resultado de lo que sí funciona
| Elemento | Resultado |
|---|---|
| Ajustes (Cuenta, Notificaciones, Juegos, Idioma, Apariencia, Radio, Privacidad y seguridad, Cerrar sesión, Borrar cuenta) | Presentes y con nombres accesibles; Face ID/huella desactivado con aviso cuando no hay huella registrada |
| Ajustes de privacidad | Completa (visibilidad, estado activo, modo desconectado, quién ve posts/historias, quién puede escribir, recibos de lectura, ubicación bloqueada "Always off — Locked") |
| Usuarios bloqueados | Estado vacío correcto ("You haven't blocked anyone.") |
| Cambiar contraseña | Validaciones correctas (vacío; no coinciden). **No se cambió la contraseña** |
| Cerrar sesión | Pide confirmación y vuelve a Welcome |
| Bloqueo biométrico | Activar, reabrir la app → pantalla de aviso del sistema y pantalla propia de bloqueo; huella correcta desbloquea y entra al mapa; "Cancelar" muestra "JChat está bloqueado" con Desbloquear y Cerrar sesión. Estado del emulador restaurado |
| Borrado de cuenta (interfaz) | Dos confirmaciones ("Delete account" → "Are you absolutely sure?") con aviso de que es inmediato y permanente; sin pedir contraseña |
| Páginas legales (`/privacy`, `/terms`, `/safety`, `/account/delete`, `/contact`, `/support`) | Todas 200, con el mismo conjunto de enlaces legales y correo de contacto; sin texto de relleno visible (la coincidencia "Placeholder" era código interno de Next) |
| **Verificación en producción de FASE 2** | Diálogo de foto de Match con el texto "USE MY PROFILE PHOTO" (arreglo B); la foto pasó a "Aprobada" y la pantalla a "Profile complete · 4 of 4 steps" sin reabrir (arreglos C y D) |

## No probado y por qué
| Qué | Motivo |
|---|---|
| Borrado completo, nuevo registro de la cuenta QA y comprobación de que no queda ningún dato | Bloqueado por **B2-1**: la cuenta sigue existiendo con todos sus datos |
| ConfirmAge (adulto/menor) y Onboarding (Bloque 1) | La cuenta QA se creó con edad y onboarding ya completos; esos flujos solo aparecen al registrar una cuenta nueva, y no se puede recrear la QA (B2-1) |
| Restablecer contraseña de punta a punta | hCaptcha (no se resuelve) y el correo del código no es legible para mí |
| Borrado de cuenta de un dueño (409) | Solo la cuenta QA es borrable |
| iOS (17e) y Android 26 en Ajustes / Privacidad; tema oscuro; ES; letra grande en estas pantallas; TalkBack/VoiceOver | No se alcanzó en este pase; la cuenta QA quedó fuera de sesión por el captcha |
| Pantalla "Mi perfil de Match" (visualización) y DM | Cubierto en la prueba previa de Match v2; el DM no se creó para no escribir a una persona real |

## Actualización 2026-11-03: borrado de @test002, comprobación en la BD y recreación
Dispositivo: el emulador `emulator-5554` es **Android 35** (no API 36) y la app instalada es un **build de desarrollo** (muestra «Loading from 127.0.0.1:8081»); el comportamiento de release puede diferir. Cuenta: @test002, id `f7dba5ce…`; tras recrearla, nuevo id `3ddf4a2e…`. Capturas: `screenshots/b02/delete-*`, `registro-*`, `onboarding-*`, `tod-*`.
| Paso | Resultado |
|---|---|
| 1. Borrar desde la app (Perfil → Ajustes → Eliminar cuenta) | **Funciona**: dos confirmaciones («Delete account» y «Are you absolutely sure?») y aviso «Account deleted»; al aceptar vuelve a Bienvenida. La función `delete-account` aún es la anterior (el merge de `fix/account-delete-fks` no está desplegado) y la migración 255 ya está aplicada |
| 2. Filas en la BD tras borrar | **0 filas** en `auth.users`, `users`, `posts`, `messages`, `match_profiles`, `match_photos`, `match_presence`, `game_optins`, `room_geo_presence` y `notifications` (antes: 1 en users, posts, match_profiles, match_photos, room_geo_presence y notifications; 0 en el resto) |
| 2b. Storage tras borrar | **Quedan 4 archivos de la cuenta borrada**: `avatars` 2, `match-photos` 1, `profile-media` 1 (igual que antes del borrado). Confirma C-3: con los 13 anteriores, **17 objetos huérfanos** |
| 3. Errores / registros de la función | Sin error en la app. Mis consultas de registros de la función no devolvieron filas, así que no hay código de error que reportar |
| 4. Recrear @test002 con el mismo correo | **Funciona**: el nombre de usuario `test002` quedó libre («Username is available!»); el registro de dos pasos pide hCaptcha al pulsar «Create my account» (lo resolvió Juan a mano) y la cuenta se crea con el correo ya confirmado. Cuenta nueva `3ddf4a2e…` |
| 5. Datos guardados | `birth_year` 1990 (solo el año), `age_confirmed_at` y `terms_accepted_at` rellenos (`terms_version` 2026-10), `onboarding_completed` verdadero, idioma `en` |
**Lo que esta prueba NO cubre:** @test002 no tenía mensajes, regalos ni reportes, así que **no se ejercitó el caso original de B2-1** (`messages.user_id` NOT NULL con FK `SET NULL`). Con la cuenta recreada se puede repetir: enviar un mensaje en un local y borrarla de nuevo (decisión de Juan).

### Hallazgos nuevos de esta pasada
| ID | Sev. | Pantalla / plataforma | Esperado → Obtenido | Evidencia | Propuesta (sin implementar) |
|---|---|---|---|---|---|
| B2-11 | P3 | Eliminar cuenta · Android | Debe mostrar progreso → tras la segunda confirmación la pantalla sigue igual, sin indicador, durante entre ~10 y ~60 s hasta que aparece «Account deleted» (capturas a ~6 s y ~10 s sin cambios) | `delete-02-ultima-oportunidad.png`, `delete-03-cuenta-eliminada.png` | Bloquear la pantalla con un indicador y desactivar los botones mientras dura la llamada |
| B2-12 | P2 | Hoja de entrada al local (18+) · Android | La hoja dice «Photos and text are reviewed before they are posted». Lo que existe es un **filtro de palabras** en chat, comentarios y DMs (no en publicaciones ni retos) y revisión de fotos por Vision **después** de subirlas, más reportes; no hay revisión previa de todo | `entrada-hoja-18plus.png` | Cambiar el texto a lo que ocurre de verdad («Filtramos contenido ofensivo y revisamos los reportes») o ampliar el filtro (C-4) antes de mantener la frase (Apple 2.3.1 exactitud, 1.2) |

## Segunda prueba (2026-11-03): borrado con mensaje de chat y prueba de edad
Misma plataforma: **Android 35 con un build de desarrollo** (no API 36, no release). Cuenta @test002 `3ddf4a2e…` → borrada → nueva `5bc06f38…`.
**Datos preparados:** mensaje «QA-B2-1 mensaje» enviado en Bar XZX (sala principal; 1 fila en `messages`). **DM a @test: no enviado**: @test no estaba conectada en ningún dispositivo, la app no tiene búsqueda de personas y el detalle de una publicación no abre el perfil del autor; se saltó tras más de 2 intentos, como se indicó. **Foto de Match: no subida** (exige crear todo el perfil de Match; no era fácil). Sin regalos ni reportes.
| Tabla / bucket | Antes del borrado | Después |
|---|---|---|
| `auth.users`, `users` | 1 / 1 | **0 / 0** |
| `messages` | 1 | **0** (el mensaje «QA-B2-1 mensaje» ya no existe en ninguna fila) |
| `dm_messages`, `posts`, `match_profiles`, `match_photos`, `notifications` | 0 | 0 |
| `match_presence`, `game_optins`, `room_geo_presence` | 1 cada una | **0** |
| Storage (objetos de la cuenta) | 0 | 0 |
**Resultado: B2-1 verificado con mensajes.** El borrado terminó sin error («Account deleted») y, con un mensaje escrito en un chat, ya no falla. `messages.user_id` es hoy `NOT NULL` con clave foránea **`ON DELETE CASCADE`** (consulta a la BD), así que **los mensajes de la persona se borran para todos** (no se anonimizan como decía el comentario de la función `delete-account`, que está desactualizado). Consecuencia de producto a decidir: la sala pierde ese historial. La función `delete-account` desplegada sigue siendo la anterior (sin merge de `fix/account-delete-fks`).
**Pendiente / no verificado:** el hilo de DM con @test (no se creó); la app de @test en iOS (el simulador estaba cerrado en el login). **Storage:** esta cuenta no tenía archivos, así que no aportó objetos nuevos: el total de huérfanos sigue en **17**.
**Tiempo del borrado:** unos **35 s** entre la segunda confirmación y el aviso, con capturas cada 5 s idénticas (sin indicador): refuerza B2-11.
| Prueba de edad | Resultado |
|---|---|
| Año 2012 (menor de 18) en el paso 2 | La app muestra al instante en rojo «You don't meet the requirements to use JChat.» bajo la fecha y, al pulsar «Create my account», el diálogo **«Not eligible»** (misma frase, que no menciona los 18 años). **No apareció hCaptcha y no se creó ninguna cuenta**: 0 filas en `auth.users` y `users` (también 0 altas en los 10 minutos anteriores) |
| Después del rechazo | «OK» devuelve al paso 1 con los datos conservados y se puede repetir con un año adulto de inmediato (no hay bloqueo del intento). Es un control por fecha declarada, no por verificación |
| Año 1990 (adulto) | Pide hCaptcha (lo resolvió Juan) y crea la cuenta: `birth_year` 1990, `age_confirmed_at` relleno, correo confirmado. El Onboarding de esta cuenta **no se completó** (queda en la primera pantalla) |

## Estado en que quedan las cuentas y los dispositivos
- **@test002** sigue **existiendo en producción con sus datos de prueba** (bio, avatar, 1 publicación, 1 mensaje de chat, perfil y foto de Match, presencia en Bar XZX hasta que expire). Si Juan aprueba el arreglo de B2-1, se podrá borrar y repetir la prueba completa.
- Emulador Android 36: cuenta QA **fuera de sesión** (captcha en el login). Emulador 5554 (@test): bloqueo biométrico desactivado, PIN de pruebas quitado.
- `~/.jchat-qa.env` no se modificó.

**Estado final (2026-11-03):** @test002 nueva (`3ddf4a2e…`) dentro de Bar XZX con los juegos activados y sin haber aceptado las reglas de Truth or Dare; el autocompletado de Google del emulador se desactivó para teclear y **se restauró**; los 17 archivos huérfanos de Storage siguen sin limpiar (los limpia Juan). Sin cambios en producción por mi parte salvo la creación de la cuenta y el borrado de @test002 que pidió Juan.

**Estado tras la segunda prueba:** @test002 es ahora `5bc06f38…` (sesión abierta en el emulador, Onboarding sin completar). @test sigue con su publicación QA8 intacta. Autocompletado del emulador restaurado. Sin cambios en producción por mi parte salvo los pedidos por Juan (crear/borrar @test002).
