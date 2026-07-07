# JChat 3.0 — Backlog de Dashboard / POS (sesión de diseño 2026-06-24)

> Decisiones de producto del dashboard/POS, tomadas tras benchmarking contra los
> líderes del mercado 2026 (Toast, Square, Lightspeed, Clover, TouchBistro).
> Cruzado contra JCHAT_3.0_MASTER_SPEC y DEV_PLAN para no duplicar lo ya
> diseñado.

---

## Posicionamiento (contexto del benchmarking)

JChat NO compite con Toast/Square en profundidad de POS puro — y no debería.
Su diferenciador es **POS ligero pegado a un chat de proximidad social**, que
ningún líder tiene. Competencia real: "un bar que usa Square para cobrar y nada
para conectar con sus clientes". Objetivo: POS suficientemente bueno + el
superpoder social.

**Ventajas que JChat ya tiene sobre el mercado:**
- Modelo subscription-only SIN comisión por transacción (Toast cobra 2.49%+).
- KDS nativo (Toast lo vende como ventaja; JChat ya lo tiene).
- POS dentro de una sala social viva (nadie más lo tiene).
- Canal de chat + push > email marketing para su caso de uso.

---

## 1 — FEATURES NUEVAS AGENDADAS (cierran huecos del mercado)

### Menú / pedidos
- **Modificadores de menú COMPLETOS** — quitar ingredientes, agregar con precio,
  y variantes obligatorias (grupos de selección requerida: tamaño, término,
  tipo de leche, etc.). Estándar en Toast/Square; sin esto el menú es rígido.
  - Estructura: `modifier_groups` + `modifier_options` ligados a `menu_items`,
    con reglas (mín/máx selecciones, obligatorio/opcional, delta de precio).
  - **Recálculo de precio SERVER-SIDE** (alineado con P0-2 del security audit).

- **Split checks COMPLETO** — las 3 formas: equitativa (÷N), por ítem (cada
  quien lo suyo), por monto (cantidad libre). Crítico en bares.
  - Cálculos server-side.
  - El split "por ítem" se integra con los usuarios del chat (ya sabes quién
    pidió qué) — más fluido que un POS tradicional. Diferenciador.

- **Propinas en checkout** — % sugeridos (15/18/20%) + monto libre. Estándar en
  USA. Cálculo server-side, entra en el total que cobra Stripe.
  - Tip pooling al staff: FUERA por ahora (añadir si lo piden).

- **QR por mesa (scan-to-order)** — escanea el QR de tu mesa → menú con la mesa
  identificada → pides desde el asiento. Encaja con order type "Table" y el
  sistema de QR existente.

### Floor plan (con giro social propio de JChat)
- **Floor plan nivel medio** — el dueño sube una IMAGEN del plano (no editor de
  arrastrar mesas). Zonas/mesas marcadas que el staff puede etiquetar:
  ocupada / libre / pidió / lista para pagar.
  - **Toggle del dueño** para mostrarlo también a usuarios normales como
    **vitrina de descubrimiento** del espacio (zona VIP, terraza, barra) → gancho
    para atraer clientes. Uso original que ningún POS tradicional tiene.

### Reportes / datos
- **Exportación de reportes a CSV y PDF** — ventas, pedidos. Para contabilidad e
  impuestos. (Square cojea aquí; oportunidad.)

### Alertas
- **Centro de alertas POR FASES y configurable** (con toggles para evitar fatiga):
  - Fase 1 (ya casi en spec): pedidos + service calls.
  - Fase 2 (alto valor, bajo costo): reportes de chat + fallo de pago de
    suscripción.
  - Fase 3 (cuando el POS madure): stock bajo + reservas + check-ins.

---

## 2 — DECISIÓN GRANDE PENDIENTE

- **Modo offline** — NO agendado para ahora, decisión consciente.
  - Es el estándar de oro del mercado (Toast/TouchBistro lo venden como su mayor
    fortaleza): poder cobrar/tomar pedidos sin internet.
  - PERO: es un proyecto técnico serio (cola de sync local, resolución de
    conflictos, pagos diferidos) y choca con la arquitectura cloud-first
    (Supabase Realtime).
  - Matiz JChat: la app es social-first y ya necesita internet para el chat
    (presencia, mensajes en vivo). Si no hay red, la experiencia central ya está
    caída. → menos crítico que para un POS puro.
  - Reconsiderar cuando haya tracción y dueños reales pidiéndolo.

---

## 3 — HUECOS DEL MERCADO NO AGENDADOS (para tier Pro / futuro)

- **Recipe costing / ingredient tracking** — Toast/Lightspeed lo tienen, Square
  no. Avanzado, para reducir desperdicio. Candidato a tier Pro.
- **Training mode** — modo para entrenar empleados sin tocar datos reales.
  Square no lo tiene; menor pero suma.

---

## Ya estaba en el spec (validado, no re-preguntar)
- Room Manager con QR, password toggle, TTL toggle, notify toggle por sala
  (Task 2.7). → valida TTL configurable, QR por sala y passwords de la sesión
  de chat.
- Roles de empleado granulares: Manager / Cashier / Waiter / KDS / Analyst.
- KDS, reservations, loyalty, offers, analytics Pro, multi-location.
- Verificación 3 pasos (Stripe Identity + selfie+code + Twilio SMS).
- Super Admin panel con roles y add-on permissions.
- Subscription tiers: Regular (free) / Verified ($1.99) / Business ($49) /
  Business Pro ($99).
- Payouts configurables (Daily/Weekly/Monthly) vía Stripe Connect.

---

## Nota transversal de seguridad
TODOS los cálculos de dinero nuevos (modificadores, split, propina) deben
recalcularse SERVER-SIDE, nunca confiar en montos del cliente. Es el mismo
principio del P0-2/P0-3 del security audit. Esto es bloqueante para producción.
