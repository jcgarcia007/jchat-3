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

**Semántica de `status` (importante):** `open` = **el tap sigue en la mesa**, NO implica deuda.
Los taps de **cliente** (`kind='customer'`) nacen **ya pagados** (prepago) y permanecen `open`
solo para que la siguiente ronda se una al mismo tap. **La deuda por cobrar la determina
`kind='waiter'` + `status='open'`** (postpago, el mesero cobra al final). Por eso, en el panel de
mesa (B2):

- **Total mesa** = suma de todos los taps (lo consumido, pagado o no).
- **Ya cobrado** = taps de cliente (cualquier estado) + taps de mesero en `paid`.
- **Por cobrar** = solo taps de mesero en `open`.

Etiquetas de estado por tipo: cliente `open` → "Pagado · en mesa"; cliente `paid`/`closed` →
"Pagado"/"Cerrado"; mesero `open` → "Por cobrar"; mesero `paid` → "Cobrado". El botón "Marcar
pagado" solo aplica a taps de mesero (los de cliente ya pagaron); "Cerrar" aplica a ambos.

> **Futuro (caja):** el cierre de un tap de **mesero** pasará a exigir **código de caja o razón**
> (efectivo cobrado vs. no cobrado → "pendiente de revisión" del dueño). Ver
> [docs/CAJA.md](CAJA.md), fase **D3**. Todo el flujo de caja depende de **B6** (la terminal del
> mesero), que aún no existe.

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

## B3 revisado — el flujo del cliente (plan C, híbrido)

### Hallazgo (2026-07-18, reconocimiento)
La superficie de pedido web `web/app/m/[slug]` es una **DEMO**: el botón "Confirmar pedido
(demo)" solo cambia de paso, NO crea pedidos, NO llama a ninguna Edge Function, NO cobra. El
carrito es estado local de React (no persiste). El flujo REAL de pedido+pago vive en la **app
móvil** (`mobile/screens/checkout/`, `mobile/services/stripe.ts` → EF `payments`).

Consecuencia: el QR por mesa de B5 (`/t/[token]` → `/m/{slug}`) hoy lleva a una página donde no
se puede pedir. B5 sigue siendo correcto (registro de mesas, QR, subchat); lo que falta es un
destino donde SÍ se pueda pedir.

### Decisión de Juan: plan C (híbrido)
El cliente que escanea pide en la **web** (sin instalar nada). Si tiene la app instalada, se le
ofrece/salta a la app. El flujo web es OBLIGATORIO: es lo que ve quien no tiene la app. El salto
a la app es una mejora encima, no un sustituto.

### Fases
- **C1 — Checkout web real** en `/m/{slug}`: carrito persistente, invocar la EF `payments`
  (`create_payment_intent`), Stripe en web, pantalla de éxito. BASE de todo lo demás.
- **C2 — Contexto de mesa**: consumir `sessionStorage['jchat.tableContext']` (que B5 ya escribe)
  y propagar el token de mesa hasta la EF `payments` → metadata del PaymentIntent → el webhook
  resuelve `table_id` real (hoy la orden nace solo con `table_label`, texto libre).
- **C3 — Tap del cliente**: tras pagar, pedir el nombre del tap. Como las políticas actuales NO
  permiten al cliente crear taps (INSERT es waiter-only, migración 071) ni atar órdenes
  (`attach_order_to_tab` exige waiter/owner/admin, 072), hace falta un camino SERVER-SIDE nuevo
  (RPC SECURITY DEFINER o EF) que verifique: token de mesa válido + `orders.user_id = auth.uid()`
  + `owner_uid` del tap = `auth.uid()`, y entonces cree el tap y ate la orden.
- **C4 — Salto a la app** si está instalada (deep link). Prescindible.

### Cómo funciona hoy el pedido/pago (verificado)
- El cliente NUNCA inserta en `orders`. La orden la crea el **webhook** `stripe-webhook` al
  recibir `payment_intent.succeeded`, con `status='confirmed'` y `table_label` desde la metadata.
  No escribe `tab_id` ni `table_id`.
- La EF `payments` (`create_payment_intent`) recalcula TODOS los importes desde la BD (ignora los
  del cliente salvo la propina) y guarda el carrito en `pending_order_carts` como puente
  carrito→orden a través del pago. El webhook lo lee, crea `order_items` con
  `item_status='cooking'` y lo borra.
- La EF `payments` EXIGE JWT (`verifyCaller`) → un cliente sin sesión no puede pagar. Por eso B3
  depende del **login anónimo** de Supabase (pendiente de activar).
- Pagar sin email es viable: `contact_email` es opcional y Stripe tolera customer sin email.

### Dependencias
- Login anónimo de Supabase ACTIVADO (sin él, un cliente sin cuenta no puede pagar).
- La limpieza diaria de anónimos (migración 074) ya está puesta.
