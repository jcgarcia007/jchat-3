# Cocina — estados por plato y terminal del cocinero (2026-07-20)

## Qué existe hoy (verificado por reconocimiento)
- El **KDS** (`web/app/dashboard/kds`) trabaja con **`orders.status`** del pedido ENTERO. Tablero
  de 2 columnas (Pending | Preparing); al marcar `ready` el pedido desaparece del tablero.
- **`order_items.item_status` es una columna MUERTA**: es `text` con default `'cooking'`, sin
  CHECK, y **nadie escribe nunca otro valor**. Los dos únicos escritores son inserts de
  service_role (el webhook de Stripe y `create_waiter_order`), y ambos ponen `'cooking'`.
- **`order_items` tiene RLS con SOLO políticas de SELECT.** Ningún cliente puede escribir
  `item_status` bajo ninguna circunstancia. (El `grant update (item_status)` de la migración 080
  es inerte por sí solo: sin política, RLS deniega.)
- **`orders.status` solo lo puede cambiar el DUEÑO** (única política UPDATE). Un empleado no.
- El **KDS vive dentro del dashboard**, que exige plan business/pro → **un cocinero empleado no
  puede entrar**. Hoy la cocina solo funciona si el dueño en persona toca el tablero.
- Ciclo actual de `orders.status`: pending → confirmed → preparing → ready → delivered
  (+cancelled, refunded). Matices reales: **`pending` nunca ocurre** (todo nace en `confirmed`),
  **`delivered` no lo escribe nadie**, y `refunded` solo el webhook.

## 🐛 Bug en vivo detectado
La app móvil muestra al cliente un badge por plato: `item_status === 'ready' ? "Listo" :
"Cocinando"`. Como nada escribe `'ready'`, **el cliente ve "Cocinando" para siempre**, incluso
con el pedido entregado. Juan decidió ARREGLARLO (que muestre el estado real), no quitarlo.

## Decisiones de Juan (2026-07-20)
- **Tres estados POR PLATO**: **Pendiente · Preparando · Listo para recoger**.
- **El estado del PEDIDO se DERIVA de sus platos** (no se mantiene a mano en dos sitios):
  · alguno preparando → el pedido está preparando
  · todos listos → el pedido está listo
  Motivo: `orders.status` lo siguen usando el tablero, la lista de pedidos y —lo importante— la
  **pantalla de seguimiento del cliente en el móvil**. Sin derivación, esa barra quedaría huérfana.
- **Los mueve un COCINERO EMPLEADO, con su propia pantalla**, igual que el mesero tiene la suya.
  No el dueño desde el dashboard.

## Edición de pedidos (decisión de Juan, 2026-07-20)
Un pedido se puede EDITAR mientras la cocina no lo haya empezado.
- **El bloqueo es a nivel de PEDIDO, no de plato**: en cuanto CUALQUIER plato del pedido pasa a
  "preparando", **todo el pedido queda bloqueado**, incluidos los platos que sigan pendientes.
  Motivo: si la cocina ya está trabajando ese ticket, cambiarle cosas por debajo genera errores.
  Consecuencia asumida: si empiezan el entrante, ya no se puede quitar el postre de ese pedido.
- **Qué se puede modificar** mientras el pedido está editable: cantidad, quitar el plato, y
  cambiar sus modificadores.
- **Quién puede**: cualquier mesero (con acceso a esa mesa) y el dueño siempre.
- **Consecuencia de diseño:** un plato recién enviado nace en **"pendiente"**, no en
  "preparando" — si naciera preparando, nunca habría ventana para editar.
- Al modificar, los importes se recalculan SIEMPRE en el servidor (misma disciplina que al crear).

## Consecuencias técnicas conocidas
- Hace falta una **RPC SECURITY DEFINER** para que un empleado cambie `item_status`, acotada a los
  pedidos de SU negocio. Abrir RLS de `order_items` a `authenticated` daría más de lo que se
  quiere. Es el patrón ya usado en `open_tab_on_table` y `attach_order_to_tab`.
- Hace falta decidir la **migración de `'cooking'`**: los registros existentes están todos en ese
  valor y no hay CHECK. Hay que mapearlo a uno de los tres nuevos y añadir el CHECK.
- La **superficie del cocinero** repite el problema que ya resolvimos para el mesero: ruta fuera
  del gate de plan + gate de empleado + permisos acotados (ver docs/TERMINAL_MESERO.md, migración
  077 y la ruta /terminal como precedente).
- El **badge del móvil** empezará a decir la verdad en cuanto los estados se muevan de verdad.

## Fases propuestas
- **K1 — Modelo y permisos:** valores de estado + CHECK + migración de `'cooking'` + RPC para que
  un empleado marque un plato + derivación del estado del pedido. Sin UI.
- **K2 — Terminal del cocinero:** ruta propia fuera del gate, con gate de empleado, mostrando los
  platos pendientes de su negocio y permitiendo moverlos entre los tres estados.
- **K3 — Ajustes de lo existente:** el KDS del dashboard y la lista de pedidos pasan a reflejar
  los estados por plato; el badge del móvil muestra el estado real.

## Pendiente de decidir
- ¿El cocinero ve TODOS los platos del negocio, o filtrados de alguna forma (por categoría,
  por estación)?
- ¿El estado `delivered` (que hoy nadie escribe) lo marca el mesero al entregar?
- ¿Qué pasa con `pending` a nivel de pedido, que hoy es un estado fantasma?
