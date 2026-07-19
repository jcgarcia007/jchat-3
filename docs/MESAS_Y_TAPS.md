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

## Pendiente de decidir (no bloquea B1)

- Qué valores exactos usa `item_status` en el flujo (hoy solo se observa `'cooking'`).
- Si un tap puede tener varias personas (compartir cuenta) o es siempre 1 persona = 1 tap.
- Si el mesero puede mover una orden de un tap a otro.
