# JChat Web (acceso por QR) — Plan del proyecto

> Sesión de diseño 2026-06-25. Versión web del chat de JChat, accesible
> escaneando un QR en el local, sin instalar la app. Documento vivo.
> ESTADO: Fases 1 y 2 COMPLETAS y verificadas. Fase 3 (comprar) pendiente.

---

## 1 — Qué es

Un cliente entra físicamente a un negocio, ve un QR (mesa, pared, sub-sala), lo
escanea, y **sin instalar la app** entra a la versión web del chat de ese lugar:
chatea, compra, y llama al mesero — todo en el navegador.

**No incluye:** mapa, descubrimiento de lugares. El QR lleva directo a la(s)
sala(s). Es chat directo, no navegador de venues.

**Valor:** elimina la fricción de instalar la app.

---

## 2 — Decisiones de producto (cerradas)

| Tema | Decisión |
|---|---|
| **Geolocalización** | El QR ES la prueba de presencia. La web NO pide GPS. |
| **Token del QR** | Token opaco por sala, permanente. DEUDA: migrar a rotativo/firmado con tráfico real. |
| **Identidad** | Login obligatorio con cuenta JChat existente (mismo Supabase Auth). |
| **Modelo de QR** | Cada sala tiene su QR. Principal -> principal. Sub-sala/mesa -> principal + esa sub-sala (acumulativa). |
| **QR + password** | El QR de una sub-sala protegida SALTA el password (QR ya es prueba de presencia). |
| **Donde vive** | Seccion de rutas /c/[token] dentro del web/ actual (Next.js), reutilizando auth/Supabase/realtime. |
| **Tema visual** | El chat web lee chat_theme_id de la sala y aplica el tema (mismos CHAT_THEMES que el movil). |

---

## 3 — Estado de implementación

### Fase 1 — Acceso por QR + chat - COMPLETA
- **Pieza 1 — BD** (migracion 026, ce6f363): columna rooms.qr_token (token opaco,
  trigger auto-asigna, backfill). RPC resolve_room_qr(token) (preview publico) y
  join_room_via_qr(token) (membresia 24h, sub-sala tambien une a la principal,
  salta password). Reutiliza room_members + can_access_room de P0-1.
- **Pieza 2 — ruta /c/[token]** (6c5355c): pagina publica que resuelve el token,
  login con retorno (?next/?redirect con guardia anti open-redirect), boton join.
- **Pieza 3a — chat texto** (5db0a17): cargar mensajes, enviar, realtime, gate
  por membresia (server-side via RLS can_access_room).
- **Pieza 3b — identidad** (dbfa52e): badges Dueno/Staff (getBusinessRoleMap
  portado), incognito (privacidad ESTRUCTURAL: authorRole=null si incognito).
- **Pieza 3c — fotos** (82bee35): subir a post-media + ver imagenes.

### Fase 2 — Llamar al mesero - COMPLETA
- (579bddb): boton campana -> sheet (mesa + nota) -> insert service_calls
  type=waiter status=pending. Cooldown cliente + server (trigger existente).
  El dashboard del dueno y el badge del Sidebar ya reciben en realtime.

### Mejoras post-fase
- **Bug fotos cruzadas** (de5b891): movil insertaba type='photo', web type='image'
  -> no se veian entre si. Arreglado: web lee 'photo' OR 'image', escribe 'photo'.
  Estandar unificado = 'photo'.
- **Panel "+"** (de5b891 -> 0ad9d3d -> 3ea70b1): agrupado, luego rediseñado
  horizontal identico al movil (Foto/Menu/Servicio/Match, Menu/Match en "pronto"),
  luego ancho completo (autosize de tarjetas).
- **Tema de sala** (6990ff3): web/lib/chatThemes.ts (15 temas, copia exacta del
  movil) + getChatTheme. El chat web aplica bg/burbujas/acentos/input segun
  chat_theme_id de la sala.

### Fase 3 — Comprar - PENDIENTE
La mas compleja. Menu + carrito + checkout de Stripe EN WEB (integracion nueva,
distinta de la app). El boton "Menu" del panel "+" ya existe como "pronto",
listo para activarse. Atribucion de orden al usuario logueado.

---

## 4 — Deudas conscientes (anotadas, no bloquean)

- **Token QR permanente** -> migrar a rotativo/firmado cuando haya trafico.
- **Dos esquemas de QR coexisten**: web/services/qr.ts (Task 2.8) genera URLs
  /r/{slug}/{slug}, pero la Fase 1 usa /c/{token}. Reconciliar antes de
  imprimir QRs reales (recomendado: el /c/token, el seguro y verificado).
- **type 'image' en datos viejos**: la web lee 'photo' Y 'image' por los mensajes
  de prueba viejos; cuando se limpien, podria leer solo 'photo'.
- **Open-redirect //**: la guardia del login (rawNext.startsWith('/')) no cubre
  //evil.com. Endurecer a startsWith('/') && !startsWith('//') para produccion.
- **Verificacion visual de badges en web**: la logica esta, pero falta ver un
  "Dueno"/"Staff" pintado (requiere un 2o usuario staff escribiendo).

---

## 5 — Lo que NO incluye este proyecto

- Mapa / heatmap / descubrimiento de lugares.
- Reacciones / pin avanzado (no existen en movil aun).
- Generacion de QR desde dashboard (los QR son por sala; ver deuda de qr.ts).
- App instalable (es web pura).

---

## 6 — Infraestructura reutilizada (no reconstruir)

- room_members + verify_room_password + can_access_room (P0-1, migracion 019).
- Supabase Auth (mismas cuentas que la app).
- web/lib/supabase.ts (browser client), createSupabaseServerClient (server).
- CHAT_THEMES (portado del movil a web/lib/chatThemes.ts).
- getBusinessRoleMap (portado del movil a web/lib/roleBadges.ts).
- service_calls + trigger de cooldown + dashboard de servicio (Tanda C).
