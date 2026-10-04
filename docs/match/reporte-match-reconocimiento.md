# JChat Match — Reconocimiento y plan de integración

Fecha: 2026-10-03 · Base: `origin/main` = `e449516` · Solo lectura: no se implementó nada, no hay SQL.
Idea de origen: `docs/match/idea-2026-10-03-match-vision.md`. Las 15 decisiones de Juan reemplazan o amplían su sección 4.

---

## 0. Hallazgos que cambian supuestos de la idea (leer primero)

1. **No existe el botón "Salir del local".** La idea dice que JChat ya lo tiene. En el chat solo hay `navigation.goBack()` (`mobile/screens/chat/ChatRoomScreen.tsx:661`) y no hay ninguna RPC de salida. Al salir, la presencia no se borra: solo deja de renovarse y caduca sola.
2. **No existe una sección "Games".** Ni en la app ni en `docs/`. El panel del chat (`mobile/components/chat/AttachmentPanel.tsx:1-10`) tiene hoy Foto · Menú · Servicio · Oferta (esta última solo con permiso). "Juegos" es un botón nuevo, no un panel que haya que reubicar.
3. **No existen intereses.** Ninguna columna, tabla ni pantalla de intereses (grep en migraciones, `mobile/screens`, `services` e i18n: cero coincidencias). Hay que crear el catálogo y los intereses por usuario.
4. **No existe galería de fotos de perfil.** El perfil tiene `avatar_url` y `cover_url` (`mobile/services/database.types.ts`, tabla `users`) y las fotos de sus publicaciones. "Mini galería" = tabla nueva de fotos de Match.
5. **No hay moderación de fotos.** La idea supone "moderación existente"; confirmado que no existe (decisión 8 de Juan).
6. **La presencia es por SALA, no por negocio.** `room_geo_presence` tiene PK `(room_id, user_id)` (`supabase/migrations/112_geofence_barrier.sql:34-40`). "Estar en el local" (decisión 3) requiere unir presencia de todas las salas con `rooms.business_id`.
7. **Un par de usuarios solo puede tener UNA conversación DM** (`dm_conversations` con `unique (user_a, user_b)`, `002_social_schema.sql:62-70`). Si dos personas ya tienen un DM y hacen match, hay colisión (ver §3.5).
8. **El push de DM muestra nombre y texto del mensaje** (`supabase/functions/send-push/index.ts:138-140`), así que no sirve tal cual para Match. Los tipos de push son una lista cerrada (`PUSH_TYPES`, `:35`).
9. **La edad solo existe como `users.birth_year`** (migración 185). El filtro de ±1 año es viable; la tarjeta no debe mostrar la edad.
10. **Las dependencias de swipe están disponibles en SDK 56, pero ninguna está instalada** (ver R10).

---

## 1. Mapa del reconocimiento

### R1 · Presencia y salida
- **Unión por geocerca:** `check_geofence_and_join_room(_room_id, _lat, _lng)` (`112_geofence_barrier.sql:64-146`). El servidor calcula Haversine contra `businesses.lat/lng/geofence_radius_m`. Dueño del negocio: entra sin distancia. Sin geocerca configurada: no hay acceso (`no_geofence`).
- **Tabla `room_geo_presence`** (`112:34-42`): `room_id, user_id, expires_at, last_seen_at`; índice por `expires_at`. Solo lectura propia por RLS; la única escritura es la RPC. No guarda coordenadas.
- **Vigencia:** cada llamada fija `expires_at = now() + 10 minutos` (`112:127-130`). Si la persona queda fuera del radio, se borra su fila (`:134-136`).
- **`can_access_room`** (versión vigente `179_chat_moderation_enforcement.sql:84-105`): acceso = dueño, o (no baneado y presencia con `expires_at > now()` y, si la sala tiene contraseña, `room_members` vigente).
- **Cliente:** `mobile/screens/chat/useGeofenceGate.ts`. Latido cada 5 min con la app en primer plano (`:29`), aviso y 2 min de gracia en el cliente (`:30`), recomprobación cada 20 s durante la gracia (`:31`). No hay ubicación en segundo plano: `app.config.ts:138-141` lo declara y `services/geofence.ts:22` lo deja como TODO.
- **QR de sala:** `join_room_via_qr` (`026_room_qr_tokens.sql:179-189`) escribe `room_members` por 24 h, **no** `room_geo_presence`. Es una pertenencia a la sala, no una presencia física.
- **Vencimiento en el servidor:** `pg_cron` ya está instalado y en uso (`043_chat_ttl_purge.sql` crea la extensión y la purga de mensajes de 24 h; también `074`, `084`, `085`). `pg_net` también (`173b_push_dispatch_triggers.sql`). Hay base sólida para un job de limpieza.

### R2 · Chat del negocio y aviso previo a entrar
- El aviso es el `Modal` de la rama `if (entryVisible)` en `ChatRoomScreen.tsx:1159-1170`. Hoy trae título del negocio y el selector de incógnito (oculto: `INCOGNITO_ENABLED = false`, `components/chat/IncognitoToggle.tsx`).
- `handleEnter` (`ChatRoomScreen.tsx:643-658`) valida incógnito → ejecuta el gate de geocerca → `setEntryVisible(false)`. Es el punto donde se registra el consentimiento y se encienden los interruptores.
- Los interruptores "Incluir juegos" (uno por juego) se añaden en esa misma hoja, entre el título y el botón de entrar. La lista de juegos debería venir de un catálogo (tabla `games`) para que agregar uno nuevo no exija otro cambio de app.
- Modelo de salas: hay sala principal, subsalas (`parent_room_id`) y salas protegidas (`rooms.is_main`, `is_password_protected`). No hay un concepto "presente en el negocio" a nivel de negocio: se deduce uniendo salas.

### R3 · DMs
- `dm_conversations(id, user_a, user_b, last_message_at, created_at)` con `unique(user_a, user_b)`; orden canónico user_a = menor (`start_dm`, `042_dm_gate_and_soft_hide.sql:53-112`).
- `dm_messages(id, conversation_id, sender_id, body, media_url, voice_url, read_at, created_at)` (+ `voice_duration_s`, migración 187).
- Ocultar por lado: `hidden_at_a`/`hidden_at_b` y `hide_dm_conversation` (`172_dm_hide_and_notification_delete.sql`).
- Reglas de envío: RLS `dm_msg_send` exige participante y no bloqueo (`042:166-178`); `start_dm` aplica `whoCanDMMe` (`everyone`/`followers`/`nobody`).
- Notas de voz: bucket privado `dm-media` con ruta `{conversation_id}/{uid}/…` (migración 187).
- **Falta para la marca efímera:** columna de origen/negocio en `dm_conversations` (p. ej. `ephemeral_business_id`), fecha de expiración y el trigger de borrado; además la regla de "un solo mensaje hasta que respondan" (no existe).

### R4 · Perfiles
- `users`: `avatar_url`, `cover_url`, `bio`, `city`, `is_private`, `is_verified`, `birth_year` (185), `privacy_settings`. Buckets públicos `avatars`/`covers` (`011_storage_buckets.sql`) y `profile-media` (endurecido en `061`).
- `public_profiles` (vista, `169_profile_media_fields.sql`) expone id, username, display_name, avatar_url, cover_url, bio, city, is_verified, is_private. No incluye `birth_year` (correcto: no debe exponerse).
- Follows y solicitudes: `follows`, `follow_requests` (`003`), con las reglas de cuenta privada de los lotes 178/180/181. Es lo que se reutiliza para "seguir" desde el match.
- Intereses: **no existen** (hallazgo 3). Galería: **no existe** (hallazgo 4).

### R5 · Moderación
- `reports(id, reporter_id, reported_user_id, content_type, content_id, reason text libre, status pending|reviewing|resolved|dismissed, created_at)` (`003_schema_catchup.sql:40-53`). Insertar: RLS `reports_create`; leer propios: `reports_read_own`; lectura de admin: `013_admin_read_policies.sql:33`.
- Motivos hoy (cliente): `spam, harassment, inappropriate, impersonation, other` (`mobile/screens/profile/ProfileScreen.tsx:34`, `reportUser`). Los de Match (acoso, contenido explícito, sospecha de menor, estafa, otro) son valores nuevos del mismo campo libre.
- Cola del superadmin: `web/app/super-admin/alerts/page.tsx` ya lista la cola de reportes.
- Bloqueos: `blocks`, RPC `block_user`/`unblock_user`, `is_blocked`, `my_block_relations` (`040`, `179`). Pantalla de bloqueados en mobile (10A).
- Moderación del dueño: ban/mute por sala (`179_chat_moderation_enforcement.sql`, `is_banned_from_room`, `is_muted_in_room`) y panel en `UserActionSheet`.
- **Falta para el doble destino:** `reports` no tiene el negocio de contexto; hay que añadirlo para que el dueño solo vea reportes de su local, y una vía de lectura para el dueño.

### R6 · Personal ("Pedir ayuda al local")
- `service_calls(id, room_id, business_id, user_id, status pending|acknowledged|resolved, type waiter|bill|other, notes)` (`001_initial_schema.sql:720`). Los INSERT los hace cualquier autenticado; el dueño lee.
- Pantalla del dueño: `web/app/dashboard/service/page.tsx`. En el móvil, `components/chat/ServiceCallSheet.tsx` crea la llamada y `hooks/usePosAlerts.ts` suena la alerta en el POS (canal realtime).
- Alertas de trabajo al personal: tipo `work_alert` en `notifications` con push (`173b_push_dispatch_triggers.sql:65`; preferencia `notifWork`).
- Reutilizable: añadir un valor `type = 'help'` a `service_calls` (o un tipo propio) con texto discreto. Hay que confirmar con Planning qué personal "de turno" recibe la alerta (ver §4).

### R7 · Push
- Función `send-push` (Lote 5): llamada por `push_dispatch` desde la base vía `pg_net`, con secreto en el Vault.
- Payload a Expo: `{ to, title, body, sound: 'default', data: { type, payload } }`. Textos en `localizedContent` según `users.language` (en/es).
- Preferencias: `settings.notifSocial` (dm, follower, like, comment) y `settings.notifWork` (work_alert).
- Tipos aceptados: lista cerrada `dm | follower | like | comment | work_alert`. Hay que añadir tipos de Match.
- **Contenido neutro:** cada tipo nuevo debe tener título y cuerpo genéricos, sin nombres ni fotos ("Tienes una novedad en JChat"). El campo `data.payload` viaja dentro de la notificación y se ve en el dispositivo, por lo que no debe llevar identidades; la app resuelve el detalle al abrirla.

### R8 · Dashboard
- `web/app/dashboard/configuration/page.tsx` ya concentra los interruptores del negocio (p. ej. `menu_enabled`, `table_subchats_enabled`, `tips_enabled`; carga en `:661`, guardado en `:905`). "Permitir Match en mi local" va ahí como un campo más de `businesses`.
- Además: revisar reportes de Match de su local y expulsar a alguien de Match (sección nueva o dentro del chat/moderación del dashboard).

### R9 · Navegación
- Pestañas inferiores: Map, Nearby, Messages, Profile (`mobile/navigation/tabs/BottomTabs.tsx:42-45`). El chat y sus pantallas viven en `MainStack` (`mobile/navigation/AppNavigator.tsx`).
- Encaje de las 13 pantallas (todas son pantallas del `MainStack`, abiertas desde el chat): deck principal; perfil con galería y lightbox; "¡Es un match!"; fin del deck; quiz de intereses; mi perfil del deck; mi actividad (3 pestañas); chat 1:1; hoja de reportar/bloquear y sello LIKE/NOPE/SUPER son modales o parte del deck. El sheet "Juegos" nace del panel "+" del chat.
- Espacio reservado para el botón de pánico en el chat 1:1 y el deck: ya cubierto en el MVP por "Pedir ayuda al local" (decisión 9).

### R10 · Versiones y paquetes
- Proyecto: `expo ~56.0.15`, `react-native 0.85.3`, `react 19.2.3` (`mobile/package.json`).
- Versiones de SDK 56 (`node_modules/expo/bundledNativeModules.json`): `react-native-reanimated 4.3.1`, `react-native-gesture-handler ~2.31.1`, `react-native-worklets 0.8.3`, `expo-image ~56.0.11`, `expo-secure-store ~56.0.4`, `expo-haptics ~56.0.3`, `expo-location ~56.0.20`.
- `@react-native-motion-kit/swipe-deck` (última 1.5.0): peers `gesture-handler >=2.24`, `reanimated >=4.0`, `worklets >=0.5`, `react-native >=0.75`. **Compatible** con lo que SDK 56 trae.
- **Instalados hoy:** ninguno de reanimated, gesture-handler, worklets, `expo-image` ni `expo-secure-store`. Sí está `expo-haptics`. No hay `babel.config.js` ni `GestureHandlerRootView` en la app.
- Para el build nuevo: instalar con `npx expo install` (reanimated, gesture-handler, worklets, expo-image; secure-store si se hace el Face ID real). Con Reanimated 4 el preset de Expo debería añadir el plugin de worklets solo; **verificar al instalar** con `npx expo install --check` y una compilación de prueba. Envolver la raíz con `GestureHandlerRootView`. La librería exige build nativo, que irá en el build del cambio de cuentas.
- Ubicación simulada en Android: `expo-location` devuelve `mocked` en cada posición (Android). Es viable como señal, no como garantía.

---

## 2. Plan de integración

### 2.1 Qué se reutiliza (y con qué ajuste)
| Pieza | Uso en Match | Ajuste |
|---|---|---|
| `check_geofence_and_join_room` + `room_geo_presence` | Fuente de "está en el local" | Insuficiente tal cual: presencia por sala y 10 min. Hace falta un registro propio de check-in de Match (§3.2) |
| `can_access_room` | Acceso a la sala de chat | Sin cambios; Match no lo usa para el deck |
| Modal de entrada (`ChatRoomScreen.tsx:1159`) | Aviso + interruptores de juegos | Añadir bloque de interruptores y texto de capturas |
| `dm_conversations`/`dm_messages` | Chat 1:1 del match | Marca efímera por negocio, fecha de expiración, límite de primer mensaje |
| `start_dm`, RLS DM, `is_blocked` | Reglas de envío y bloqueo | Una RPC propia para crear la conversación del match (no pasa por `whoCanDMMe`: ya hubo consentimiento mutuo) |
| `follows`/`follow_requests` | "Seguir" desde el match; supervivencia | El follow mutuo quita la marca efímera |
| `send-push` + `push_dispatch` | Push de like, super like, match, nueva gente | Tipos nuevos con texto neutro |
| `reports`, `blocks`, panel del dueño | Reportar/bloquear/expulsar | Añadir negocio y destino doble |
| `service_calls` + `usePosAlerts` | "Pedir ayuda al local" | Tipo `help` discreto |
| `public_profiles` | Datos visibles de la tarjeta | No exponer `birth_year` ni edad |
| `pg_cron` / `pg_net` | Borrado al caducar la presencia | Job periódico nuevo |

### 2.2 Qué se crea
- **Backend:** catálogo de juegos y opt-in por usuario/negocio; interruptor del dueño; registro de check-in de Match; intereses (catálogo + por usuario); fotos de Match con estado de moderación; swipes, matches, super likes diarios; conversación efímera; notificaciones de Match; borrado programado; reporte con negocio.
- **Moderación de fotos:** función de borde (Edge Function) que analiza la imagen al subirla con un proveedor de detección de desnudez y escribe el estado; la foto no es visible mientras esté `pendiente` o `rechazada`. Elección de proveedor y costo: pregunta abierta.
- **App:** `MatchDeck` (envoltorio de la librería, nadie más la importa), 13 pantallas, quiz, mi actividad, hoja de reporte, "Salir del local".
- **Dashboard:** interruptor del local, bandeja de reportes de Match del local y botón de expulsar.

### 2.3 Decisiones técnicas y por qué
1. **Mensajes del match: reutilizar `dm_conversations`/`dm_messages` con una marca efímera.** Ganan: notas de voz, bloqueo, push, ocultar por lado, y el pase a DM permanente al seguirse (basta quitar la marca, el historial se conserva, tal como pide la idea). Costo: la unicidad por par (ver §3.5). Descarto tablas dedicadas porque obligaría a copiar mensajes al convertirse en permanente.
2. **Detección de match con trigger AFTER INSERT** sobre los swipes: atómico y no burlable. Coincide con la recomendación de la idea y con el patrón de RPC/trigger de JChat.
3. **Deck por RPC única** que une presencia activa del negocio + anti-join de ya vistos + filtros (edad ±1, intereses en común), `security definer`, sin lecturas directas de tablas ajenas.
4. **Presencia propia de Match** (check-in), no `room_geo_presence` directo: la decisión 7 pide QR del local o presencia sostenida, y la presencia de sala es de 10 min, por sala y con un GPS puntual.
5. **Borrado en servidor con `pg_cron`**: sin ubicación en segundo plano (decisión 13), el servidor detecta presencia vencida + 15 min y borra todo lo del local.
6. **Push neutro:** tipos nuevos con título/cuerpo genéricos y `payload` sin identidades.
7. **Librería de swipe:** `@react-native-motion-kit/swipe-deck` fijada en `1.5.0` dentro de `MatchDeck`. Plan B (deck propio sobre Reanimated + Gesture Handler) solo si falla la compilación.

---

## 3. Propuesta de esquema de datos (en prosa; el SQL lo escribe y aplica Planning)

### 3.1 Catálogo de juegos y opt-in
- **`games`**: id, clave (`match`), nombre en es/en, activo. Sirve para mostrar un interruptor por juego en el aviso de entrada.
- **`business_games`**: negocio + juego + `enabled` (la decisión del dueño). **Valor por defecto propuesto: apagado** (Match no existe en un local hasta que el dueño lo active), porque implica contacto entre desconocidos dentro de su negocio.
- **`game_optins`**: usuario + negocio + juego + fecha. Una fila significa "este usuario pidió ser incluido". Se crea al entrar al chat con el interruptor encendido; se borra al apagarlo o al caducar la presencia.

### 3.2 Check-in y presencia de Match
- **`match_presence`**: usuario + negocio, `entered_at`, `expires_at`, `last_seen_at`, método (`qr` | `sustained`) y marca de posición simulada (bool, solo señal).
  - **Check-in fuerte:** válido por QR del local (token de negocio, no solo de sala) o por presencia sostenida: N lecturas dentro del radio en una ventana mínima (valor sugerido: 3 lecturas en ≥10 min). Un solo GPS no basta.
  - **Límite de locales por noche:** contar check-ins distintos por usuario por noche y rechazar al pasar el tope (valor sugerido: 2).
  - **Salida:** el cliente renueva mientras la app está abierta. La RPC "Salir del local" borra la fila y dispara el borrado. Si deja de renovar, vence.
  - El deck solo incluye a quien tenga `match_presence` vigente, opt-in encendido y negocio con Match activo.

### 3.3 Perfil de Match
- **`interests`** (catálogo es/en) y **`user_interests`** (usuario + interés; mínimo 3 desde el quiz; sin quiz se usan los del perfil cuando existan).
- **`match_photos`**: usuario, ruta de storage (bucket privado), orden, **estado de moderación** (`pendiente | aprobada | rechazada`), fecha de revisión. Máximo ~6 por usuario. Requisito para aparecer en el deck: al menos 1 aprobada.
- La tarjeta lee de `public_profiles` y de los intereses; **no** devuelve `birth_year` ni la edad. El filtro de edad se aplica en la RPC del deck con rango de ±1 año alrededor de la preferencia, sin exponer el dato.

### 3.4 Swipes, super likes y match
- **`match_swipes`**: negocio, de, para, `action` (`like | pass | super`), fecha; única por (de, para, negocio). RLS: cada usuario solo lee los suyos; sin escritura directa, solo la RPC de swipe.
- **Super likes:** contador diario en el servidor (usuario + día), máximo 5; la RPC rechaza el sexto. El tope se reinicia por día calendario del servidor (zona horaria: pregunta abierta).
- **Trigger de match** AFTER INSERT en `match_swipes`: si existe el like inverso (like o super) entre los dos en el mismo negocio y ninguno bloqueó al otro, crea el match y su conversación efímera de forma atómica. Quien dio super like aparece primero en el deck del otro.
- **`matches`**: negocio, usuario A/B (orden canónico), fecha, conversación asociada. Borrar un like que originó un match elimina el match (y su chat) en silencio.
- **"Les gusté":** la RPC devuelve quiénes dieron like (identidades visibles para quien las recibe, según decisión 4). Una notificación por like con push neutra.

### 3.5 Chat 1:1 efímero
- En `dm_conversations` añadir: marca efímera con el negocio, fecha de expiración (null al volverse permanente) y quién envió el primer mensaje.
- **Colisión por par único:** si ya existe una DM permanente entre los dos, el match **no crea otra conversación**: reutiliza la existente y no se marca efímera (nada que borrar). Si no existe, se crea la efímera.
- **Primer mensaje con límite** (decisión 11): regla en la base (política o trigger de `dm_messages`) que permite un solo mensaje del iniciador mientras no haya respuesta, y solo en conversaciones efímeras de Match.
- **Supervivencia:** al haber follow mutuo (uno pide, el otro acepta) se quita la marca y la fecha de expiración; el historial queda. Un follow pendiente conserva la conversación mientras dure la solicitud.
- RLS de DMs sin cambios de fondo; el bloqueo ya corta lectura y envío.

### 3.6 Reportes, ayuda y expulsión
- **`reports`:** añadir el negocio de contexto y un tipo `match`. Motivos nuevos: acoso, contenido explícito, sospecha de menor, estafa, otro. El mismo registro llega a la cola del superadmin (ya existe en `super-admin/alerts`) y es legible por el dueño del negocio. Objetivo de respuesta ~24 h (guía 1.2 de Apple): conviene un campo de estado/fecha de atención.
- **"Pedir ayuda al local":** RPC que crea un `service_calls` de tipo `help` con nota discreta, ligado al negocio y a la sala actual; dispara el mismo canal de alerta del POS y la `work_alert` del personal.
- **Expulsión del dueño:** el dueño marca a un usuario como expulsado de Match en su local (tabla de expulsiones por negocio); la RPC del deck y el opt-in lo excluyen. Opcional: aplicar también un ban de sala existente.

### 3.7 Borrado
- **Job de `pg_cron` cada 1–2 min** que busca `match_presence` vencida hace más de 15 min (o borrada por "Salir") y, por cada usuario/negocio, elimina: opt-in, presencia, swipes dados y recibidos, matches, conversaciones efímeras con sus mensajes y archivos de voz, intereses de contexto y notificaciones de Match.
- **No se borran:** reportes, bloqueos, mensajes propios en el chat de grupo del local.
- **Fotos de Match:** pertenecen al usuario y se conservan para futuras visitas, pero dejan de ser visibles al salir; si el usuario las borra, se eliminan del storage (la API de Storage, no SQL directo).
- **Backups:** el borrado es inmediato en la base activa y caduca en respaldos según la retención; el aviso de privacidad debe decirlo.
- Caché del teléfono: al salir o al volver a abrir, la app descarta lo de ese local.

### 3.8 Avisos de gente nueva
- Opt-in por usuario y negocio (`notify_new_people`). Cuando entra alguien nuevo al deck y hay suscriptores, una push genérica, con límite de frecuencia para no saturar.

---

## 4. Riesgos y preguntas abiertas

### Riesgos
1. **Moderación de fotos:** es la pieza más costosa y de más riesgo (falsos positivos/negativos, costo por imagen, privacidad). Sin ella no se puede exigir "1 foto aprobada" ni lanzar.
2. **Reglas de las tiendas:** app de citas/encuentros con desconocidos exige reportar, bloquear y moderación desde el primer build; revisar la clasificación de edad de la ficha y la guía 1.2 de Apple.
3. **Seguridad personal:** presencia física y encuentros cara a cara; el botón de ayuda y la expulsión por el dueño son parte del MVP, no un extra.
4. **GPS falsificable:** el check-in fuerte reduce el riesgo pero no lo elimina; `mocked` en Android es una señal, no una garantía. En iOS no hay equivalente fiable.
5. **Latencia de salida:** sin ubicación en segundo plano, alguien puede seguir "dentro" hasta que venza la presencia + 15 min. Aceptable por diseño, pero hay que decirlo en el aviso.
6. **Capturas de pantalla:** no se pueden impedir; el aviso lo dice (decisión 12).
7. **Colisión de DM por par:** resuelta reutilizando la conversación existente; hay que probar el caso de conversación ya oculta por un lado.
8. **Fuga de datos:** `birth_year` no debe salir nunca en una respuesta de la tarjeta; el filtro de edad vive solo en el servidor.
9. **Build nuevo:** reanimated, gesture-handler, worklets y `expo-image` son nativos; entran con el build del cambio de cuentas.
10. **Borrado incompleto:** si el job falla, quedan datos de un local que el usuario dejó. Hace falta monitoreo y reintentos.

### Preguntas abiertas
1. ¿Valor por defecto de "Permitir Match en mi local"? Propuesta: **apagado**.
2. ¿Proveedor de detección de desnudez y presupuesto por imagen?
3. ¿Máximo de fotos por perfil de Match y tamaño/formato (WebP ~800 px tarjeta, ~1600 px ampliada, según la idea)?
4. ¿Qué es "personal de turno" para la ayuda? Hoy no hay turnos: ¿se avisa a todos los empleados aceptados del local o a quienes tengan sesión abierta en el POS?
5. ¿Cuántos locales distintos por noche y qué cuenta como "noche" (zona horaria del local)?
6. ¿Presencia sostenida: cuántas lecturas y en cuánto tiempo?
7. ¿Qué pasa con un usuario cuya presencia vence mientras está en un chat 1:1 activo? (Propuesta: se borra igual, en silencio.)
8. ¿Idioma del texto de la push de "avisarme cuando entre gente nueva" cuando el usuario tiene `language` distinto al del dispositivo? (Hoy se usa `users.language`.)
9. ¿El quiz usa un catálogo fijo en es/en o categorías administrables desde superadmin?
10. ¿"Salir del local" también apaga el interruptor de juegos o solo borra lo del local? (Según decisión 1, para dejar de aparecer hay que salir y apagar el interruptor.)

---

## 5. Fases propuestas (estimación relativa: S < M < L < XL)

### Fase A — Backend base (L)
Catálogo de juegos, interruptor del dueño, opt-in, check-in/presencia de Match con límite por noche, "Salir del local" y job de borrado. Reportes con negocio. Verificable con perfiles de prueba en un local de prueba.

### Fase B — Moderación de fotos (L)
Bucket de fotos de Match, función de borde con el proveedor, estados y cola de revisión manual en el superadmin. Bloquea lanzar sin esto.

### Fase C — Núcleo del juego (XL)
Intereses, swipes con trigger de match, super likes diarios, RPC del deck, conversación efímera (con límite de primer mensaje), supervivencia por follow mutuo, notificaciones y push neutras.

### Fase D — App (XL)
`MatchDeck`, 13 pantallas, aviso de entrada con interruptores, quiz, mi perfil y mi actividad, reporte/bloqueo, "Pedir ayuda al local", "Salir del local". Requiere el build nuevo (dependencias nativas).

### Fase E — Dashboard (M)
Interruptor "Permitir Match en mi local", bandeja de reportes del local y expulsar de Match.

### Fase F — Lanzamiento controlado (M)
10–20 perfiles de prueba en un local de prueba, revisión del aviso de privacidad (incluye retención de backups y capturas) y pruebas de borrado.

**Orden sugerido:** A → B (en paralelo con el inicio de C) → C → D → E → F. D no puede cerrarse sin el build nuevo.
