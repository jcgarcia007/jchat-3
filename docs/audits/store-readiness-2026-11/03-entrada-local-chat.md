# Bloque 3 — Entrada a un local y sala de chat (parcial)

Fecha: 2026-11-02 · main `9bd62175` (OTA vigente) · Evidencia: `screenshots/b03/` (sin commit).
Cuentas: **@test** (Android 35, emulador de siempre) y **@test1** (iPhone 17 Pro, iOS 26.5). La cuenta QA @test002 sigue fuera de sesión (hCaptcha; la retomará Juan). Local: Bar XZX (radio 200 m).

## Qué se probó
| Elemento | Android 35 (@test) | iOS 26.5 (@test1) |
|---|---|---|
| Hoja de entrada (juegos, selector de idioma) | OK, ES (verificado el arreglo de FASE 2) | OK, ES |
| Compuerta fuera del radio | OK: "No estás en Bar XZX / Estás a 35,9 km. Acércate para entrar al chat." + Reintentar, Ver menú y pedir para recoger, Ahora no | no repetido |
| Compuerta con permiso denegado | **Falla (B3-1)** | **Falla (B3-1)** |
| Mapa con permiso denegado | OK: aviso con "Abrir Ajustes" | OK (aviso naranja con "Abrir Ajustes") |
| Entrada con permiso concedido y dentro del radio | OK | OK |
| Salas (Main, VIP, Mesa 5, no se, Mesa 4) | OK (la VIP abre sin contraseña) | no repetido |
| Mensajes: texto, enlace, largo | Enviados y mostrados; los enlaces no son pulsables | visibles en la misma sala |
| Menú de usuario (Perfil, DM, Seguir, Silenciar, Reportar, Bloquear) | OK | no repetido |
| Reportar | OK: 9 motivos, "Seguridad de un menor" primero con aviso del 911, "Enviar reporte" / "Cancelar" (no se envió ningún reporte) | no repetido |
| Bloquear | OK: "¿Bloquear a Melisa Burgos? Dejarán de verse los mensajes." con Cancelar/Bloquear (no se confirmó) | no repetido |
| Panel "+" y menú "Más opciones" | OK: Juegos, Menú, Servicio · Mi perfil, Mi cuenta y pedidos, Pedir ayuda al local, Salir del local | no repetido |
| Salir del local + barra de volver | OK: confirmación, la barra desaparece y vuelve al mapa | no repetido |
| Tema oscuro | OK en la sala | claro OK |
| Letra máxima | no probado en chat | **Falla (B3-2)** |
| Envío sin red (modo avión) | **Falla (B3-3)** | no repetido |

## Hallazgos
| ID | Sev. | Pantalla / plataforma | Pasos | Esperado → Obtenido | Evidencia | Propuesta (sin implementar) |
|---|---|---|---|---|---|---|
| B3-1 | **P1** | Compuerta de entrada con permiso de ubicación denegado · Android e iOS | Denegar la ubicación (o revocarla), Cerca de mí → Entrar → Entrar al chat | Debe poder activarse → el título dice **"No estás en Bar XZX"** (falso: el problema es el permiso) y **"Permitir ubicación" no hace nada visible**: ni aviso del sistema ni Ajustes. iOS nunca vuelve a preguntar y Android tampoco tras la segunda negativa, así que la persona queda atascada fuera de todos los chats. El mapa sí ofrece "Abrir Ajustes" | `android35-04-gate-permiso-denegado.png`, `ios17pro-02-gate-permiso-denegado-sin-salida.png` | Título propio ("Necesitamos tu ubicación") y que el botón abra los Ajustes de la app cuando el sistema ya no pregunta (como hace el mapa); código: `ChatRoomScreen`/`useGeofenceGate`, que no usa `Linking.openSettings` |
| B3-2 (agrupado en DT-1, ver 07) | **P1** | Chat · iOS (letra máxima) | `content_size accessibility-extra-extra-extra-large`, abrir la sala | Texto accesible → la cabecera (nombre del local), las pestañas de salas, las burbujas, el nombre de quien escribe y el campo "Mensaje…" **aparecen recortados** (alturas fijas); no se puede leer ni escribir | `ios17pro-04-chat-AXXXL.png` (normal: `ios17pro-03-chat-normal.png`) | Limitar el escalado en esos controles y dejar crecer la altura de cabecera, pestañas y burbujas |
| B3-3 | P2 | Enviar mensaje sin red · Android | Modo avión, escribir y enviar | Debe conservar el borrador y ofrecer reintentar → muestra "Error — No se pudo enviar el mensaje.", **el texto desaparece del campo** y no queda burbuja con reintento | `android35-16-sin-red.png` | Mantener el texto, marcar la burbuja como fallida con "Reintentar", sin diálogo bloqueante |
| B3-4 | P3 | Confirmar "Salir del local" · Android | Más opciones → Salir del local | La hoja de entrada avisa de que Match se borra al salir → el diálogo solo dice "¿Salir de Bar XZX?" | `android35-14-salir-confirmacion.png` | Repetir en una línea qué se pierde al salir |
| B3-5 | P3 | Mensajes con enlaces · Android e iOS | Enviar `https://jchat.cloud/privacy` | Los enlaces suelen ser pulsables o, si no, avisar → se muestran como texto plano (puede ser intencionado por seguridad) | `android35-08-mensajes-enviados.png` | Decidirlo y dejarlo documentado |

## Verificado en producción (arreglos de FASE 2)
La hoja de entrada muestra el selector ES/EN arriba a la derecha de la fila del local, el interruptor de juegos y los puntos (Android e iOS), y la sala/mapa conservan la barra de volver.

## No probado y por qué
| Qué | Motivo |
|---|---|
| Dueño (Owner) y empleado en el chat: fijar mensajes, crear ofertas, moderación de personal | No hay sesión de dueña (`@jchatreview`) abierta en un dispositivo; las pruebas de dueño se harán en el Bloque 11 |
| Entrada por QR/enlace sin sesión (`/c/<token>`, `/t/<token>`) y página web del local | No se alcanzó en este pase |
| Sala con contraseña | Ninguna sala de Bar XZX la pide (la VIP abre sin contraseña) |
| Mensajes con emoji | `adb input text` no escribe emoji |
| Bloqueo/reporte confirmados | No se confirmaron para no afectar a personas reales |
| Chat en Android 36 y 26, iPhone 17e, letra grande en Android, TalkBack/VoiceOver | No se alcanzó |
| Teclado sobre el campo, rendimiento de listas largas, fotos en el chat | No se alcanzó |
| Privacidad de otros (G) | Solo se comprobó que la hoja de usuario y las burbujas muestran nombre, avatar y mensajes; no hay ubicación, correo ni datos de Match |

## Estado en que quedan los dispositivos y cuentas
@test sigue dentro de Bar XZX (la presencia caduca sola); sus mensajes de prueba (`QA3…`) están en la sala principal. Permisos de ubicación restaurados en ambos dispositivos; modo avión desactivado; letra de iOS restaurada.
