# Mesas y Taps — modelo de producto (2026-07-18)

## Concepto

Una **MESA** (tabla `tables`, migración 069) puede tener varias cuentas simultáneas llamadas
**TAPS**. Cada tap es la cuenta de una persona en esa mesa. Los pedidos se atan al tap, y el tap
a la mesa.

## Reglas decididas por Juan

### Identidad — sin cuenta JChat obligatoria

El cliente **NO** necesita registrarse. Escanea el QR de la mesa, pide, y su orden entra en la
mesa **cuando paga**: tras el pago se le pide el **nombre de su tap**, y en ese momento la orden
pasa a las órdenes de la mesa.

Implementación acordada: **login anónimo de Supabase**. Cada escaneo obtiene una identidad real
e invisible (`auth.uid()`), cuya sesión vive en el dispositivo. Así, al pedir otra ronda vuelve
automáticamente a su mismo tap, sin escribir el nombre otra vez. La privacidad se expresa con
**RLS sobre ese uid**, no con código del cliente.

_(Alternativa descartada: tokens de dispositivo propios — más código y más frágil.)_

### Dos formas de crear un tap

1. **Cliente (PREPAGO):** pide → paga → nombra su tap → el tap aparece en la mesa.
2. **Mesero (POSTPAGO):** crea el tap desde su pantalla y toma las órdenes como siempre; se cobra
   al final (efectivo/tarjeta). Estos taps los pueden ver los usuarios que escaneen el mismo QR.

### Visibilidad / privacidad

Transparencia total **dentro** de la mesa, pero solo para quien participa: **solo ve los taps de
una mesa quien ya tiene un tap en esa mesa** (más el mesero asignado y el admin). Motivo: el QR
está pegado físicamente en la mesa y cualquier extraño podría escanearlo; sin esta regla se
filtrarían las cuentas de los clientes.

### Meseros

El administrador **asigna mesas a meseros**. Un mesero solo puede operar (crear taps, añadir
órdenes, cobrar) sobre las mesas que tiene asignadas. Un mesero de otra mesa **no** puede tocar
esas cuentas.

### Ciclo de vida de la mesa

La mesa se **cierra sola** cuando todos sus taps están pagados. Además, el **mesero puede marcar
pagado / cerrar cualquier tap manualmente** (salida necesaria para el postpago en efectivo y para
el cliente que se va sin pagar; si no, la mesa quedaría bloqueada para siempre).

### Subchat por mesa (opcional)

Al crear una mesa, el administrador decide si le crea un **subchat**. El QR de la mesa ancla a los
usuarios a ese subchat. Debe **reusar el sistema de salas/sub-salas y QR firmados que ya existe**
en JChat (no construir uno nuevo).

### Histórico

Los pedidos anteriores a este modelo usan `orders.table_label` como **texto libre** con valores
numéricos (`"1"`, `"4"`, `"5"`…) y **no se migran**. De aquí en adelante los pedidos se atan por
**ID** al tap (y por tanto a la mesa). `table_label` queda como dato heredado.

## Fases de implementación

- **B1 — Modelo de datos:** migración (`table_tabs`, `orders.tab_id`, asignación mesero↔mesa) +
  RLS + activar login anónimo de Supabase. **Base de todo.**
- **B2 — Panel del mesero:** tocar una mesa → ver sus taps, los platos de cada uno, el estado por
  plato (`order_items.item_status`) y los totales (por tap y de la mesa).
- **B3 — Flujo del cliente:** QR → pedir → pagar → nombrar tap → ver la mesa.
- **B4 — Asignación de meseros** (pantalla de admin).
- **B5 — Subchat por mesa** (reusando salas + QR existentes).

## Datos que YA existen (verificado en BD)

- **`tables`** (migración 069): `id`, `business_id`, `label`, `floor`, `seats`, `sort`,
  `is_active`. RLS activo.
- **`orders`**: `business_id`, `status`
  (`pending`/`confirmed`/`preparing`/`ready`/`delivered`/`cancelled`), `total_cents`,
  `created_at`, `table_label` (heredado, texto libre).
- **`order_items`**: `order_id`, `menu_item_id`, `qty`, `price_cents`, `notes`,
  `special_instructions`, `options` (jsonb, modificadores), `item_status` (estado **por plato**).
- Hoy hay **0 usuarios anónimos** en `auth.users` (el login anónimo no está activado todavía).

## Limpieza de usuarios anónimos (migración 074)

Cuando se active el login anónimo, cada escaneo de QR crea una fila en `auth.users`
(`is_anonymous = true`). Para que los anónimos abandonados no se acumulen, un **job diario de
pg_cron** (`cleanup-anon-users`, `0 5 * * *` UTC) llama a `public.cleanup_anonymous_users()`.

**Dos guardas** — nunca borra a alguien que aún importa:
1. **Inactivo > 24h** — usa `last_sign_in_at` (o `created_at` si es null), así un invitado que
   volvió hoy NO se borra.
2. **Sin tap ABIERTO** — quien tiene un tap `open` podría deber dinero o seguir en la mesa.

**Qué SOBREVIVE** al borrar el usuario (por `ON DELETE SET NULL` en los FK existentes):
- **Pedidos** (`orders.user_id → NULL`) — el historial de ventas no se toca.
- **Taps** (`table_tabs.owner_uid/created_by/closed_by → NULL`).
- **Mensajes** (`messages.user_id → NULL`).

**Qué se borra:** el `auth.users` y su perfil `public.users` (CASCADE), más filas irrelevantes
pasadas 24h (`room_members`, `check_ins`, `notifications`, `pending_order_carts`, `story_views`…).

La función es SECURITY DEFINER y **solo la ejecuta el cron** (postgres): revocado el EXECUTE de
`public`, `anon` y `authenticated` — ninguna capa de la app puede invocarla.

## Pendiente de decidir (no bloquea B1)

- Qué valores exactos usa `item_status` en el flujo (hoy solo se observa `'cooking'`).
- Si un tap puede tener varias personas (compartir cuenta) o es siempre 1 persona = 1 tap.
- Si el mesero puede mover una orden de un tap a otro.
