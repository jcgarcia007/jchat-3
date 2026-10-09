# Inventario: chat del local en la app vs la web (solo investigación, NO implementado)

Fecha: 2026-10-08 · Rama `fix/web-chat-parity` · Archivos comparados: app `mobile/screens/chat/ChatRoomScreen.tsx` y la web
`web/app/c/[token]/room/ChatRoom.tsx`.

**Cómo se hizo y qué no está verificado:** inventario por lectura/grep del código. No se abrieron los cuerpos de los componentes de la app ni
se confirmó qué RPC usa la app para silenciar/expulsar; no se ejecutó nada. Los esfuerzos son **estimaciones** (S = 0,5 día · M = 1–2 días ·
L = 3–5 días · XL = más de 5 días). Los puntos marcados "(sin confirmar)" dependen de algo que no se comprobó.

## La web ya tiene (paridad)
- Pestañas de salas secundarias, incluidas salas con contraseña (`can_access_room`, `verify_room_password`).
- Barra de presencia "en línea" (sala ancla del QR, sala visitada, insignias de rol, enmascarado de incógnitos).
- Mensajes en tiempo real con paginación (50), envío de texto y de fotos (límite 10 MB), insignias Dueño/Staff y temas.
- Reportar y bloquear desde el menú ⋯ del mensaje (`ReportDialog`, `block_user`) y ocultar mensajes moderados en tiempo real.
- Botón de menú (a `/m/slug` o URL externa), llamar al mesero (`service_calls`, enfriamiento de 5 min, `WaiterSheet`).
- Reverificación de ubicación cada 5 min con `join_room_via_qr` (aviso "fuera del local").
- Desde este cambio: con pocos mensajes la lista queda anclada abajo, junto a la caja de escribir (como la app).

## La web tiene y la app no
- Entrada por QR/enlace `/c/[token]` (`RoomHub`, `JoinRoomButton`, `RestrictedHub`) para invitados sin la app.
- Flujo de mesero para invitados (`GuestWaiterSheet`, no se abre desde el chat) e identidad de invitado (`guestDevice.ts`, `guestTabSession.ts`).
- Páginas de pedido `/m`, `/o`, `/t`, `/r` (no son chat).

## Lo que tiene la app y no la web — por valor para el usuario (mayor primero)
| # | Función | Dónde está en la app | Qué necesitaría la web | Esfuerzo |
|---|---|---|---|---|
| 1 | Mensaje fijado (banner de `pinned_messages`) | `components/chat/PinnedBanner.tsx` | Backend existe. Lectura + realtime. Fijar sigue siendo cosa de la app/panel | **S** — un componente de solo lectura |
| 2 | Tarjetas de oferta (`type='offer'`, cuenta atrás) | `OfferCard.tsx`, caso `offer` de `MessageBubble.tsx` | Backend existe (`offers`, `offer_id` en metadata). Falta pintar la tarjeta, leer la oferta y la cuenta atrás | **S–M** |
| 3 | Mensaje directo desde el chat (`start_dm`) | `ChatRoomScreen.tsx` (`handleStartDM`), `services/dms.ts` | El RPC existe, pero la web no tiene bandeja ni hilos de DM | **XL** — son pantallas nuevas, no un botón |
| 4 | Tocar un avatar → tarjeta rápida / hoja de usuario (perfil, seguir, regalo, DM, reportar) | `UserQuickCard.tsx`, `UserActionSheet.tsx` | Portar `follows`/`users`; revisar RLS. Reportar y bloquear ya están en el menú del mensaje | **M** — tarjeta con perfil/seguir/reportar/bloquear, sin DM ni regalo |
| 5 | Notas de voz | `services/voiceNotes.ts` (bucket privado `voice-notes`), caso `voice` de `MessageBubble` | Backend y bucket existen. Grabar con `MediaRecorder`, subir, reproducir con URL firmada | **M** — códecs en Safari |
| 6 | Regalos a una persona | `components/gift/GiftSheet.tsx`, `services/gifts.ts`, `useGiftAvailable.ts` | Flujo de pago con retención en Stripe (migraciones 202+), presencia de ambos en el local | **L** (sin confirmar el alcance del pago en web) |
| 7 | Match (juegos, mazo, check-in QR) | `components/match/*`, `services/match.ts`, `useMatchPresence.ts` | Muchos RPC existen; la web no tiene nada de UI | **XL** — superficie de producto completa |
| 8 | Campana de notificaciones y contador | `ChatNotificationsSheet.tsx`, `useNotifications.ts` | La tabla existe; falta lista + realtime (sin push) | **M** |
| 9 | Barra de pedidos y hoja "más" (mi cuenta, salir del local, ajustes) | `ChatMoreSheet.tsx`, `OrdersBarContext`, `VenueSessionContext` | La lógica de pedido/cuenta existe en `/o` y `/t`; hay que conectarla al chat | **M** |
| 10 | Silenciado/expulsión del lado del usuario y herramientas de moderación del dueño | `is_banned_from_room`, `is_muted_in_room` en `ChatRoomScreen`; `PinMessageSheet` | Las comprobaciones de usuario son RPC y se pueden llamar desde la web. Las herramientas del dueño deberían quedarse en el panel | **S** (comprobación) · **L** (herramientas del dueño) |
| 11 | Crear oferta / fijar como staff (permiso `offers_manage`) | `CreateOfferSheet.tsx`, `services/permissions.ts` | El panel ya cubre las herramientas del negocio; no es necesidad del invitado | **L**, prioridad baja |
| 12 | Puerta de geocerca estricta al entrar | `useGeofenceGate.ts` (`check_geofence_and_join_room`, cuenta atrás de gracia) | La web usa `join_room_via_qr` y avisa "fuera del local"; falta la puerta estricta | **S–M** |
| 13 | Check-in y reacciones del mapa | `CheckInButton.tsx`, `MapReactionButton.tsx` | Tablas existen, pero dependen del mapa de la app | **M**, poco valor en web |
| 14 | Modo incógnito propio al entrar | `IncognitoToggle.tsx` (la app lo oculta con `INCOGNITO_ENABLED`) | La web no tiene estado incógnito por usuario | **S** |

No existen en ninguna de las dos: respuestas a mensajes, reacciones a mensajes ni menciones.

## Recomendación de orden (si se decide buscar paridad)
1. **Mensaje fijado + tarjetas de oferta** (puntos 1 y 2): solo lectura, el backend existe y muestran las promociones del local a los invitados. ≈ 2 días.
2. **Comprobación de silenciado/expulsión + tarjeta rápida con reportar/bloquear** (10 y 4): completa la historia de seguridad con RPC que ya existen. ≈ 2 días.
3. **Notas de voz** (5): el tipo de mensaje que más se echa de menos. ≈ 1–2 días.
4. **Lista de notificaciones y hoja "más" con pedidos** (8 y 9): une el chat con el flujo de pedido y cuenta que ya tiene la web. ≈ 3 días.
5. **DM, regalos y Match** (3, 6, 7): son XL/L y juntos pesan más que todo lo anterior. Conviene tratarlos como "descarga la app" salvo que producto decida lo contrario.
