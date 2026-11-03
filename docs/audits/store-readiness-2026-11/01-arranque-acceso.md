# Bloque 1 — Arranque, acceso y 18+ (parcial)

Fecha: 2026-11-02 · main `9bd62175` + OTA del mismo commit · Evidencia: `screenshots/b01/` (31 capturas, sin commit).
Estado: **PARCIAL** (actualizado tras instalar más dispositivos). Se probó todo lo que se puede hacer sin credenciales ni crear cuentas; el resto se lista en "No probado".

## Dispositivos usados
| Plataforma | Dispositivo | Notas |
|---|---|---|
| Android 36 | AVD **Pixel_API36** (Google Play, arm64), sesión limpia | Instalado en esta sesión con `sdkmanager` (herramientas de línea de comandos de Google, `dl.google.com`, SHA-256 `7bc5c72b…7e64` coincide con el publicado) |
| Android 35 | AVD **Pixel_8_clean**, sesión limpia | Clon de Pixel_8 con `-wipe-data` |
| Android 26 (mínimo soportado, `minSdk 26`) | AVD **Pixel_API26** (Google APIs, arm64), sesión limpia, barra de navegación de 3 botones | Instalado en esta sesión |
| iOS | **iPhone 17e**, iOS 26.5, sesión limpia (app copiada desde el simulador de @test) | **iOS anterior no disponible**: Xcode 27.1 responde "iOS 18.6 / 18.2 / 18.0 / 17.5 is not available for download". **iPhone SE no existe**: Xcode 27 ya no trae ese tipo de dispositivo; el más pequeño es el 16e/17e (6,1") |
| Web | Chromium (Playwright) a 375×812 y 430×932; **Safari iOS** real en el simulador (carga correcta de Welcome) contra `bar-xzx-omd2.jchat.cloud` | Chrome Android real no probado (el emulador trae Chrome pero no se abrió la web allí) |

La app instalada en los emuladores es la compilación de desarrollo local (APK de depuración) con el JS actual servido por Metro; los binarios nativos de las tiendas (EAS) no se pueden probar sin `eas build`.

Para no perder las sesiones de @test y @test1 (no tengo sus contraseñas), todo lo "sin sesión" se hizo en los dispositivos limpios. Esos dos dispositivos siguen en producción solo como lectura: no se creó ninguna cuenta ni se envió ningún formulario de registro; los únicos intentos contra el servidor fueron un inicio de sesión vacío, uno con correo mal formado y un envío de código con correo mal formado (los dos últimos pararon en hCaptcha, que no se resolvió).

## Resultado por pantalla
| Pantalla | Android 35 | iOS 17e | Web 375/430 | Veredicto |
|---|---|---|---|---|
| Welcome | OK en API 26, 35 y 36 (EN/ES) | OK; Safari iOS carga bien | OK, sin desbordes ni objetivos pequeños | OK (ver B1-8) |
| Login (Apple/Google/correo) | OK a 1,0× y 1,5×; degradado a 2,0×; en **API 26 con 3 botones el enlace "Create account" nace tapado por la barra (B1-11)** | **Falla con letra máxima (B1-1)** | OK; objetivo pequeño (B1-3), `lang` fijo (B1-4) | Con hallazgos |
| LoginEmail | Vacío → diálogo "Missing fields" (igual en API 26, 35, 36); correo inválido → hCaptcha (B1-5) | — | — | Con hallazgos |
| ForgotPassword | Vacío → "Please enter a valid email address." (API 26, 35, 36); correo inválido → hCaptcha, una vez no cargó el verificador (B1-5) | — | — | Con hallazgos |
| RegisterStep1 | (API 35 y 36) `Continue` desactivado hasta ser válido; lista de reglas de contraseña en vivo y con estado leído ("met"/"pending") | — | — | OK |
| RegisterStep2 | Se llegó a verla (fecha de nacimiento, idioma, usuario, términos, "Create my account"); **no se envió** | — | — | Sin probar el envío |
| Onboarding | Android 35 (build de desarrollo) | OK (4 pantallas, «Skip», «Next», «Explore the map»; ver B1-13) | — | Probado el 2026-11-03 con la cuenta recreada |
| ConfirmAge | — | **No apareció** tras registrarse con correo: la fecha de nacimiento (año 1990) se pide en el paso 2 del registro y `age_confirmed_at` quedó rellena; la pantalla probablemente es para inicios con Apple/Google. Menor de edad: **no probado** (haría falta otra cuenta) | — | `02-…` actualización |
| Splash, ResetPassword, Lock, EntryVenueCard | — | — | — | Reset: ver B1-12 en `RESUMEN.md`; Lock y Splash no probados |

## Hallazgos
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

## No probado (y por qué)
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

## Para el siguiente paso
1. Para ConfirmAge, Lock, Reset y Onboarding necesito o bien una cuenta de prueba nueva creada por Juan (con su contraseña solo en una variable de entorno, nunca en el repo) o permiso para cerrar sesión en @test1 sabiendo que no podré volver a entrar sin su contraseña.

## Actualización (2026-11-02, con la cuenta QA @test002 y el emulador con huella)
| Pendiente del Bloque 1 | Resultado |
|---|---|
| Inicio de sesión con la cuenta QA (Android 36) | OK la primera vez, sin captcha ni pantalla de edad (la cuenta ya tenía edad y onboarding completos). Tras un restablecimiento de contraseña, el siguiente inicio de sesión mostró **hCaptcha** y no pudo continuar (ver B2-6) |
| Lock biométrico | **OK** (Android 35, huella del emulador): activar, reabrir, desbloquear con la huella correcta, "Cancelar" → pantalla "JChat está bloqueado" con Desbloquear y Cerrar sesión. Hallazgos menores B2-7 y B2-8 |
| ConfirmAge (menor de edad) | **No probado**: haría falta crear otra cuenta con fecha de nacimiento menor de 18; el caso adulto se resolvió en el registro (ver arriba) |
| Restablecer contraseña | **No probado** más allá de la solicitud: hCaptcha pide resolver un desafío (no se resuelve) y el código llega a un correo que no puedo leer |
| Onboarding (otros idiomas, saltar) | Solo se recorrió en inglés pulsando «Next»; «Skip» y español no probados |
| Android 36 / 26 / 35, iOS 17e, web 375/430/390 | Hecho; ver arriba y `02-cuenta-privacidad-seguridad.md` |

## Actualización 2026-11-03 (cuenta recreada)
| ID | Sev. | Pantalla | Esperado → Obtenido | Propuesta |
|---|---|---|---|---|
| B1-13 | P3 | Onboarding, última pantalla · Android | El icono del cohete debe verse limpio → tiene un **rectángulo oscuro** detrás del icono, dentro del recuadro redondeado (`screenshots/b02/onboarding-04.png`) | Revisar el fondo del icono (posible capa sin transparencia) |
| — | — | Registro paso 2 | Hay hCaptcha al crear la cuenta (lo resuelve una persona); el nombre de usuario se comprueba en vivo («Username is available!») | Ver B11-2 para las notas de revisión |
