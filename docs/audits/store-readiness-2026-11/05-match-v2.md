# Bloque 5 — Match v2 (parcial)

Fecha: 2026-11-02 · main `9bd62175` (OTA vigente) · Evidencia: `screenshots/b05/` (sin commit).
Cuentas: **@test** (Android 35) y **@test1** (iPhone 17 Pro); Bar XZX. Ya probados antes (no repetidos): coincidencia, límite de cambios (3), moderación de foto.

## Qué se probó
| Elemento | Resultado |
|---|---|
| Tarjeta de otra persona (iOS) | OK: nombre, @usuario, intereses (Baile, Música, Viajes), foto; **sin sexo, interés ni edad exacta ni ubicación** (`ios17pro-03`) |
| Privacidad en servidor | OK: `match_get_deck`, `match_get_profile`, `match_get_activity`, `match_get_passed` no leen `gender`/`seeking`; RLS de `match_profiles` = solo la fila propia (select/update), así que otra persona no puede leerlos ni por API directa |
| Like (iOS) | OK: sello "ME GUSTA"; fila `match_swipes(test1→test, like)` en BD |
| "Mi actividad → Les gusté" (Android) | OK: aparece @test1 con hora; sin datos de sexo/interés |
| Perfil de quien me dio like | OK: Pasar / SUPER LIKE / Me gusta / Opciones / "Ver perfil completo en JChat" |
| Reportar desde perfil/tarjeta | OK: 5 motivos (Acoso, Contenido explícito, Sospecho que es menor, Estafa, Otro) + detalles; **no enviado** |
| Bloquear desde perfil | OK: "¿Bloquear a @test1? Desaparecerá de tu mazo, matches y chats, y tú del suyo." Cancelar/Bloquear; **no confirmado** |
| Match mutuo | OK: "¡Es un match!" con seguir, rompehielos y campo de mensaje; fila en `matches` |
| Chat del match | OK: abre el hilo de DM existente (mismo hilo que el Bloque 4) |
| Salir del local (Match) | Efecto OK en BD: swipes 2→0, matches 1→0, presencia 2→1, opt-in 2→1; el perfil de Match se conserva |
| Mazo vacío "Ya viste a todos" | OK (con "Avisarme cuando entre gente nueva", Volver al chat, Ver mi actividad) |
| TalkBack (árbol) | OK: Atrás, Match, Mi actividad, Mi perfil de Match, Salir del local, "Foto de @test1", Pasar, SUPER LIKE, Me gusta, Opciones con nombre |

## Hallazgos
| ID | Sev. | Pantalla / plataforma | Pasos | Esperado → Obtenido | Evidencia | Propuesta (sin implementar) |
|---|---|---|---|---|---|---|
| B5-1 | **P1** (sube de P2: se repite en iOS) | "Salir" en Match · Android e iOS | Match → icono salir → SALIR → OK | Debe salir de Match y volver al chat/pestañas (el código llama `navigation.navigate('Tabs')`) → aparece "Match solo funciona mientras estás en el local…"; tras OK la pantalla queda en carga (Android: icono sin nombre accesible, indefinido; iOS: rueda ≈ 15 s). **En iOS, @test1 queda de nuevo inscrito**: `game_optins` se recrea a las 03:00:59, justo después de salir, y la pantalla vuelve a "Ya viste a todos". Es decir, **Salir no se mantiene** y la promesa de "se borra todo" queda anulada. Atrás sí funciona (mitiga el "sin salida" de Apple 2.1, pero no el reingreso) | `android35-14/-15/-16`, `ios17pro-04-tras-salir-reingreso.png` | No re-registrar presencia/opt-in tras `match_leave_venue` y navegar a las pestañas; el aviso "solo funciona en el local" no debe mostrarse al salir voluntariamente |
| B5-5 | P2 | Botón y aviso "Salir del local" en Match · todas | Abrir Match → icono salir | El botón dice "Salir del local" y el aviso "¿Salir de Bar XZX?", pero **la persona sigue en el chat del local**: solo sale de Match (confirmado en Android; en iOS tampoco se sale del chat) | `android35-13`, `-16` | Renombrar a "Salir de Match" y alinear el aviso (es y en: `match.json` → `leave.button`, `leave.title`, `leave.body`) |
| B5-2 | P3 | Mi actividad → Matches · Android | Crear un match con la pantalla ya abierta | La lista debe actualizarse → seguía "Aún no tienes matches" hasta reabrir la pantalla | `android35-11`, `-12` | Refrescar al llegar el match (Realtime/foco) |
| B5-3 | P3 | Mazo tras expirar la presencia de la otra persona · Android | Dejar la otra app en segundo plano ~min y abrir Match | El mazo debe renovarse al volver → mostraba "Ya viste a todos" con el mazo obsoleto hasta reentrar | `android35-02` | Reintentar el mazo al enfocar y con Realtime de presencia |
| B5-4 | P2 | Mapa con letra 2,0× + tema oscuro · Android (fuera de Match) | `font_scale 2.0` + `uimode night yes` | La app se recrea (esperable) → en el Mapa un bloque negro cubre media pantalla ("2 lugares cerca de ti") y el menú Normal/Satélite queda abierto sobre la barra | `android35-17` | Revisar en el Bloque del Mapa (7) |

## B5-1 — causa localizada (solo lectura, sin cambios de código)
**Qué vuelve a crear el opt-in.** El RPC `match_check_in` es la **única** función que inserta en `game_optins` (`supabase/migrations/245_baseline.sql:2746`, `on conflict do nothing`, justo antes de escribir `match_presence`). Lo llama el latido de presencia del chat, que sigue vivo después de salir:

1. `mobile/utils/matchLeave.ts:27-29` — tras `matchLeaveVenue` solo hace `resetMatchPresence()` (estado en memoria) y `onLeft()`. **No guarda nada que diga "esta persona salió"**.
2. `mobile/screens/chat/ChatRoomScreen.tsx:520-526` — `matchActive = matchAvailable && gamesEnabled` no cambia al salir (el local sigue teniendo Match y el interruptor "Participar en juegos" sigue activo), así que `useMatchPresence({ enabled: !entryVisible && matchActive && !isOwner })` sigue habilitado; el chat sigue montado debajo de la pantalla Match.
3. `mobile/hooks/useMatchPresence.ts:34-39` — el efecto de latido se dispara con cada `reading?.readAt` nuevo y llama `runMatchCheckIn`.
4. `mobile/screens/chat/useGeofenceGate.ts:364` — cada lectura GPS (`setLastCoords({… readAt: Date.now() })`) produce un `readAt` nuevo (al volver el foco/`AppState` activo y en el latido); la comprobación está en `:397` y `:457`.
5. `mobile/services/matchPresence.ts:100` (`runMatchCheckIn`) → `mobile/services/match.ts:76` (`matchCheckIn`) → RPC `match_check_in` → inserta opt-in y presencia.
6. Además `mobile/hooks/useRequireMatchPresence.ts:30-36` ve el estado reseteado (`ok = false`), muestra "Match solo funciona mientras estás en el local…" y hace `goBack()`: eso explica el aviso y que el usuario acabe en el chat, mientras `onLeft` (`MatchHomeScreen.tsx:55`, `navigate('Tabs')`) compite con ese `goBack`. Con el chat de nuevo en pantalla llega la siguiente lectura GPS y el paso 3-5 reinscribe a la persona. También el latido del `VenueSessionContext` (`:333`, `matchActiveRef`) hace lo mismo con la sesión minimizada.
*Limitación:* el instante exacto de la lectura que dispara el reingreso en iOS (≈ 1 min tras salir) lo deduzco del código y de la hora del opt-in (03:00:59); no lo medí con trazas.

**Propuesta de arreglo (sin implementar; sustituye a la anterior).**
- La inscripción (`insert` en `game_optins`) solo se crea con una **acción explícita** de la persona: Juegos → Match.
- `match_check_in` disparado por GPS **solo renueva la presencia** de quien ya tiene opt-in; **nunca inserta opt-in** (si no hay fila en `game_optins` responde `denied` con un motivo propio, p. ej. `not_joined`, y no escribe `match_presence`).
- Salir (`match_leave_venue`) borra el opt-in como hoy, y como el latido ya no puede recrearlo, la persona queda fuera hasta volver a entrar de forma explícita.

**Qué usa hoy la acción explícita de entrar (solo lectura): ninguna función propia.**
- Juegos → Match solo navega: `mobile/screens/chat/ChatRoomScreen.tsx:553-558` (`handleGamePress` → `navigation.navigate('MatchHome', …)`), sin llamar a ningún RPC.
- El único RPC que crea el opt-in es `match_check_in` (`supabase/migrations/245_baseline.sql:2716`, `insert … game_optins` en `:2746`), y lo llaman el latido (`hooks/useMatchPresence.ts:36`), la sesión del local (`context/VenueSessionContext.tsx:333`) y el QR (`services/matchPresence.ts:150-154`, `matchCheckInWithQr`).
- El interruptor "Participar en juegos" (`users.settings.gamesEnabled`, `SettingsScreen.tsx:676-685` y la hoja de entrada) es un ajuste del cliente, no un opt-in de servidor; `ChatRoomScreen.tsx:1025` solo llama a `matchLeaveVenue` cuando se apaga.
- Por tanto el arreglo necesita **una función nueva** (p. ej. `match_join_venue(p_business_id, p_lat, p_lng, p_qr_token, p_mocked)`, **que va en la migración 256**; la 253 está reservada) que haga las validaciones de hoy de `match_check_in` (radio, viaje imposible, QR/mocked) y sea la **única** que inserte en `game_optins`; el cliente la llama desde `handleGamePress` (y desde el QR) y `runMatchCheckIn` pasa a ser solo renovación.

**Tests.**
a) **Estático** (patrón `mobile/scripts/*.test.mjs`): el cuerpo de `match_check_in` no contiene `insert into public.game_optins`; solo `match_join_venue` lo contiene.
b) **Unitario:** tras `confirmLeaveVenue` simulado, una lectura GPS nueva (`readAt` distinto) no reinscribe (no hay llamada a la función de unirse; `matchCheckIn` devuelve `not_joined` y el estado queda "fuera").
c) **Contra base local de pruebas** (nunca producción): salir y llamar `match_check_in` no recrea el opt-in (0 filas en `game_optins`); llamar `match_join_venue` sí.

## Qué borra exactamente "Salir" (solo lectura, 2026-11-02)
`match_leave_venue` → `match_wipe_user_venue(uid, negocio)`: borra los matches del usuario en ese local y sus chats **efímeros** (`dm_conversations.ephemeral_business_id = negocio`, salvo que haya una solicitud de seguir pendiente), notificaciones de Match, swipes dados y recibidos, `game_optins` y `match_presence`. `match_remove_pair` aclara que "las permanentes no se tocan".
Comprobado en producción: el DM entre @test y @test1 (`dm_conversations` permanente, `ephemeral_business_id` nulo) **sigue existiendo** después de salir, con mensajes posteriores al match. **No hay B5-6**: no se borran DMs permanentes; solo los chats nacidos en Match y sin seguimiento, algo que el aviso ya anuncia ("likes, matches y chats"). Decisión de producto para Juan, no defecto: si dos personas con match se hablaron y una sale del local sin seguirse, ese chat desaparece para ambas.

## Límite de cambios de perfil de Match
@test ya gastó **3 de 3** cambios de sexo/interés hoy; no se le vuelve a cambiar el perfil (si hace falta, @test1).

## No probado y por qué
| Qué | Motivo |
|---|---|
| Mazo con tarjeta en tema oscuro y letra grande (Android/iOS), VoiceOver real, Dynamic Type en la tarjeta | Tras salir de Match no había tarjetas disponibles y el cambio de fuente recreó la app en el Mapa; queda para el pase de accesibilidad final |
| Super like (consumo del cupo de 5), Pasar, Deshacer, re-like | No se repitieron: ya cubiertos en la prueba previa de Match v2; cupo `5` visible |
| Reportar/Bloquear desde un match ya hecho y su efecto real | Se abrió el diálogo desde el perfil y desde el DM (Bloque 4); no se confirmó para no afectar a personas reales |
| Notificaciones de like/match en iOS (APNs) | El simulador no recibe push reales |
| Android 36 y 26, iPhone 17e | No se alcanzó |

## Estado en que quedan las cuentas y los dispositivos
@test salió de Match en Bar XZX (sin likes ni matches; perfil conservado, sigue en el chat). @test1 sigue en Match con su like borrado por el reset del par. Android: tema claro y fuente 1,0× restaurados.
