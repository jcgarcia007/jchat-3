# JChat 3.0 — Backlog de Chat & Mapa (sesión de diseño 2026-06-24)

> Decisiones de producto tomadas en sesión de brainstorming. Organizado en:
> (1) features nuevas a agendar, (2) precisiones/mejoras al spec existente,
> (3) descartado con razón. Cruzado contra JCHAT_3.0_MASTER_SPEC para no
> duplicar lo ya diseñado.

---

## 1 — FEATURES NUEVAS (no estaban en el spec)

### Mensajería
- **Reacciones a mensajes individuales** — long-press en burbuja, emojis rápidos,
  agrupados con contador, en vivo vía Realtime. Tabla `message_reactions`.
  Efímeras (mueren con el mensaje).
- **Responder/citar mensajes (reply)** — deslizar burbuja para responder, cita
  compacta arriba. Columna `reply_to_message_id`.
- **Indicador de "escribiendo…"** — vía Supabase Realtime Presence (ya existe).
  Límite de nombres en salas llenas para evitar ruido.
- **Editar y borrar mensajes propios** — usuario normal sobre los suyos. Editar
  muestra "editado"; borrar deja "mensaje eliminado". (Owner/Mod ya tiene su
  borrado por spec.)
- **Mensajes/fotos autodestructivos** — opción "ver una vez" o temporizado, más
  allá del TTL de sala. Privacidad Gen Z.
- **Badge de no leídos por sala** — contador de mensajes nuevos no expirados.

### Social / interacción
- **Menciones con @** — autocompletar usuarios de la sala, resaltado + push.
  (Setting de privacidad "quién puede mencionarme" ya existe en spec 13.)
- **GIFs / stickers** — integración Giphy/Tenor. Reemplaza "coming soon".
- **Mensajes de voz** — grabar con long-press, subir a Storage (base como fotos),
  reproductor con waveform. Reemplaza "coming soon". (También en spec 6.4.)
- **Read receipts SOLO en DMs** — no en salas grupales (evita lo invasivo).
  (Setting ya existe en spec 13.)
- **Encuestas / polls** — SOLO dueño/ayudantes/asistentes a eventos pueden
  crearlas; usuarios normales solo votan. Mismo patrón de permisos que ofertas.
- **Gifting celebratorio visible en sala** — al enviar un regalo, tarjeta/anim.
  "🎁 X envió Y a Z" visible para la sala (FOMO/ambiente). Extiende el Gift
  del spec 7.4.

### Moderación / control
- **Moderación con IA** — capa proactiva sobre `blocks`/`reports` (reactivos):
  filtra spam, abuso, phishing antes de aparecer.
- **Pin de mensajes — COMPLETAR + fix seguridad P1-3** — feature ya a medias
  (`pinned_messages`, `PinnedBanner`). Mover delete/unpin a RPC server-side con
  checks de permisos (lo pide el security audit). Spec 6.3, Task 2.5.
- **Control de notificaciones por sala** — todo / solo menciones @ / silenciar.
  Construye sobre `user_personal_mutes` (Tanda 3).
- **Reglas / código de conducta por sala** — configurable por el dueño, visible
  al entrar. Respalda la moderación.
- **Mensaje de bienvenida por sala** — configurable por el dueño desde dashboard,
  se muestra al entrar por primera vez.
- **Insignias de rol en el chat** — badge Dueño/Staff junto al nombre.

### Negocio / venue
- **Anuncios "EN VIVO / ahora mismo"** — banner efímero del negocio (karaoke
  empieza, hora feliz 30 min). Distinto de ofertas (comerciales/persistentes).
- **TTL configurable por sala** — el dueño define cuánto duran los mensajes
  (evento 2h vs negocio 24h). Nota: el cron de limpieza debe leer TTL por sala.

---

## 2 — PRECISIONES / MEJORAS AL SPEC EXISTENTE

### Modo incógnito (detalle fino sobre spec 6.x / 13)
- Toggle + **nickname** obligatorio al entrar.
- **Avatar animado aleatorio** (caricatura/animal/muñeco) en vez de foto real;
  asignado al azar automáticamente, **estable durante la sesión** (no cambia al
  recargar). Mantiene el conteo de usuarios visualmente correcto (10 usuarios =
  10 avatares).
- Puede **hablar** en la sala normalmente con su nickname.
- Su **perfil real queda oculto**; otros no acceden a él.
- Él puede tocar perfiles de otros pero **solo ve una vista breve/limitada**, sin
  acceso al perfil completo.
- Incentivo de diseño: para ver perfiles completos (fotos, bio) e interactuar de
  verdad, debe entrar con su usuario real.
- **Moderación:** aunque sea anónimo de cara al público, el sistema SÍ sabe
  internamente quién es (para que Report/Block/moderación-IA funcionen).

### Modelo de salas (amplía spec — confirmado en sesión)
- **Sala principal** por negocio, nombre personalizable por el dueño. Pertenencia
  automática al entrar.
- **Sub-salas** del mismo negocio, en **scroll horizontal bajo los perfiles** en
  la sala principal. El dueño las crea.
- **Membresía acumulativa**: entrar a una sub-sala NO te saca de la principal —
  quedas en ambas.
- Sub-salas con **password opcional** (usa la infra de P0-1: `room_members` +
  `verify_room_password` 24h).
- **QR por sala** (principal y sub) desde el dashboard, mostrable e imprimible.
  Escanear → entra directo a la sala. **Si tiene password, el QR lo salta.**
  Acceso vía QR = membresía 24h (igual que password).
- **Nota de seguridad crítica:** el QR debe llevar **token firmado/seguro**, no
  solo `room_id` — si fuera el id desnudo, se podría falsificar y saltar el
  password. Validación server-side.

### Regla de oro de geolocalización (núcleo del producto — spec)
- **Solo personas físicamente dentro del perímetro pueden estar y hablar en el
  chat. Nadie a distancia entra. Presencia física = acceso.**
- Radio máx. **50m** para negocios; ampliable solo por **solicitud al
  super-usuario**.
- Verificación **server-side** (PostGIS / Edge Function), nunca confiar en el
  cliente. El teléfono reporta ubicación; el servidor decide.
- Re-verificación continua mientras estás en la sala.
- **Salida del perímetro:** NO expulsión instantánea. Aviso visible + **cuenta
  regresiva de 5 min FIJO**: "Saliste del área de X. Tienes 5 min para volver o
  saldrás del chat y tus DMs de esta sala se cerrarán."
  - Vuelves dentro → se cancela, sigues normal.
  - No vuelves en 5 min → sales del chat **y** se cierran los DMs ligados a esa
    sala.
  - El margen de 5 min absorbe glitches de GPS naturalmente.
- **Persistencia:** conversación se borra a las 24h. Vuelves <24h → ves
  historial. >24h → se pierde.
- **Refuerzo recomendado (senior):** geo (servidor) + **QR como prueba de
  presencia física**. Sin beacons BLE por ahora (sobre-ingeniería). El GPS solo
  es falsificable (spoofing); el QR ancla presencia real.

### Indicador de usuarios + Heatmap (mapa)
- **Pulse dot rojo** con número de usuarios en el chat, junto al ícono de cada
  negocio/evento. Late suavemente = actividad en vivo.
- El conteo alimenta el **heatmap**: zonas con más gente → más rojas; degradado
  verde→amarillo→naranja→rojo.
- **Estilo visual:** color vivo/saturado en puntos calientes con degradado
  marcado, PERO **calles, edificios y entorno siempre visibles debajo** (blend,
  no opaco). Es pista visual, no cobertura. Toggle on/off + leyenda
  "Tranquilo → Lleno".
- **Conteo siempre agregado y anónimo** (solo el número, nunca quién ni dónde) —
  alineado con regla de privacidad #1.
- **Nota técnica:** `<Heatmap>` de Google es buggy en iOS (estaba diferido por
  esto). Al retomar: calibrar `radius`/`opacity`, o usar overlays `<Circle>`
  cross-platform / capa custom. Resolver el tema iOS.

---

## 3 — DESCARTADO (con razón)

- **Compartir ubicación en vivo** — CHOCA con la regla #1 del Master Spec
  ("Real-time location is NEVER shared… permanently locked"). Eliminado para
  preservar el posicionamiento de privacidad.
- **Llamadas de voz/video** — demasiado pesado (WebRTC/Agora) para la fase
  actual. Quizá más adelante.
- **Reenviar/compartir mensajes a otra sala/DM** — no necesario. (El "Share to
  rooms" del Owner en el flujo de Pin se queda como spec.)
- **Stories ligadas al venue** — las stories quedan como feature social general
  (spec Task 1.11), sin atarse a la sala.
- **Aforo / límite de capacidad por sala** — salas ilimitadas.
- **Slow mode** — no necesario.

---

## 4 — GUARDADO (baja prioridad, reconsiderar luego)

- **Traducción de mensajes ES↔EN** — relevante por mercado bilingüe USA/RD, pero
  no prioridad ahora.
- **Smart replies con IA** — respuestas sugeridas; podría usar la API de
  Anthropic. No prioridad.
- **Búsqueda de mensajes** — poco valor por ser efímero; solo historial reciente.

---

## Notas de integración con el trabajo ya hecho
- El sistema de **membresía temporal (P0-1)** ya construido (`room_members`,
  `verify_room_password` 24h, `can_access_room`) es la base sobre la que se
  montan: sub-salas con password, acceso por QR, y la regla de geo. Buena señal
  de que la dirección del security audit es correcta.
- Varias "features" ya estaban en el spec, solo faltaba implementarlas: pin de
  mensajes, voz, GIFs, read receipts, menciones @, tarjeta de perfil (Tanda 3).

---

## ADENDA (continuación sesión 2026-06-24) — Botón "Llamar al mesero"

**Service call en el panel del "+" del chat** → agendado.
- Agregar un 5º botón al `AttachmentPanel` (hoy: Photo/Voice/GIF/Offer):
  **"Llamar al mesero"** con icono `ti-bell`.
- **Acción simple** (una sola, no tipos de solicitud).
- **Visible para TODOS los usuarios del chat** (a diferencia de Offer, que es
  solo dueño/staff).
- Reorganizar el panel a 2 filas o grid wrap (5 botones se aprietan en 1 fila).

**Comportamiento:**
- Crea registro en `service_calls` (business_id, room_id, user_id,
  status='pending', created_at). VERIFICAR primero si la tabla ya existe (el
  spec la menciona; el dashboard ya tiene alertas de service calls) — no
  duplicar, igual que pasó con blocks/reports.
- Confirmación al usuario: "El mesero fue notificado".
- Alimenta las alertas del dashboard (centro de alertas, Fase 1).
- **Anti-spam**: cooldown ~60s o no duplicar si el usuario ya tiene una llamada
  'pending' en esa sala (evita saturar al staff).
- Micro-decisión pendiente: ¿postear también system message en el chat
  "@usuario llamó al servicio"? (decidir al implementar).
- Nueva prop `onServiceCall` en AttachmentPanelProps, cableada desde
  ChatRoomScreen. Lógica en `services/serviceCalls.ts` o ChatRoomScreen.

**Nota:** ya estaba como concepto en el spec (las service calls alimentan las
alertas del dashboard). Lo que falta es CABLEARLO en el panel del chat.
