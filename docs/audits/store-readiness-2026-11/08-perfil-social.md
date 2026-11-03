# Bloque 8 — Perfil y social (parcial) + pendientes del Bloque 7

Fecha: 2026-11-02 · main `9bd62175` (OTA vigente) · Evidencia: `screenshots/b08/` (sin commit).
Cuentas: **@test** (Android 35) y **@test1** (iPhone 17 Pro). Correos de las cuentas de prueba no se reproducen. No se enviaron reportes, no se confirmaron bloqueos, no se hicieron reservas ni pagos (BD: 0 reservas nuevas).

## Pendientes del Bloque 7 (cerrados aquí)
| Elemento | Resultado |
|---|---|
| Vista previa del local (marcador de Bar XZX) | OK: "Cerrado · abre mañana a las 9:00 am", logo, tipo, distancia, **Entrar al chat · Cómo llegar · Menú · Ofertas · Reservar**, dirección, descripción, "1 activo", horario, compartir y cerrar (`android35-01`) |
| Reserva (formulario) | OK la pantalla: fecha (AAAA-MM-DD), hora (HH:MM), tamaño del grupo ±, solicitudes especiales, Cancelar / Solicitar reserva y aviso "será revisada por el local" (`android35-02`). **No se envió**; la validación (fecha/hora inválida y fecha pasada: `ReservationScreen.tsx:284-293`) se verificó en el código, no en el dispositivo |
| Ofertas y su radio | OK: feed de novedades de negocios con Me gusta / Comentarios / Ver local; el radio ofrece 5, 10, 25, 50 y 100 mi; con 5 mi y 50 mi el feed se actualiza y el título muestra "actualmente N mi"; restaurado a 50 mi (`android35-04…06`) |
| Recorrido en inglés (Android) | OK: Perfil, Mapa, Cerca de mí, Ofertas, Mensajes y vista previa del local sin **español residual ni claves sin traducir** (comprobado por volcado de accesibilidad de cada pantalla); el cambio de idioma de Ajustes se aplica al instante. Idioma restaurado a Español en Ajustes y en el perfil (BD: `language = es`) |

## Qué se probó del bloque
| Elemento | Resultado |
|---|---|
| Perfil propio (Android e iOS) | OK: foto, nombre, @usuario, "+ Agregar una bio", Editar perfil, Publicar, cuadrícula de publicaciones, compartir y ajustes (`android35-07`, `ios17pro-01`) |
| Editar perfil | OK: foto, red (Seguidores 1 / Siguiendo 0 / Solicitudes 0), nombre visible, usuario, biografía, ciudad ("solo texto manual"), idioma, tema del perfil (`android35-08`) |
| Nueva publicación | OK: galería / cámara, descripción 0/2200, lugar manual opcional; **se puede publicar solo texto** y aparece en el perfil |
| Detalle de publicación | OK: autor, fecha y hora, me gusta, contador de comentarios; **comentar** funciona (contador 1); menú propio: Eliminar / Cancelar (no se eliminó) |
| Amigos (Seguidores / Siguiendo / Solicitudes) | OK: lista con "Quitar" (`android35-20`) |
| Perfil ajeno | OK: foto, nombre, @usuario, **Seguir**, **Mensaje**, publicaciones; sin ubicación, correo ni sexo/interés; menú: Compartir perfil, Ver seguidores, Ver siguiendo, **Reportar**, **Bloquear** (`android35-21`, `-22`) |

## Hallazgos
| ID | Sev. | Pantalla / plataforma | Pasos | Esperado → Obtenido | Evidencia | Propuesta (sin implementar) |
|---|---|---|---|---|---|---|
| B8-1 | **P2** | Editar perfil y Ajustes · Android | Editar perfil → IDIOMA → English → Guardar | Un solo "Idioma" → hay **dos selectores distintos**: el del perfil guarda `users.language = en` pero **la app sigue en español**; la UI cambia solo con Ajustes → Idioma (al instante). La persona cree haber cambiado el idioma y no pasa nada visible | `android35-09`, `-10`, `-11` | **Un solo control de idioma**: o el de Editar perfil también aplica el idioma de la app (`changeAppLanguage`, como ya hace el registro en `AuthContext.tsx:228`), o se quita del perfil. Ver "Para qué sirve `users.language`" abajo |
| B8-2 | **P2** | Reservar · Android | Abrir "Reservar una mesa" | Selector de fecha/hora accesible → fecha y hora se escriben como texto (`AAAA-MM-DD`, `HH:MM`), sin calendario ni reloj; fácil equivocarse y depende de la validación | `android35-02` | **Selector nativo de fecha y hora, sin texto libre** (ni siquiera como alternativa) |
| B8-3 | P3 | Ofertas · Android | Ver el feed | Distancia coherente → "a 1 mi" para un local a 0 ft/10 m (se redondea hacia arriba) | `android35-04` | Mostrar **"Aquí"** (o "< 0,1 mi") cuando la distancia sea menor que el umbral |
| B8-4 | cerrado (dato de prueba, no es defecto de la app) | Perfil · iOS | Ver la cuadrícula de @test1 | Miniatura derecha → la tercera foto se ve girada 90° | `ios17pro-01` | Ninguna. Explicado en "B8-4: orientación EXIF" abajo |

## Para qué sirve `users.language` (solo lectura)
- **Servidor, push:** `supabase/functions/send-push/index.ts:479-493` lee `users.language` del destinatario (`"en"` → inglés, cualquier otro valor → español) para redactar el texto del push (DM, regalos, Match, etc.).
- **Cliente, idioma de la app:** `mobile/context/AuthContext.tsx:188-250` aplica `users.language` como idioma de la app al iniciar sesión o restaurar la sesión (gana a la configuración del dispositivo); un idioma elegido antes del login se guarda en la cuenta una vez (`services/languageChoice.ts`).
- **Otros usos:** `menu-assistant` usa un parámetro `language` propio, no esta columna; **no hay correos ni plantillas que lo lean** (búsqueda en `supabase/functions` y en el baseline SQL). Conclusión: afecta al idioma del push y al idioma de la app al abrir sesión; no se usa para nada más hoy.

## B8-4: orientación EXIF (solo lectura)
La app **sí corrige la orientación** antes de cualquier subida: `mobile/utils/normalizeImage.ts` (`normalizeImageUri`, librería **`expo-image-manipulator`**, `ImageManipulator.manipulate(uri).renderAsync()` aplica el giro EXIF, lado máximo 2000 px, JPEG q 0,85). Lo invoca `utils/safePicker.ts:41` (todo selector de galería/cámara: **posts, perfil/portada, historias, Match, DM y chat**), además de `components/chat/AttachmentPanel.tsx`, `ChatInput.tsx` y `screens/dms/DMChatScreen.tsx`. El avatar y Match recortan con la misma librería (`services/avatar.ts:9`, `services/matchProfile.ts:12`, `utils/squareCrop.ts`). Se introdujo en el commit `05e7b9dc` (2026-10-06).
Sobre la miniatura girada: es la primera imagen del post `e8e47e07…` de @test1 (2026-10-07). Descargué el archivo (solo lectura): **621×1104 px, sin etiqueta de orientación y con el contenido ya de lado** (la escena está girada en los propios píxeles). Es decir, el original se guardó girado (p. ej. una captura/exportación sin EXIF), no un fallo de la app. Queda cerrado como dato de prueba.

Nota de producto (no hallazgo): se puede publicar una publicación de solo texto, sin foto, y el reporte/bloqueo está en el perfil ajeno; la moderación de imágenes aplica a las fotos.

## No probado y por qué
| Qué | Motivo |
|---|---|
| Reportar y bloquear de verdad desde un perfil o publicación ajena; reportar un comentario | No se enviaron reportes ni se confirmaron bloqueos |
| Seguir / solicitudes de seguimiento, perfiles privados, historias | "Seguir" crea una relación real entre cuentas de prueba; las historias no se alcanzaron |
| Eliminar la publicación propia y comentarios de otras personas | Se dejó la publicación de prueba; no se borran datos |
| Subir foto de galería/cámara, editar y guardar biografía/ciudad | Requieren archivo/cámara del emulador; no se cambió información de la cuenta aparte del idioma (restaurado) |
| Tema oscuro, letra grande (DT-1), TalkBack/VoiceOver real, Android 36 y 26, iPhone 17e | No se alcanzó |

## Estado en que quedan las cuentas
@test conserva una publicación (`QA8 publicacion de prueba`) con un comentario (`Comentario QA8`); idioma `es`, radio de novedades 50 mi, fuente 1,0×, tema claro. @test1 sin cambios.
