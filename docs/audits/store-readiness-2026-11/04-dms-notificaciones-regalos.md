# Bloque 4 — DMs, notificaciones y regalos (parcial)

Fecha: 2026-11-02 · main `9bd62175` (OTA vigente) · Evidencia: `screenshots/b04/` (sin commit).
Cuentas: **@test** (Android 35, emulador de siempre) y **@test1** (iPhone 17 Pro, iOS 26.5): se escribieron entre sí, no se tocó a personas reales. La cuenta QA @test002 sigue fuera de sesión.

## Qué se probó
| Elemento | Resultado |
|---|---|
| Bandeja de Mensajes (conversaciones, contador "1 nuevo", acción Eliminar, notificaciones) | OK en Android e iOS |
| Entrega en tiempo real @test → @test1 (iOS) | **OK**: el punto rojo del icono de mensajes apareció y la bandeja mostró "Hola desde QA bloque 4 · 1 · ahora" |
| Marcado de leído | **OK**: el mensaje de @test quedó con `read_at` al abrirlo en iOS (≈ 27 s); el de @test1 se marcó leído 0,3 s después |
| Envío vacío | No hace nada (sin aviso, sin error) |
| Texto con acentos, ñ, signos | OK (el simulador de iOS corrompió los acentos al pegar: artefacto de la herramienta, no de la app) |
| Chat privado en iOS (foto, regalos "Pagado", campo que crece) | OK |
| Menú del chat privado | OK: "Reportar usuario" y "Bloquear a @test1", con "Cancelar" |
| Hoja de regalo | OK: selector de platos del local con precios (bienes físicos); **no se pagó** |
| Micrófono denegado | **OK**: "Se necesita acceso al micrófono… [Abrir Ajustes]" |
| Enlaces profundos con ID inexistente | **OK**: `jchat://post/<id>` → "No se pudo abrir la publicación"; `jchat://room/<id>` → "Sala no encontrada" |
| Tocar una notificación de la lista | OK: abre el chat correspondiente |
| Push real por FCM (Android, app en segundo plano) | **OK**: llegó en ≈ 9 s con título "test1" y el texto; `vis=PRIVATE` (contenido oculto con el móvil bloqueado). Al tocarlo abrió la conversación correcta |
| Tokens push registrados | Ambas cuentas tienen `ExponentPushToken[…]`; Android con `POST_NOTIFICATIONS` concedido |
| Foto en DM, moderación (1,27 s), foto vista por el receptor | OK (ver prueba previa de Match v2) |

## Hallazgos
| ID | Sev. | Pantalla / plataforma | Pasos | Esperado → Obtenido | Evidencia | Propuesta (sin implementar) |
|---|---|---|---|---|---|---|
| B4-1 | **P2** | Chat privado · Android | Activar y desactivar el modo avión con el chat abierto; después recibir un mensaje desde el otro teléfono | El tiempo real debe reconectar solo → el aviso **"Reconectando…" se quedó más de 8 min** con la red ya sana (el envío por HTTP funcionaba), y **no llegaron los mensajes en vivo**; el servidor sí los marcó leídos. Al salir y volver a entrar apareció el mensaje | `android35-04-dm-recibido-android.png` | Reintentar la suscripción (con espera creciente) al recuperar red o foco y refrescar la lista; reproducido una vez en emulador, **sin verificar en un móvil real** |
| B4-2 | P2 | Notificaciones de fotos de Match (ya inventariado como C-1) | Revisión de código (`hooks/useNotifications.ts:392`) | Tocar el push de `match_photo_approved` / `match_photo_rejected` debe abrir "Mi perfil de Match" → la lista blanca no incluye esos dos tipos y la app abre sin navegar (dentro de la lista de notificaciones sí funciona). **No verificado en ejecución**: el aviso simulado de iOS desaparece antes de poder tocarlo | Código | Añadir los dos tipos a `VALID_NOTIFICATION_TYPES` |
| B4-3 | P3 | Enviar un mensaje vacío · todas | Pulsar enviar sin texto | Opcional avisar → no ocurre nada visible | — | Mantener el botón desactivado visualmente hasta que haya texto |

## Notas que no son hallazgos
- Todas las cuentas de prueba se llaman "Test" (nombre visible), así que en la bandeja y en los chats no se distinguen; es un dato de prueba.
- Los DMs entre @test y @test1 dejados por la prueba: "Hola desde QA bloque 4", "Respuesta desde iOS …" y "Prunes push QA" (texto alterado por la herramienta).

## No probado y por qué
| Qué | Motivo |
|---|---|
| Eliminar una conversación | Se abrió el chat en lugar del diálogo; no se repitió para no borrar datos por error |
| Quién puede escribirme (privacidad) aplicado a un tercero; bloqueo dentro de un DM confirmado | Hace falta una tercera cuenta que no sea real |
| Foto por cámara y nota de voz grabada y enviada; fotos pendientes ("En revisión" / "Revisando foto…") | La moderación tarda ≈ 1,3 s; la grabación necesita micrófono virtual |
| Regalo completo (pago con tarjeta, aceptar/rechazar con cobro) | Implica un pago real en Stripe |
| Push en iOS (APNs) | El simulador no recibe push reales; el simulado con `simctl push` no se pudo tocar a tiempo |
| Letra grande y tema oscuro en DMs; TalkBack/VoiceOver; Android 36 y 26; iPhone 17e | No se alcanzó (el chat de local ya falla con la letra máxima, B3-2) |
| Notificaciones de pedidos, seguidores, me gusta, comentarios | Requieren otras acciones y cuentas |
