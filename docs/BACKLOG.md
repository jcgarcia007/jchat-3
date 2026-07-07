# JChat 3.0 — BACKLOG unificado y priorizado

> Fusión de `JCHAT_CHAT_FEATURES_BACKLOG.md` + `JCHAT_DASHBOARD_POS_BACKLOG.md` +
> la Fase 3 pendiente de `WEB_CLIENT_PLAN.md` (consolidación FASE B, julio 2026).
> Los tres originales viven en `docs/archive/`. Fuente de producto: `docs/SPEC.md`.
>
> **Prioridad:** **P0** bloqueante para producción/dinero · **P1** alto valor ·
> **P2** polish importante · **P3** nice-to-have. `✅` = ya implementado (referencia).

---

## 1 — CHAT & MENSAJERÍA

### Pendiente inmediato (esta sesión de julio)
- **P1 — Chat Fase 2: TTL configurable por sala.** El dueño define cuánto duran los
  mensajes (evento ~2h vs negocio ~24h). El cron de limpieza debe **leer el TTL por
  sala**, no un valor global.
- **P1 — Chat Fase 3: badge de "no leídos" por usuario/sala.** Contador de mensajes
  nuevos **no expirados** por sala, por usuario.

### Mensajería — features nuevas (no estaban en el spec)
- **P2 — Reacciones a mensajes** — long-press en burbuja, emojis rápidos, agrupados con
  contador, en vivo vía Realtime. Tabla `message_reactions`. Efímeras (mueren con el mensaje).
- **P2 — Responder/citar (reply)** — deslizar burbuja, cita compacta arriba. Columna
  `reply_to_message_id`.
- **P2 — Indicador "escribiendo…"** — vía Supabase Realtime Presence. Límite de nombres en
  salas llenas para evitar ruido.
- **P2 — Editar / borrar mensajes propios** — usuario normal sobre los suyos ("editado" /
  "mensaje eliminado"). Owner/Mod ya tiene su borrado por spec.
- **P3 — Mensajes/fotos autodestructivos** — "ver una vez" o temporizado, más allá del TTL
  de sala. Privacidad Gen Z.
- **P2 — Menciones con @** — autocompletar usuarios de la sala, resaltado + push (setting
  "quién puede mencionarme" ya en spec 13).
- **P2 — GIFs / stickers** — integración Giphy/Tenor (reemplaza "coming soon").
- **P2 — Mensajes de voz** — grabar con long-press, subir a Storage (como fotos), reproductor
  con waveform (spec 6.4).
- **P3 — Read receipts SOLO en DMs** — nunca en salas grupales (evita lo invasivo; setting en spec 13).
- **P3 — Encuestas / polls** — SOLO dueño/ayudantes/asistentes a eventos crean; usuarios solo
  votan. Mismo patrón de permisos que ofertas.
- **P2 — Gifting celebratorio visible en sala** — al enviar regalo, tarjeta/anim "🎁 X envió Y
  a Z" visible para la sala (FOMO/ambiente). Extiende Gift del spec 7.4.

### Moderación / control
- **P1 — Pin de mensajes: COMPLETAR + fix seguridad P1-3** — feature a medias
  (`pinned_messages`, `PinnedBanner`). Mover delete/unpin a **RPC server-side** con checks de
  permisos (lo pide el security audit). Spec 6.3 / Task 2.5.
- **P2 — Control de notificaciones por sala** — todo / solo menciones @ / silenciar. Sobre
  `user_personal_mutes` (Tanda 3).
- **P3 — Moderación con IA** — capa proactiva sobre `blocks`/`reports` (reactivos): filtra
  spam, abuso, phishing antes de aparecer.
- **P3 — Reglas / código de conducta por sala** — configurable por el dueño, visible al entrar.
- **P3 — Mensaje de bienvenida por sala** — configurable por el dueño desde dashboard, al entrar por primera vez.
- **✅ Insignias de rol en el chat** (Dueño/Staff) — hecho en web; portar/confirmar en móvil.

### Negocio / venue
- **P2 — Anuncios "EN VIVO / ahora mismo"** — banner efímero del negocio (karaoke empieza,
  hora feliz 30 min). Distinto de ofertas (comerciales/persistentes).

### Modo incógnito — precisiones al spec (6.x / 13) — PRESERVAR
- Toggle + **nickname** obligatorio al entrar.
- **Avatar animado aleatorio** (caricatura/animal/muñeco) en vez de foto real; asignado al
  azar, **estable durante la sesión** (no cambia al recargar). Mantiene el conteo visual
  correcto (10 usuarios = 10 avatares).
- Puede **hablar** normalmente con su nickname. Su **perfil real queda oculto**.
- Él puede tocar perfiles de otros pero **solo ve una vista breve/limitada**.
- Incentivo: para ver perfiles completos e interactuar de verdad, debe entrar con su usuario real.
- **Moderación:** aunque sea anónimo de cara al público, el sistema SÍ sabe internamente quién
  es (para que Report/Block/moderación-IA funcionen).

### Modelo de salas (amplía spec — confirmado en sesión) — PRESERVAR
- **Sala principal** por negocio, nombre personalizable, pertenencia automática al entrar.
- **Sub-salas** del mismo negocio, en **scroll horizontal bajo los perfiles**. El dueño las crea.
- **Membresía acumulativa:** entrar a una sub-sala NO te saca de la principal — quedas en ambas.
- Sub-salas con **password opcional** (infra P0-1: `room_members` + `verify_room_password` 24h).
- **QR por sala** (principal y sub), mostrable/imprimible. Escanear → entra directo. **Si tiene
  password, el QR lo salta.** Acceso vía QR = membresía 24h.
- **🔒 Seguridad crítica:** el QR debe llevar **token firmado/seguro**, no `room_id` desnudo
  (si no, se falsifica y salta el password). Validación server-side.
- **✅ (base ya construida):** sub-chats in-place + presencia múltiple + QR por sala — hecho
  esta sesión (web + móvil) sobre `can_access_room`.

### Web (acceso por QR, `/c/[token]`)
- **✅ Fase 1 — Acceso por QR + chat** (texto, realtime, identidad, fotos) — COMPLETA.
- **✅ Fase 2 — Llamar al mesero** — COMPLETA.
- **P1 — Fase 3: Comprar (checkout web).** La más compleja: **menú + carrito + checkout de
  Stripe EN WEB** (integración nueva, distinta de la app). El botón "Menú" del panel "+" ya
  existe como "pronto", listo para activarse. **Atribución de orden al usuario logueado.**

### Descartado con razón (chat) — PRESERVAR
- **Compartir ubicación en vivo** — choca con la regla #1 del Master Spec (ubicación en
  tiempo real NUNCA se comparte). Eliminado para preservar el posicionamiento de privacidad.
- **Llamadas de voz/video** — demasiado pesado (WebRTC/Agora) para la fase actual.
- **Reenviar/compartir mensajes a otra sala/DM** — no necesario (el "Share to rooms" del Owner
  en Pin se queda como spec).
- **Stories ligadas al venue** — quedan como feature social general (Task 1.11), sin atarse a la sala.
- **Aforo / límite de capacidad por sala** — salas ilimitadas.
- **Slow mode** — no necesario.

### Guardado — baja prioridad, reconsiderar luego
- **Traducción de mensajes ES↔EN** — relevante por mercado bilingüe USA/RD, no prioridad ahora.
- **Smart replies con IA** — respuestas sugeridas (posible API de Anthropic). No prioridad.
- **Búsqueda de mensajes** — poco valor por ser efímero; solo historial reciente.

---

## 2 — POS & DASHBOARD

> Posicionamiento: JChat NO compite en profundidad de POS puro con Toast/Square. Su
> diferenciador es **POS ligero pegado a un chat de proximidad social** (nadie más lo tiene).
> Ventajas ya presentes: subscription-only SIN comisión por transacción, KDS nativo, POS dentro
> de una sala social viva, canal chat+push > email marketing.

### Menú / pedidos
- **✅ Modificadores de menú COMPLETOS** — grupos de opciones (min/max, obligatorio/opcional,
  delta de precio). Hecho (migración 032, `modifier_groups` + bridge, 4 pasos). Recálculo
  server-side sigue atado a P0-2.
- **P1 — Split checks COMPLETO** — las 3 formas: equitativa (÷N), por ítem, por monto libre.
  Cálculos **server-side**. El split "por ítem" se integra con los usuarios del chat (ya sabes
  quién pidió qué) → diferenciador vs POS tradicional.
- **P1 — Propinas en checkout** — % sugeridos (15/18/20%) + monto libre; cálculo server-side,
  entra en el total que cobra Stripe. (Tip pooling al staff: FUERA por ahora.)
- **P2 — QR por mesa (scan-to-order)** — escanea el QR de tu mesa → menú con la mesa
  identificada → pides desde el asiento. Encaja con order type "Table" + el sistema de QR.

### Floor plan (giro social propio)
- **P2 — Floor plan nivel medio** — el dueño sube una **imagen** del plano (no editor de
  arrastrar mesas). Zonas/mesas etiquetables por el staff: ocupada / libre / pidió / lista para
  pagar. **Toggle del dueño** para mostrarlo a usuarios normales como **vitrina de
  descubrimiento** (zona VIP, terraza, barra) → gancho para atraer clientes. Uso original que
  ningún POS tradicional tiene.

### Reportes / datos
- **P2 — Exportación de reportes a CSV y PDF** — ventas, pedidos. Para contabilidad e impuestos.

### Alertas
- **Centro de alertas POR FASES y configurable** (toggles para evitar fatiga):
  - **P1 — Fase 1:** pedidos + service calls (casi en spec; service calls ✅ cableado).
  - **P2 — Fase 2:** reportes de chat + fallo de pago de suscripción.
  - **P2 — Fase 3:** stock bajo + reservas + check-ins (cuando el POS madure).

### Decisión grande pendiente
- **Modo offline** — **NO agendado** (decisión consciente). Estándar de oro del mercado
  (Toast/TouchBistro), pero es un proyecto técnico serio (cola de sync local, resolución de
  conflictos, pagos diferidos) y choca con la arquitectura cloud-first (Supabase Realtime).
  Matiz JChat: la app es social-first y ya necesita internet para el chat → menos crítico.
  **Reconsiderar** con tracción y dueños reales pidiéndolo.

### Huecos de mercado NO agendados (tier Pro / futuro)
- **P3 — Recipe costing / ingredient tracking** — reduce desperdicio (Toast/Lightspeed lo
  tienen, Square no). Candidato a tier Pro.
- **P3 — Training mode** — entrenar empleados sin tocar datos reales.

### Ya en el spec (validado, no re-preguntar)
- Room Manager con QR, password toggle, TTL toggle, notify toggle por sala (Task 2.7).
- Roles de empleado granulares: Manager / Cashier / Waiter / KDS / Analyst.
- KDS, reservations, loyalty, offers, analytics Pro, multi-location.
- Verificación 3 pasos (Stripe Identity + selfie+code + Twilio SMS).
- Super Admin panel con roles y add-on permissions.
- Subscription tiers: Regular (free) / Verified ($1.99) / Business ($49) / Business Pro ($99).
- Payouts configurables (Daily/Weekly/Monthly) vía Stripe Connect.

### Botón "Llamar al mesero" (adenda chat 2026-06-24)
- **✅ Implementado** (web Fase 2 + dashboard/badge en realtime). Referencia del diseño original:
  5º botón en el `AttachmentPanel` con `ti-bell`, acción simple, **visible para TODOS** los
  usuarios (a diferencia de Offer que es solo dueño/staff), insert en `service_calls`
  (status=pending), confirmación "El mesero fue notificado", **anti-spam** cooldown ~60s / no
  duplicar 'pending' por sala. Micro-decisión abierta: ¿postear system message "@usuario llamó
  al servicio"? (decidir si se reactiva en móvil).

---

## 3 — MAPA

### Indicador de usuarios + Heatmap — PRESERVAR
- **Pulse dot rojo** con número de usuarios en el chat, junto al ícono de cada negocio/evento.
  Late suavemente = actividad en vivo.
- El conteo alimenta el **heatmap**: más gente → más rojo; degradado verde→amarillo→naranja→rojo.
- **Estilo visual:** color vivo/saturado en puntos calientes con degradado marcado, PERO
  **calles, edificios y entorno siempre visibles debajo** (blend, no opaco). Es pista visual,
  no cobertura. Toggle on/off + leyenda "Tranquilo → Lleno".
- **Conteo siempre agregado y anónimo** (solo el número, nunca quién ni dónde) — regla de
  privacidad #1.
- **🐛 Nota técnica:** `<Heatmap>` de Google es **buggy en iOS** (estaba diferido por esto). Al
  retomar: calibrar `radius`/`opacity`, o usar overlays `<Circle>` cross-platform / capa custom.

### Regla de oro de geolocalización (núcleo del producto) — PRESERVAR
- **Solo personas físicamente dentro del perímetro pueden estar y hablar en el chat. Nadie a
  distancia entra. Presencia física = acceso.**
- Radio máx. **50m** para negocios; ampliable solo por **solicitud al super-usuario**.
- Verificación **server-side** (PostGIS / Edge Function), nunca confiar en el cliente. El
  teléfono reporta ubicación; el servidor decide. Re-verificación continua en la sala.
- **Salida del perímetro:** NO expulsión instantánea. Aviso + **cuenta regresiva de 5 min
  FIJO**: "Saliste del área de X. Tienes 5 min para volver o saldrás del chat y tus DMs de esta
  sala se cerrarán." Vuelves → se cancela. No vuelves en 5 min → sales del chat **y** se cierran
  los DMs ligados a esa sala. El margen de 5 min absorbe glitches de GPS.
- **Persistencia:** conversación se borra a las 24h. Vuelves <24h → ves historial. >24h → se pierde.
- **Refuerzo (senior):** geo (servidor) + **QR como prueba de presencia física**. Sin beacons
  BLE por ahora (sobre-ingeniería). El GPS solo es falsificable (spoofing); el QR ancla presencia real.

---

## 4 — DEUDA & SEGURIDAD

- **P0 — Recálculo server-side de TODO el dinero nuevo** (modificadores, split, propina).
  Nunca confiar en montos del cliente. Es el principio de **P0-2 / P0-3** del security audit.
  **Bloqueante para producción.** (Ver `docs/SECURITY_AUDIT.md`.)
- **Deudas del web client** (`/c/[token]`):
  - Token QR **permanente** → migrar a **rotativo/firmado** cuando haya tráfico.
  - **Dos esquemas de QR coexisten**: `web/services/qr.ts` (Task 2.8) genera `/r/{slug}/{slug}`,
    pero la Fase 1 usa `/c/{token}`. Reconciliar antes de imprimir QRs reales (recomendado: el
    `/c/token`, el seguro y verificado).
  - **Open-redirect `//`**: la guardia del login (`rawNext.startsWith('/')`) no cubre
    `//evil.com`. Endurecer a `startsWith('/') && !startsWith('//')` para producción.
  - **type 'image' en datos viejos**: la web lee `'photo'` Y `'image'` por mensajes de prueba
    viejos; al limpiarlos, podría leer solo `'photo'`.
  - **Verificación visual de badges** Dueño/Staff en web (la lógica está; falta un 2º usuario staff).

---

## Notas de integración (contexto)
- La **membresía temporal (P0-1)** ya construida (`room_members`, `verify_room_password` 24h,
  `can_access_room`) es la base de: sub-salas con password, acceso por QR, y la regla de geo.
- Varias "features" ya estaban en el spec, solo faltaba implementarlas: pin de mensajes, voz,
  GIFs, read receipts, menciones @, tarjeta de perfil (Tanda 3).
- Nota transversal: TODOS los cálculos de dinero nuevos deben recalcularse **server-side** — es
  bloqueante para producción (mismo principio del P0-2/P0-3).
