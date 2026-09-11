# TAB POS — PLAN MAESTRO: Cuentas con Código Temporal, Modos de Cobro, Aprobación, Pago por QR e Impresoras Bluetooth

**Versión:** 1.0 · **Fecha:** 2026-09-08 · **Autor:** Planning Claude (Fable) para Juan Carlos / Otunity Labs LLC
**Repo principal:** `jcgarcia007/jchat-3` (web Next.js + `mobile/` React Native/Expo SDK 56) · **BD:** Supabase `klfsgcfoahdtkojyqspd` ("otunity-platform")
**Ejecutor:** Claude Code (Codex) · **Auditor y aplicador de migraciones:** Planning Claude por MCP

---

## 0. CÓMO USAR ESTE DOCUMENTO (LEER COMPLETO ANTES DE TOCAR CÓDIGO)

Este documento es la **única fuente de verdad** para este proyecto. Todas las decisiones de producto ya están tomadas (sección 2) — **no vuelvas a preguntarlas**. Trabaja fase por fase, en el orden dado, sin saltar fases. Cada fase termina con un SHA entregado y auditado antes de arrancar la siguiente.

### 0.1 Reglas operativas obligatorias (no negociables)

1. **Antes de cualquier comando:** `git rev-parse --show-toplevel` y confirma que estás en la raíz del repo `jchat-3` (no dentro de `mobile/`). Reporta la ruta.
2. **Una rama por fase:** `feat/tabpos-f<N>-<slug>` desde `main` actualizado (`git fetch origin && git checkout -b ... origin/main`).
3. **Paso 0 obligatorio en cada fase:** investiga el código real (archivos, RPCs, EFs, queries) y **entrega un reporte de Paso 0 antes de codear**. En fases marcadas **[CHECKPOINT]** (dinero / BD / seguridad) **ESPERA el OK explícito** antes de escribir código. En fases sin checkpoint, entrega el reporte y continúa sin esperar.
4. **Migraciones de BD:** tú **NO aplicas** migraciones a producción. Escribes el archivo `supabase/migrations/<NNN>_<slug>.sql` en el repo (numeración: siguiente correlativa a la más alta que exista en `supabase/migrations/`; verifica), lo incluyes en el commit, y **Planning lo aplica por MCP**. Si el SQL de este documento difiere de la realidad de la BD que encuentres, reporta la diferencia en el Paso 0 — no "arregles" en silencio.
5. **Verde obligatorio antes de commit:** web → `cd web && npx tsc --noEmit && npm run build`; móvil → `cd mobile && npx tsc --noEmit`. Los tres deben estar verdes. Pega la salida real (últimas líneas) en el reporte.
6. **Commit + push + SHA:** haz commit atómico por fase, `git push -u origin <rama>`, y reporta el SHA completo **junto con la salida real** de `git log -1 --oneline` y `git status`. Planning verifica el push contra el remoto por MCP antes de auditar: si el push no llegó, la fase no existe.
7. **Nunca reportes "terminé" sin haber ejecutado.** Si algo no se pudo hacer, dilo con el error literal.
8. **Precio y dinero solo en servidor.** Todo importe se recalcula en la EF/RPC (`supabase/functions/_shared/pricing.ts`). El cliente NUNCA es fuente de verdad de totales, mesa, cuenta, negocio ni estado de autorización.
9. **Mutaciones sensibles solo por RPC `SECURITY DEFINER` o Edge Function con service role.** Nunca `insert/update` directo del cliente a `orders.tab_id`, `orders.approval_status`, `tab_payments`, `table_tabs.access_code`, `guest_*`.
10. **Idioma y formato de specs:** todo el copy nuevo va por i18n (web: namespaces existentes `dashboardCommon`, `menu`, `checkout`; móvil: un namespace por dominio). `en.json` y `es.json` con **conteo idéntico de claves**. Enums/valores lógicos en inglés estable; solo se traduce la etiqueta.
11. **Bug conocido a vigilar:** nunca declares una variable local llamada `t` en `.map((t) => ...)` / `for (const t of ...)` en componentes que usan `useTranslations` — ensombrece `t` y rompe en runtime aunque `tsc` pase. Usa `row`, `tab`, `tbl`, `prn`, etc.
12. **Tokens de diseño:** dashboard web solo `--db-*` (nunca hex nuevos). Menú público `/m/[slug]` usa `palette.*` del template activo. Móvil usa el tema existente del POS.
13. **PROHIBIDO global** (aplica a todas las fases): ver sección 7. Léelo antes de cada fase.

### 0.2 Formato del reporte de Paso 0 (copia esta plantilla)

```
## PASO 0 — Fase F<N>
Raíz del repo: <salida de git rev-parse --show-toplevel>
Rama: <nombre> (desde origin/main @ <sha>)
Migraciones existentes: mayor número encontrado = <NNN>
Archivos que voy a tocar (ruta + por qué): ...
RPCs/EFs/triggers que afectan esta fase y lo que hacen HOY (con línea/archivo): ...
Diferencias entre este documento y el código/BD real: ... (o "ninguna")
Riesgos detectados: ...
Plan de implementación (pasos concretos): ...
¿Necesito OK antes de codear? <SÍ (checkpoint) / NO>
```

### 0.3 Formato de entrega de fase

```
## ENTREGA — Fase F<N>
Rama: <nombre>   SHA: <sha completo>
git log -1 --oneline: <pegar>
git status: <pegar>
tsc web: <últimas 3 líneas>   build web: <últimas 3 líneas>   tsc mobile: <últimas 3 líneas>
Archivos cambiados (+/-): <pegar git diff --stat origin/main..HEAD>
Migración incluida: supabase/migrations/<archivo> (Planning la aplica por MCP)
Criterios de aceptación cumplidos: <checklist marcado>
Pendientes / deuda dejada explícita: ...
Cómo probar (pasos exactos para Juan): ...
```

---

## 1. PROPÓSITO Y ALCANCE

Tab POS ya tiene: menú público por QR de mesa, pago por orden vía Stripe, POS del mesero (handheld Android) con cuentas, split, cobro con lector Stripe M2, KDS por estación, impresión de comandas por red. Este proyecto agrega:

1. **Dos modos de cobro por negocio:** Stripe (nuestro) o **sistema propio del dueño** (efectivo / tarjeta externa).
2. **Código temporal de 6 dígitos por cuenta abierta**, que el mesero ve en pantalla e imprime, y que el cliente usa para **agregar pedidos a la cuenta de la mesa** desde su teléfono.
3. **Aprobación del mesero** (modo propio) para pedidos de clientes sin código, con alerta en el handheld.
4. **Pago de la cuenta por QR desde el teléfono del cliente** (modo Stripe), con split en partes iguales / por artículo / monto libre, y saldo compartido en vivo con el handheld.
5. **Bloqueo de dispositivos abusivos** (2 rechazos → bloqueo de 30 días en todo el negocio, desbloqueable).
6. **Impresoras Bluetooth del mesero** (58 y 80 mm, ESC/POS) + impresoras de red por IP, excluyendo siempre las de cocina/bar.
7. **Atribución de ventas** de pedidos del cliente al mesero de la mesa, marcados con asterisco, contabilizados al cerrar la cuenta.

---

## 2. DECISIONES CERRADAS (NO RE-PREGUNTAR)

| ID | Decisión |
|---|---|
| D-01 | El **modo de cobro** es un ajuste **por negocio** (todo el negocio parejo): `stripe` (modo 1) o `external` (modo 2). Vive en la **pestaña Configuración del negocio** del dashboard. |
| D-02 | El **código de acceso** es de **6 dígitos numéricos**. Pertenece a **una cuenta abierta** (`table_tabs` con `status='open'`). Nace **en el instante en que se abre la cuenta**, por cualquiera de dos disparadores: (a) el mesero abre/imprime el código desde la mesa, o (b) entra la primera orden a esa mesa sin cuenta abierta. Es **el mismo mientras la cuenta esté abierta**, se puede **ver en pantalla y reimprimir ilimitadamente**, y **muere al cerrarse/pagarse la cuenta**. La siguiente cuenta recibe un código **nuevo**. Sin rotación manual en esta versión. |
| D-03 | El código se **muestra en pantalla** en la vista de la mesa del handheld (junto al botón Imprimir), para dictarlo o imprimirlo. |
| D-04 | **Modo 1 (stripe) — checkout del cliente:** dos caminos: **Pagar con Stripe** (como hoy) **o** **Agregar a la cuenta** (pide el código). Con código válido, la orden entra a la cuenta y va **directo a cocina/bar sin aprobación**. |
| D-05 | **Modo 2 (external) — checkout del cliente:** **no hay Stripe**. El cliente puede poner el código (opcional). **Con código** → directo a cocina/bar. **Sin código** → la orden queda **esperando aprobación del mesero**. |
| D-06 | El cliente **nunca paga por teléfono en modo 2**. Todo el cobro lo hace el mesero por fuera (efectivo o tarjeta externa) y lo registra en el sistema al cerrar. |
| D-07 | **Aprobación (modo 2):** alerta al **handheld del mesero** con **ícono en la mesa** y **vibración/sonido configurable** (ajuste local del dispositivo). Acciones sobre el pedido pendiente: **Aprobar**, **Editar** (y luego aprobar), **Rechazar** (una sola acción de descarte con motivo opcional; "rechazar" y "cancelar" se unifican en UI para no confundir). |
| D-08 | **Bloqueo de dispositivos:** un dispositivo cuyo pedido **sin código** es **rechazado 2 veces** (contador por negocio, solo pedidos sin código, solo rechazos — no ediciones) queda **bloqueado en todo el negocio por 30 días**. El dueño (y mesero con permiso) puede **desbloquear antes** desde el dashboard. Identificación: **id propio persistido en el teléfono + huella del navegador + IP hasheada**. **No existe MAC address en web** (no intentarlo). |
| D-09 | **Pago de cuenta por QR (solo modo 1):** el **mismo QR de la mesa**. En el menú aparece un **botón flotante con el total vivo de la cuenta** **solo cuando el cliente tiene sesión sobre una cuenta abierta** (entró el código). Desde ahí: ver detalle y pagar. Métodos ofrecidos: **Partes iguales**, **Por artículo**, **Monto libre** — los tres. |
| D-10 | **Saldo compartido en vivo:** una sola cuenta por mesa. Los pagos del cliente (QR/Stripe) y los del mesero (M2 / efectivo / tarjeta externa) descuentan el **mismo saldo**; el handheld siempre muestra el pendiente real; la cuenta se **cierra sola al llegar a cero**. |
| D-11 | **Cierre en modo 2:** el mesero cierra desde el handheld eligiendo método (**efectivo** o **tarjeta externa**), se registra el pago en el sistema, se imprime el recibo y la mesa vuelve a disponible. |
| D-12 | **Estado de órdenes para el cliente:** botón "Estado de mis órdenes" con los 3 estados (**recibido → en preparación → listo**, = `order_items.item_status` pending/preparing/ready) más los estados de aprobación (**esperando aprobación / ajustado / rechazado**). Gateado por el toggle del dueño **ya existente** `businesses.kds_settings.customer_status_enabled`. |
| D-13 | **Una sola cuenta compartida y en vivo por mesa:** el mesero ve en su handheld todo lo que el cliente agregó por teléfono, sumado a lo que él tomó. |
| D-14 | **Atribución de ventas:** los pedidos que el cliente hace desde su teléfono a una mesa se atribuyen al **mesero asignado a esa mesa**, aparecen **bajo su nombre** en el reporte de ventas **con un asterisco (\*)**. Regla de desempate: el mesero que **abrió la cuenta** (`table_tabs.created_by`); si no aplica, el **único** mesero asignado en `table_waiters`; si hay varios y ninguno abrió la cuenta, el **primero por `created_at`**; si no hay ninguno → "Sin asignar\*". Aplica a todo pedido con `source` de cliente (`customer_tab` y `customer_stripe`). |
| D-15 | Las ventas de la cuenta **aparecen en el reporte cuando la cuenta se cierra/paga** (comportamiento actual: solo `paid_at` no nulo). |
| D-16 | **Impresión del código y recibos del mesero:** **NUNCA** por impresoras con `role in ('kitchen','bar')`. Destinos válidos: (a) **impresora térmica Bluetooth emparejada al handheld** (NT-1809 58 mm, M860 80 mm, ESC/POS), con **selector** para elegir entre las emparejadas; (b) **otra impresora de red por IP** configurada en el dashboard con `role in ('receipt','waiter')`. |
| D-17 | El **emparejamiento Bluetooth** se hace **dentro de la app móvil**, con un flujo "buscar y conectar" **análogo al del lector Stripe M2**. |
| D-18 | El ticket del código se diseña **adaptable a 58 y 80 mm**. |
| D-19 | **Acceso abierto:** cualquiera con el código pide sin tope de monto ni pausa. (Topes/pausa = futuro.) |
| D-20 | **QR por mesa ya existe** (`tables.qr_token`, ruta `/t/[token]`, `resolve_table_qr`) y **ya ata la orden a la mesa** por `table_qr_token` resuelto en servidor. Se **reutiliza tal cual**. |
| D-21 | La **entrada manual del número de mesa** (cuando el cliente entra a `/m/[slug]` sin escanear) **se mantiene** para pago Stripe por orden, pero **no da acceso** a "Agregar a la cuenta" ni a "Pagar la cuenta" (esas requieren contexto de mesa por QR + código). |
| D-22 | Los pedidos del cliente que esperan aprobación **no tienen `tab_id`** hasta que el mesero aprueba; al aprobar, se adjuntan a la cuenta abierta de la mesa (si hay una sola, automático; si hay varias, el mesero elige). |
| D-23 | El `settle_tab_payment` actual **asume pago completo** (marca pagadas todas las órdenes de la cuenta en cualquier pago). Se **reescribe** para pagos parciales (ver F5). |

---

## 3. ESTADO REAL VERIFICADO (INVENTARIO — NO REDESCUBRIR)

Verificado por Planning el 2026-09-08 contra `main` y la BD de producción. Úsalo como mapa; confirma solo lo que este documento te pide confirmar en cada Paso 0.

### 3.1 Base de datos (schema `public`)

**`tables`**: `id, business_id, label, floor, seats, sort, is_active, created_at, updated_at, qr_token (NOT NULL, asignado por trigger trg_fn_assign_table_qr_token), room_id, is_reserved, reserved_note, reserved_until, party_size, combined_into`.

**`table_tabs`** (la "cuenta"): `id, table_id, business_id (trigger set_tab_business_id), name (1–40), owner_uid, created_by, kind CHECK ('customer'|'waiter') [customer exige owner_uid; waiter exige created_by], status CHECK ('open'|'paid'|'closed') default 'open', paid_at, closed_at, closed_by, created_at, updated_at`. **No tiene código de acceso** (se agrega).

**`tab_payments`**: `id, business_id, tab_id, amount_cents CHECK (>0), tip_cents CHECK (>=0), method CHECK ('card'|'cash'), status CHECK ('pending'|'succeeded'|'failed'|'cancelled'), stripe_pi_id, pay_token (NOT NULL, generado por generate_tab_pay_token), taken_by, paid_at, created_at, updated_at`. Trigger `trg_fn_tab_payment_defaults`.

**`pos_payments`** (pagos de mesa del POS/M2): `id, business_id, table_id, amount_cents, tip_cents, kind default 'full', seat, order_item_ids uuid[], stripe_pi_id, status default 'pending', receipt_code, card_brand, card_last4, paid_by`.

**`orders`**: `id, business_id, user_id, room_id, status (texto libre, sin CHECK; valores vistos: pending, cancelled, refunded, …), total_cents, tip_cents, notes, stripe_pi_id, status_updated_at, created_at, updated_at, order_type default 'counter', gift_recipient_id, subtotal_cents, tax_cents, discount_cents, promo_code, eta_minutes, special_instructions, table_label (<=40), contact_email, contact_phone, tab_id, table_id, contact_name (<=60), paid_at, taken_by, canceled_at`. **No tiene `source` ni estado de aprobación** (se agregan). Triggers relevantes: `orders_status_changed`, `sync_order_status_from_items`.

**`order_items`**: `id, order_id, menu_item_id, qty, price_cents, notes, created_at, options jsonb, special_instructions, item_status default 'pending' (pending|preparing|ready|done), seat, paid_at, preparing_at, ready_at, done_at`.

**`table_waiters`**: `id, business_id (trigger 070), table_id, employee_id, created_at`. Unique (table_id, employee_id).

**`pos_printers`**: `id, business_id, label, connection (texto; hoy solo 'network'), host, port (NOT NULL), width_mm, is_default, is_active, created_at, role CHECK ('kitchen'|'bar'|'receipt')`. Dato real Bar XZX: "Kitchen Station" network 192.168.1.100:9100 80mm role kitchen.

**`businesses`** (columnas relevantes): `kds_settings jsonb` (contiene `customer_status_enabled` boolean), `table_subchats_enabled`, `stripe_account_id`, `stripe_charges_enabled`, `menu_mode`. **No tiene modo de cobro** (se agrega).

**`blocks`** = bloqueo social entre usuarios (blocker/blocked). **NO** es bloqueo de dispositivos; no tocar.

### 3.2 RPCs existentes relevantes (todas `SECURITY DEFINER`)

| RPC | Firma | Qué hace hoy |
|---|---|---|
| `open_tab_on_table` | `(p_table_id uuid, p_name text default null) → jsonb {tab_id, tab_name, claimed_table}` | Exige empleado aceptado; `pg_advisory_xact_lock` por mesa; si la mesa no tiene meseros, asigna al que llama; si tiene y no es uno de ellos → `NOT_ASSIGNED`; nombra "Cuenta N" si no hay nombre; inserta `table_tabs kind='waiter' status='open'`. |
| `tab_amount_due` | `(p_tab_id) → jsonb {amount_cents, orders_count, already_paid_cents}` | Suma `orders.total_cents` con `paid_at is null` y status ∉ (cancelled, refunded); `already_paid_cents` = suma `tab_payments` succeeded. Solo empleados/dueño/admin. |
| `settle_tab_payment` | `(p_tab_payment_id) → jsonb` | Marca el pago `succeeded`; **marca `paid_at` en TODAS las órdenes de la cuenta**; si no queda nada sin pagar → `table_tabs.status='paid'`. **Asume pago completo** (D-23). |
| `attach_order_to_tab` | `(p_order_id, p_tab_id) → void` | Exige mesero de la mesa/dueño/admin; valida mismo negocio; `update orders set tab_id`. |
| `resolve_tab_payment` | `(p_token) → table(...)` | Resolver público de un `tab_payments` **pendiente** por `pay_token` (flujo "pagar este cobro por link"). |
| `generate_tab_pay_token` | `(_business_id) → text` | `<slug>-pay-<20hex>` único. |
| `get_table_order_status` | `(p_token) → jsonb {enabled, items[{name, qty, status, station}]}` | Público por `tables.qr_token`; gateado por `kds_settings->>'customer_status_enabled'`; lista ítems de órdenes de la mesa con `paid_at is null and canceled_at is null`. |
| `pos_kds_settings` | `(p_business_id) → jsonb` | Devuelve `businesses.kds_settings` si `pos_can_access`. |
| `pos_create_order` | `(p_business_id, p_table_id, p_items jsonb, p_notes)` | Orden del mesero. |
| `pos_create_split` / `pos_create_check` / `pos_apply_payment` | ver firmas en BD | Split y cobro del POS (M2). |
| `pos_tables_overview` / `pos_table_items` / `pos_tab_total` | `(p_business_id[, p_table_id])` | Datos de la vista de mesas del handheld. |
| `is_waiter_of_table`, `owns_business_of_table`, `can_employee_see_table`, `pos_can_access`, `user_has_tab_at_table` | helpers de autorización | Reutilizar, no duplicar. |
| `resolve_table_qr` | `(p_token) → {table_label, business_slug, room_qr_token}` | Anon-callable. |

### 3.3 Web (Next.js, `web/`)

- **QR de mesa:** `web/services/qr.ts::tableQrUrl` → `${origin}/t/${qr_token}`. Modal `web/components/dashboard/TableQrModal.tsx`.
- **Entrada pública:** `web/app/t/[token]/page.tsx` (Server Component, llama `resolve_table_qr`) → `TableEntry.tsx` guarda `sessionStorage['jchat.tableContext'] = {token, tableLabel, businessSlug}` y redirige a `/m/{slug}`.
- **Menú público:** `web/app/m/[slug]/MenuPageClient.tsx` (70 KB): lee `TABLE_CONTEXT_KEY` (solo si `businessSlug` coincide), banda superior "Estás en la mesa X" con botón **Estado de órdenes** (`OrderStatusModal`, polling 6 s a `get_table_order_status`) y "No estoy en esta mesa"; `CartSheet`, `PickupSheet` (permite escribir número de mesa a mano), `CheckoutStep`.
- **Checkout:** `web/app/m/[slug]/CheckoutStep.tsx`: con sesión → EF `payments` (`create_payment_intent`); sin sesión → EF `guest-pay` (`create_guest_payment`, hCaptcha invisible). Envía `table_qr_token` (resuelto a `table_id` en servidor) y `table_label` informativo. Precios ignorados por el servidor.
- **Mesas del dashboard:** `web/app/dashboard/tables/page.tsx` (CRUD `tables`, ocupación en vivo por `orders.table_id` con `paid_at/canceled_at` nulos, `TableDetailPanel`, `TableQrModal`).
- **Ventas por vendedor:** `/dashboard/sales` (F5b; atribución por `orders.taken_by`, solo `paid_at` no nulo, "Sin asignar").
- **Configuración del negocio:** `/dashboard/configuration` (verificar en Paso 0 F1 dónde se edita `kds_settings`).
- **Impresoras:** `/dashboard/printers` (CRUD `pos_printers`).

### 3.4 Móvil (`mobile/`, Expo SDK 56 / RN 0.85 / React 19)

- POS del mesero: `WorkModeScreen` → `PosNavigator` → pantallas de mesas / cuenta / cobro. Lector **Stripe M2** por Bluetooth (Stripe Terminal). Realtime: patrón `useServicePending.ts` (web) / equivalentes móviles. Impresión de comandas por red ya funciona en hardware (verificar en Paso 0 F2 el mecanismo exacto: librería y desde qué proceso se abre el socket TCP 9100).

### 3.5 Edge Functions (`supabase/functions/`)

- `payments` (create_payment_intent para usuarios con sesión), `guest-pay` (walk-ins sin cuenta, hCaptcha, D-64), `stripe-webhook` (`verify_jwt=false`, **siempre**), `subscriptions`, `menu-assistant`. Precio único en `_shared/pricing.ts`.

---

## 4. MODELO DE DATOS OBJETIVO (MIGRACIONES)

Convenciones: todas las tablas nuevas con RLS **habilitada** y **cero grants a `anon`**; acceso desde EFs por service role; lectura de staff por policies que usen los helpers existentes. Cada migración es un archivo separado en el orden indicado. **Planning aplica por MCP; Codex solo escribe el archivo.**

### MIG-A — Modo de cobro del negocio (Fase F1)

```sql
-- MIG-A: modo de cobro por negocio
alter table public.businesses
  add column if not exists pos_payment_mode text not null default 'stripe';
alter table public.businesses
  add constraint businesses_pos_payment_mode_chk
  check (pos_payment_mode in ('stripe','external'));
comment on column public.businesses.pos_payment_mode is
  'Modo de cobro del POS: stripe = cobros por Stripe (cliente puede pagar por QR); external = el dueño cobra por fuera (efectivo/tarjeta externa), cliente nunca paga por teléfono. D-01.';
```
**Nota para Paso 0 F1:** existe una allow-list de columnas escribibles por el dueño (hardening D-54/D-75, migr. 060–110). Identifica el mecanismo (trigger/función/policy) y **agrega `pos_payment_mode`** a las columnas que el dueño puede actualizar desde el dashboard. Reporta el archivo/función exacto.

### MIG-B — Código de acceso por cuenta + origen y aprobación de órdenes (Fase F2/F3/F4)

```sql
-- MIG-B.1: código de acceso en la cuenta
alter table public.table_tabs
  add column if not exists access_code text,
  add column if not exists access_code_generated_at timestamptz;
alter table public.table_tabs
  add constraint table_tabs_access_code_chk
  check (access_code is null or access_code ~ '^[0-9]{6}$');
-- Un código no puede repetirse entre cuentas ABIERTAS del mismo negocio
create unique index if not exists table_tabs_open_access_code_uidx
  on public.table_tabs (business_id, access_code)
  where status = 'open' and access_code is not null;

-- MIG-B.2: generador (criptográficamente aleatorio, único entre cuentas abiertas del negocio)
create or replace function public.generate_tab_access_code(_business_id uuid)
returns text language plpgsql security definer set search_path to '' as $$
declare v_code text; v_tries int := 0;
begin
  loop
    -- gen_random_bytes(4) -> entero -> 6 dígitos con ceros a la izquierda
    v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
    exit when not exists (
      select 1 from public.table_tabs t
      where t.business_id = _business_id and t.status = 'open' and t.access_code = v_code
    );
    v_tries := v_tries + 1;
    if v_tries > 50 then raise exception 'ACCESS_CODE_EXHAUSTED'; end if;
  end loop;
  return v_code;
end $$;
revoke all on function public.generate_tab_access_code(uuid) from public, anon, authenticated;

-- MIG-B.3: origen y aprobación en órdenes
alter table public.orders
  add column if not exists source text not null default 'pos',
  add column if not exists approval_status text,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_reason text,
  add column if not exists guest_device_id text,
  add column if not exists guest_session_id uuid;
alter table public.orders
  add constraint orders_source_chk check (source in ('pos','app','customer_stripe','customer_tab'));
alter table public.orders
  add constraint orders_approval_status_chk
  check (approval_status is null or approval_status in ('awaiting','approved','rejected'));
create index if not exists orders_awaiting_idx
  on public.orders (business_id, created_at) where approval_status = 'awaiting';
comment on column public.orders.source is 'pos = mesero handheld; app = app JChat; customer_stripe = cliente web pagó por orden; customer_tab = cliente web agregó a la cuenta (con o sin código). D-14.';
comment on column public.orders.approval_status is 'null = no requiere aprobación; awaiting = esperando al mesero (modo external, sin código); approved / rejected. D-05/D-07.';
```
**Regla de oro (F4):** cocina/bar/KDS/impresión de comandas/`pos_pickup_board`/métricas **no deben ver** órdenes con `approval_status='awaiting'`. Se filtra en las queries/RPCs, **no** cambiando `orders.status` (para no pelear con `sync_order_status_from_items`).

### MIG-C — Sesiones de invitado, intentos, strikes y bloqueos (Fase F3/F4)

```sql
-- MIG-C.1: sesión de invitado sobre una cuenta (creada al validar el código)
create table if not exists public.guest_tab_sessions (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  table_id      uuid not null references public.tables(id) on delete cascade,
  tab_id        uuid not null references public.table_tabs(id) on delete cascade,
  device_id     text not null,
  token_hash    text not null unique,          -- sha256 del token opaco entregado al navegador
  ip_hash       text,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  expires_at    timestamptz not null,
  revoked_at    timestamptz
);
create index if not exists guest_tab_sessions_tab_idx on public.guest_tab_sessions (tab_id) where revoked_at is null;
alter table public.guest_tab_sessions enable row level security;
revoke all on public.guest_tab_sessions from anon, authenticated;

-- MIG-C.2: intentos de código (rate limit)
create table if not exists public.guest_code_attempts (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  table_id    uuid not null,
  device_id   text,
  ip_hash     text,
  success     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists guest_code_attempts_dev_idx on public.guest_code_attempts (device_id, created_at);
create index if not exists guest_code_attempts_tbl_idx on public.guest_code_attempts (table_id, created_at);
alter table public.guest_code_attempts enable row level security;
revoke all on public.guest_code_attempts from anon, authenticated;

-- MIG-C.3: strikes (rechazos de pedidos sin código) y bloqueos
create table if not exists public.guest_device_strikes (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  device_id   text not null,
  order_id    uuid references public.orders(id) on delete set null,
  created_by  uuid,                           -- mesero que rechazó
  created_at  timestamptz not null default now()
);
create index if not exists guest_device_strikes_idx on public.guest_device_strikes (business_id, device_id, created_at);

create table if not exists public.guest_device_blocks (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  device_id     text not null,
  reason        text not null default 'rejected_orders',
  blocked_until timestamptz not null,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  unblocked_at  timestamptz,
  unblocked_by  uuid
);
create unique index if not exists guest_device_blocks_active_uidx
  on public.guest_device_blocks (business_id, device_id) where unblocked_at is null;
alter table public.guest_device_strikes enable row level security;
alter table public.guest_device_blocks  enable row level security;
revoke all on public.guest_device_strikes, public.guest_device_blocks from anon, authenticated;
-- Lectura para staff (dashboard) — dueño/empleados del negocio
create policy guest_device_blocks_staff_read on public.guest_device_blocks
  for select to authenticated
  using (public.is_employee_of_business(business_id)
         or exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
         or public.is_platform_admin());
```
Constantes (viven en `_shared/guestPolicy.ts` de las EFs y en el RPC de rechazo): `STRIKES_TO_BLOCK = 2`, `BLOCK_DAYS = 30`, `CODE_ATTEMPTS_PER_DEVICE = 5 / 5 min`, `CODE_ATTEMPTS_PER_TABLE = 10 / 10 min`, `GUEST_SESSION_TTL_HOURS = 8` (y nunca sobrevive al cierre de la cuenta).

### MIG-D — Pagos parciales de cuenta (Fase F5/F6)

```sql
-- MIG-D.1: métodos y split en tab_payments
alter table public.tab_payments drop constraint if exists tab_payments_method_check;
alter table public.tab_payments
  add constraint tab_payments_method_check
  check (method in ('card','cash','stripe_web','card_external'));
alter table public.tab_payments
  add column if not exists split_kind text,
  add column if not exists split_ways int,
  add column if not exists order_item_ids uuid[],
  add column if not exists guest_session_id uuid,
  add column if not exists paid_by_label text;
alter table public.tab_payments
  add constraint tab_payments_split_kind_chk
  check (split_kind is null or split_kind in ('full','equal','items','amount'));
comment on column public.tab_payments.method is 'card = mesero con M2 (Stripe Terminal); cash = efectivo; stripe_web = cliente por QR (Stripe web); card_external = tarjeta en terminal propia del dueño (modo external).';
```
**Nombre real del constraint:** en Paso 0 F5 consulta `pg_constraint` para el nombre exacto del CHECK de `method` y úsalo en el `drop constraint`.

### MIG-E — Impresoras (Fase F7)

```sql
-- MIG-E: rol 'waiter' y validación de conexión
alter table public.pos_printers drop constraint if exists pos_printers_role_check;
alter table public.pos_printers
  add constraint pos_printers_role_check
  check (role in ('kitchen','bar','receipt','waiter'));
alter table public.pos_printers
  add constraint pos_printers_connection_chk
  check (connection in ('network'));
comment on column public.pos_printers.role is 'kitchen/bar = comandas (NUNCA destino de códigos/recibos del mesero); receipt/waiter = recibos y códigos. Las impresoras Bluetooth NO viven aquí: se guardan en el dispositivo del mesero (D-16/D-17).';
```
(Igual que MIG-D: obtener el nombre real del CHECK de `role` en Paso 0.)

---

## 5. FASES DE IMPLEMENTACIÓN (EN ORDEN)

Dependencias: F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8. No adelantes trabajo de una fase en otra salvo que este documento lo indique.

---

### FASE F1 — Modo de cobro del negocio (config + UI) — [sin checkpoint]

**Objetivo:** que el dueño elija en Configuración: **"Cobro con Stripe (JChat/Tab POS)"** o **"Sistema de cobro propio (efectivo / tarjeta externa)"**, y que el toggle **"Los clientes pueden ver el estado de sus órdenes"** esté en la misma pestaña.

**Paso 0 (reportar, no esperar):**
1. Ubica la página de Configuración del negocio (`web/app/dashboard/configuration/...`) y cómo guarda hoy `businesses` (query directa vs RPC). Identifica la **allow-list de columnas** escribibles por el dueño (trigger/función/policy de hardening) y dónde agregar `pos_payment_mode`.
2. Ubica dónde se edita hoy `kds_settings.customer_status_enabled` (probablemente en KDS/Cocina settings). Decide: si ya existe el toggle en otra pestaña, **muévelo/duplícalo** en Configuración con la misma fuente de verdad (no dos estados).
3. Ubica `pos_kds_settings` consumers en móvil por si el modo debe viajar al POS (sí: F4/F6 lo necesitan). Propón exponer `pos_payment_mode` en `pos_tables_overview` o en un RPC `pos_business_settings(p_business_id)` nuevo (preferido: nuevo RPC pequeño, `SECURITY DEFINER`, gateado por `pos_can_access`, que devuelva `{pos_payment_mode, kds_settings}`).

**Cambios:**
- **BD:** MIG-A (archivo en repo; Planning aplica). Actualiza la allow-list identificada en Paso 0.
- **Web `/dashboard/configuration`:** sección **"Cobro y pedidos del cliente"** con: radio `pos_payment_mode` (2 opciones con descripción de una línea cada una), toggle `customer_status_enabled` (escribe en `kds_settings` con la misma ruta que hoy). Guardado optimista con rollback y mensaje de error claro. Tokens `--db-*`.
- **RPC nuevo:** `pos_business_settings(p_business_id uuid) returns jsonb` (`stable security definer`, `set search_path to ''`, exige `public.pos_can_access(p_business_id)`), devuelve `jsonb_build_object('pos_payment_mode', b.pos_payment_mode, 'kds_settings', coalesce(b.kds_settings,'{}'))`.
- **Tipos:** regenera tipos de Supabase **solo** si el proyecto los tiene comiteados (`web/types/supabase.ts` o similar); si no, no inventes archivo.
- **i18n:** claves nuevas en `dashboardCommon` (EN/ES paridad).

**PROHIBIDO en F1:** tocar Stripe, checkout, POS móvil, KDS. Cambiar el default de `pos_payment_mode` (debe ser `stripe` para no alterar negocios existentes).

**Criterios de aceptación:**
- [ ] `businesses.pos_payment_mode` existe con CHECK y default `stripe`; el dueño puede cambiarlo desde Configuración y persiste (verificable por SQL).
- [ ] El toggle de estado de órdenes en Configuración refleja y escribe `kds_settings.customer_status_enabled`.
- [ ] `pos_business_settings` devuelve ambos valores para un empleado con acceso al POS y falla para uno sin acceso.
- [ ] tsc + build verdes; EN/ES paridad.

---

### FASE F2 — Código de acceso en la cuenta + vista/impresión en el handheld — [CHECKPOINT: BD]

**Objetivo:** que cada cuenta abierta tenga un código de 6 dígitos que nace al abrirse (D-02), que el mesero lo vea en la vista de la mesa y pueda imprimirlo (por ahora en impresoras de red `role in ('receipt','waiter')`; Bluetooth llega en F7).

**Paso 0 (ESPERAR OK):**
1. Lee `open_tab_on_table` (arriba) y **todos** los caminos por los que hoy se crea un `table_tabs` (busca `insert into public.table_tabs`, `open_tab_on_table(`, y creación automática desde `pos_create_order` / EFs). Lista cada uno con archivo/RPC.
2. Determina qué pasa hoy cuando el mesero crea una orden en una mesa **sin cuenta abierta**: ¿`pos_create_order` crea la cuenta? ¿la orden queda con `tab_id` null? Reporta con evidencia.
3. Ubica la pantalla de **detalle de mesa** en el handheld (`mobile/...`) y el RPC que la alimenta (`pos_tables_overview` / `pos_table_items` / `pos_tab_total`). Reporta la forma exacta del JSON que devuelven hoy.
4. Ubica el **mecanismo actual de impresión** (librería, dónde se construye el ESC/POS, cómo se elige la impresora por `role`). Reporta si la impresión ocurre desde el móvil, el dashboard o un puente.
5. Propón el cambio mínimo en `open_tab_on_table` y en el/los caminos de auto-creación para que **siempre** se asigne `access_code = public.generate_tab_access_code(v_biz)` y `access_code_generated_at = now()`.

**Cambios (tras OK):**
- **BD:** MIG-B (archivo). Además, `create or replace function public.open_tab_on_table(...)` con el `insert` extendido (`access_code`, `access_code_generated_at`). Y el mismo cambio en cualquier otro camino de creación de cuentas detectado en Paso 0 (si es en EF, se hace en la EF con service role).
- **RPC nuevo:** `pos_table_open_tabs(p_business_id uuid, p_table_id uuid) returns jsonb` — lista cuentas `status='open'` de la mesa con `{tab_id, name, access_code, access_code_generated_at, created_by, amount_due (reusa lógica de tab_amount_due), orders_count}`. Exige `pos_can_access` y (`is_waiter_of_table` o `owns_business_of_table`). **`access_code` solo se devuelve aquí y nunca por ninguna ruta anon.**
- **RPC nuevo:** `pos_ensure_tab_for_table(p_business_id uuid, p_table_id uuid) returns jsonb` — si la mesa no tiene cuenta abierta, llama `open_tab_on_table(p_table_id)`; si tiene **una**, la devuelve; si tiene **varias**, devuelve la lista para que el UI elija. Es lo que dispara el botón **"Código de mesa"** del handheld (D-02 disparador a).
- **Móvil — detalle de mesa:** bloque **"Código de mesa"**: muestra el código grande (fuente monoespaciada, agrupado `123 456`), botón **Copiar/dictar**, botón **Imprimir código** → abre selector de impresoras (F2: solo impresoras de red del negocio con `role in ('receipt','waiter')` y `is_active`; **excluye kitchen/bar siempre**). Si no hay cuenta abierta: botón **"Abrir cuenta y generar código"** → `pos_ensure_tab_for_table`. Si hay varias cuentas: muestra el código de cada una con su nombre.
- **Ticket del código (ESC/POS, adaptable 58/80 mm):** líneas: nombre del negocio (negrita, centrado) · "Mesa {label}" · "Cuenta: {tab.name}" · línea separadora · **"CÓDIGO DE MESA"** · código en **doble alto/doble ancho** centrado · instrucción de 2 líneas i18n ("Escanea el QR de tu mesa y escribe este código para agregar tus pedidos a la cuenta") · fecha/hora · corte. Anchos: 58 mm → 32 columnas (Font A); 80 mm → 48 columnas. Implementa una única función `buildTabCodeTicket({widthMm, ...}) → Uint8Array` reutilizando el builder ESC/POS existente.
- **Dashboard web (opcional en F2, obligatorio si es trivial):** en `TableDetailPanel` mostrar el código de la(s) cuenta(s) abierta(s) (misma RPC `pos_table_open_tabs`; el dueño tiene acceso).

**PROHIBIDO en F2:** exponer `access_code` por RLS/select directo o por RPC anon; imprimir en `kitchen`/`bar`; cambiar la firma pública de `open_tab_on_table` (solo extender el cuerpo); tocar checkout del cliente.

**Criterios de aceptación:**
- [ ] Al abrir una cuenta (por botón o por primera orden) queda `access_code` de 6 dígitos y no se repite entre cuentas abiertas del negocio (probar creando 3 cuentas).
- [ ] Al cerrar/pagar la cuenta y abrir otra en la misma mesa, el código es distinto.
- [ ] El handheld muestra el código; reimprimir 3 veces produce el mismo código; el selector jamás lista kitchen/bar.
- [ ] `select access_code from table_tabs` con rol `anon` → sin permiso.
- [ ] tsc web/móvil + build verdes.

---

### FASE F3 — Cliente: sesión por código + "Agregar a la cuenta" (modo 1 y modo 2 con código) — [CHECKPOINT: dinero/seguridad]

**Objetivo:** que el cliente, desde el menú por QR, meta el código, obtenga una sesión de invitado ligada a la cuenta, y sus pedidos entren **directo a cocina** adjuntos a la cuenta (sin pagar). También define el checkout según el modo (D-04/D-05).

**Paso 0 (ESPERAR OK):**
1. Lee `supabase/functions/guest-pay/index.ts` completo y `_shared/pricing.ts`: cómo valida ítems, recalcula precios, resuelve `table_qr_token → table_id`, crea `orders` + `order_items`, y qué disparadores/impresión ocurren tras el insert. Reporta el flujo línea por línea a nivel funcional.
2. Lee la EF `payments` (`create_payment_intent`) para el mismo mapeo.
3. Confirma cómo llega hoy una orden nueva al KDS y a la impresión de comandas (¿trigger BD? ¿realtime en móvil/dashboard? ¿EF?). Esto define dónde se filtra `approval_status='awaiting'` en F4.
4. Verifica cómo la app lee `kds_settings` y si hay un patrón de "settings por negocio" cacheado en el menú público (el menú necesita `pos_payment_mode`): propón agregar `pos_payment_mode` a la carga pública del negocio en `web/app/m/[slug]/page.tsx` (campo público no sensible).
5. Propón la estructura de la nueva EF `guest-tab` (acciones abajo), el helper de **device_id + fingerprint** en web, y el **hash del token** (sha256) en servidor.

**Cambios (tras OK):**

**BD:** MIG-C (archivo). RPC helper interno `public.guest_tab_session_validate(p_token_hash text) returns table(session_id uuid, business_id uuid, table_id uuid, tab_id uuid, device_id text)` — `security definer`, devuelve fila solo si `revoked_at is null and expires_at > now()` y la cuenta sigue `status='open'`; actualiza `last_seen_at`. Revocada a `public` y `anon`; la EF la llama con service role.

**EF nueva `supabase/functions/guest-tab/index.ts`** (service role; CORS igual que `guest-pay`; hCaptcha invisible en `create_session` igual que `guest-pay`):

| action | input | output | errores (código en `error.code`) |
|---|---|---|---|
| `create_session` | `{table_qr_token, access_code, device_id, fingerprint, captcha_token}` | `{session_token, expires_at, tab:{id,name}, table_label, business:{slug, name, pos_payment_mode}}` | `TABLE_NOT_FOUND`, `NO_OPEN_TAB`, `CODE_INVALID` (mensaje genérico), `RATE_LIMITED` (con `retry_after_s`), `DEVICE_BLOCKED` (con `blocked_until`), `CAPTCHA_FAILED` |
| `add_order` | `{session_token, items:[{menu_item_id, qty, options, special_instructions}], contact_name?, notes?}` | `{order_id, approval_status:null, total_cents}` | `SESSION_INVALID`, `TAB_CLOSED`, `MENU_ITEM_UNAVAILABLE`, `DEVICE_BLOCKED` |
| `add_order_no_code` *(F4)* | `{table_qr_token, device_id, fingerprint, captcha_token, items, contact_name?}` | `{order_id, approval_status:'awaiting'}` | `TABLE_NOT_FOUND`, `MODE_NOT_ALLOWED` (si `pos_payment_mode='stripe'`), `DEVICE_BLOCKED`, `RATE_LIMITED` |
| `summary` *(F5)* | `{session_token}` | ver F5 | `SESSION_INVALID` |
| `create_payment` *(F5)* | ver F5 | ver F5 | ver F5 |
| `order_status` | `{session_token}` | `{items:[{order_id, name, qty, item_status, approval_status}]}` | `SESSION_INVALID` |

Reglas de `create_session`: (1) resolver mesa por `qr_token`; (2) rate limit por `device_id` y por `table_id` con `guest_code_attempts` (insertar intento **antes** de comparar); (3) verificar bloqueo activo en `guest_device_blocks`; (4) buscar `table_tabs` con `table_id`, `status='open'`, `access_code = <input>` — comparación exacta de string; si no hay → `CODE_INVALID` genérico (no revelar si la mesa tiene cuenta); (5) generar `token` (32 bytes aleatorios base64url), guardar `sha256(token)` en `guest_tab_sessions` con `expires_at = least(now()+8h, …)`; (6) registrar intento `success=true`; (7) devolver token. **Nunca** devolver `access_code` ni `tab_id` de otras cuentas.

Reglas de `add_order`: (1) validar sesión; (2) verificar bloqueo; (3) **recalcular precios con `_shared/pricing.ts`** (mismo código que `guest-pay`, extraído a helper compartido si aún no lo está — **no duplicar**); (4) insertar `orders` con `business_id/table_id/tab_id` **desde la sesión**, `source='customer_tab'`, `order_type='table'`, `table_label` = label real, `guest_device_id`, `guest_session_id`, `approval_status=null`, `taken_by` = regla D-14 (implementa `public.resolve_table_waiter_for_attribution(p_tab_id uuid) returns uuid` como RPC interna reutilizable: `table_tabs.created_by`→empleado; si no, único `table_waiters`; si varios, el más antiguo; si ninguno, null; **respeta el tipo real de `orders.taken_by` (¿employee_id o user_id?) — verificar en Paso 0**); (5) insertar `order_items` con `item_status='pending'`; (6) idempotencia por `idempotency_key` (guardar en `orders.notes`? NO — usa una tabla `guest_order_idempotency(key, order_id)` si no existe mecanismo; reporta en Paso 0 cómo lo hace `guest-pay` y reutilízalo); (7) la orden fluye a KDS/impresión de comandas por el mecanismo existente.

**Web — menú público (`MenuPageClient.tsx` + nuevos componentes):**
- Helper `web/lib/guestDevice.ts`: `getDeviceId()` (UUID v4 persistido en `localStorage['tabpos.deviceId']`; si localStorage falla, sessionStorage; si ambos fallan, UUID efímero) y `getFingerprint()` (hash sha256 de `[userAgent, language, screen.width x height, devicePixelRatio, timezone, hardwareConcurrency]` — sin librerías externas).
- Estado `guestTabSession` persistido en `sessionStorage['tabpos.guestTabSession'] = {token, expiresAt, tabId, tabName, tableLabel, businessSlug}`; solo válido si `businessSlug` coincide (mismo patrón que `TABLE_CONTEXT_KEY`).
- **Hoja "Código de mesa"** (`TabCodeSheet`): 6 casillas numéricas (`inputMode="numeric"`, autoavance, pegar), botón "Entrar", errores i18n por código de error; en `RATE_LIMITED` muestra cuenta regresiva; en `DEVICE_BLOCKED` muestra "Pide ayuda a tu mesero".
- **Checkout por modo** (reemplaza la decisión única de `CheckoutStep` con una hoja previa `CheckoutChoiceSheet` **solo cuando hay `tableCtx`**):
  - `pos_payment_mode='stripe'`: botones **"Pagar ahora"** (→ `CheckoutStep` actual, intacto) y **"Agregar a la cuenta de la mesa"** (→ si no hay `guestTabSession` → `TabCodeSheet` → luego `add_order`; si hay → `add_order` directo).
  - `pos_payment_mode='external'`: **sin botón Stripe**. Botón **"Enviar pedido a la cuenta"**; si hay sesión → `add_order` (directo a cocina); si no → pregunta "¿Tienes el código de tu mesa?" → **Sí** → `TabCodeSheet` → `add_order`; **No** → `add_order_no_code` (F4; en F3 este botón muestra "Disponible pronto" deshabilitado — **no** dejar rutas muertas: implementa el gating por modo ya en F3).
  - Sin `tableCtx` (entrada manual): solo "Pagar ahora" en modo `stripe`; en modo `external` mostrar aviso "Escanea el QR de tu mesa para pedir" y no permitir enviar.
- **Confirmación** tras `add_order`: pantalla "Pedido agregado a la cuenta {tabName} · Mesa {label}" con resumen (cantidad + nombre, **sin precios por línea**, total del servidor) y botón "Ver estado de mis órdenes" (abre `OrderStatusModal`, ver F4 para estados de aprobación).
- **Banda superior** de mesa: si hay `guestTabSession`, muestra "Cuenta: {tabName}" y botón "Salir de la cuenta" (borra sesión local; no revoca en servidor).

**PROHIBIDO en F3:** tocar la lógica de `CheckoutStep`/`payments`/`guest-pay` (solo se invocan); enviar totales del cliente como confiables; confiar en `table_id/tab_id/business_id` del cliente; devolver `access_code` al navegador; usar `localStorage` para el token de sesión (solo `sessionStorage`).

**Criterios de aceptación:**
- [ ] Con código correcto, 2 navegadores distintos obtienen sesiones distintas sobre la misma cuenta y ambos pueden agregar pedidos; los pedidos aparecen en la cuenta del handheld (F2 `pos_table_open_tabs.amount_due` sube) y en KDS.
- [ ] Código incorrecto → `CODE_INVALID`; 6 intentos seguidos → `RATE_LIMITED`.
- [ ] Al pagar/cerrar la cuenta, `add_order` con la sesión vieja → `TAB_CLOSED`; una cuenta nueva en la misma mesa no acepta el código viejo.
- [ ] Manipular `tab_id`/precios en el request no cambia la orden creada (verificar en BD).
- [ ] `orders.source='customer_tab'`, `taken_by` según D-14, `approval_status=null`.
- [ ] Modo `external`: no aparece Stripe en el checkout con `tableCtx`.

---

### FASE F4 — Modo 2: pedidos sin código → aprobación del mesero, alertas, strikes y bloqueo — [CHECKPOINT: seguridad]

**Objetivo:** D-05, D-07, D-08, D-12 (estados de aprobación) y D-22.

**Paso 0 (ESPERAR OK):**
1. Con lo aprendido en F3-Paso 0 (3), lista **cada** query/RPC/trigger/pantalla que lee órdenes para cocina/bar: KDS web, KDS/expedición móvil, `pos_pickup_board`, `pos_kds_metrics*`, impresión de comandas, `get_table_order_status`, ocupación de mesas (`tables/page.tsx` y `pos_tables_overview`). Para cada una indica el filtro exacto a agregar: **`and coalesce(o.approval_status,'') <> 'awaiting'`** (o el equivalente).
2. Verifica `sync_order_status_from_items` y `orders_status_changed`: qué hacen si una orden tiene ítems `pending` pero `approval_status='awaiting'`. Confirma que **no** disparan impresión ni notificaciones antes de aprobar; si lo hacen, propón el guard.
3. Ubica el patrón de realtime del handheld (canal `postgres_changes` por `business_id`) y el sistema de alertas de expedición para reutilizar el mismo canal/estilo (badge + sonido).
4. Ubica el **flujo de edición de una orden** en el handheld (si existe) para reutilizarlo en "Editar antes de aprobar".

**Cambios (tras OK):**
- **EF `guest-tab` → `add_order_no_code`:** solo si `businesses.pos_payment_mode='external'` (si es `stripe` → `MODE_NOT_ALLOWED`); rate limit por `device_id` (reusar `guest_code_attempts` con `table_id` y `success=true` semántica "pedido enviado", o índice propio — documenta); bloqueo activo → `DEVICE_BLOCKED`; crea `orders` con `approval_status='awaiting'`, `tab_id=null`, `source='customer_tab'`, `guest_device_id`, `taken_by` null (se resuelve al aprobar), ítems `item_status='pending'`. hCaptcha obligatorio en esta acción.
- **RPCs nuevas (staff, `security definer`, `set search_path to ''`, exigen `pos_can_access` + `is_waiter_of_table(o.table_id)` o `owns_business_of_table`):**
  - `pos_awaiting_orders(p_business_id uuid) returns jsonb` — lista órdenes `approval_status='awaiting'` con mesa, ítems, hora, `guest_device_id` (últimos 6 chars para soporte), contador de strikes previos del dispositivo.
  - `pos_approve_order(p_business_id uuid, p_order_id uuid, p_tab_id uuid default null) returns jsonb` — lock advisory por mesa; si `p_tab_id` null: si la mesa tiene **una** cuenta abierta la usa; si **ninguna**, la crea vía `open_tab_on_table`; si **varias** → `TAB_REQUIRED` (el UI pide elegir). Setea `tab_id`, `approval_status='approved'`, `approved_by=auth.uid()`, `approved_at=now()`, `taken_by` = regla D-14. **Tras esto** la orden entra al KDS/impresión por el mecanismo normal (verifica que el cambio de `approval_status` dispara lo mismo que un insert nuevo; si el mecanismo se basa en INSERT, agrega un trigger `after update of approval_status` que invoque la misma función de notificación/impresión — decídelo en Paso 0).
  - `pos_reject_order(p_business_id uuid, p_order_id uuid, p_reason text default null) returns jsonb` — setea `approval_status='rejected'`, `rejected_reason`, `canceled_at=now()`, `status='cancelled'`; inserta `guest_device_strikes` (solo si `guest_device_id` no nulo y la orden era sin código, es decir `guest_session_id is null`); si `count(strikes del device en el negocio) >= 2` y no hay bloqueo activo → inserta `guest_device_blocks` con `blocked_until = now() + interval '30 days'`. Devuelve `{rejected:true, strikes:n, blocked:boolean, blocked_until}`.
  - `pos_update_awaiting_order(p_business_id uuid, p_order_id uuid, p_items jsonb) returns jsonb` — solo si `approval_status='awaiting'`; reemplaza ítems recalculando precios **en servidor** (reusa la lógica de precios de `pos_create_order`); no aprueba (el UI llama luego a `pos_approve_order`).
  - `pos_list_blocked_devices(p_business_id uuid)` y `pos_unblock_device(p_business_id uuid, p_block_id uuid)` — dueño o empleado con acceso POS; `unblocked_at/unblocked_by`.
- **Móvil — handheld:**
  - Realtime: suscripción a `orders` INSERT/UPDATE del negocio; cuando entra/cambia una orden `awaiting` → refresca `pos_awaiting_orders`.
  - **Badge en la mesa** (ícono + contador) en la grilla de mesas; **campanita** global con contador.
  - **Ajuste local** "Alertas de pedidos por aprobar": Vibración (on/off) · Sonido (on/off) — `AsyncStorage`; usa `expo-haptics` y el reproductor de audio ya presente en la app (si no hay, `expo-audio`/`expo-av` según lo instalado — no agregues librería nueva sin reportarlo).
  - **Pantalla "Por aprobar"** (desde la campanita o desde la mesa): tarjeta por pedido con mesa, hora, ítems, nombre del cliente si lo dio; botones **Aprobar** / **Editar** / **Rechazar** (confirmación con motivo opcional; muestra "Este dispositivo quedará bloqueado 30 días" cuando sea el 2.º strike). Si `TAB_REQUIRED` → selector de cuenta.
- **Cliente (`OrderStatusModal` + `guest-tab.order_status`):** los pedidos del cliente muestran: `awaiting` → "Esperando aprobación del mesero"; `approved` → estados de ítem (recibido/preparando/listo); `rejected` → "Tu pedido no pudo procesarse, consulta a tu mesero". `get_table_order_status` (público por mesa) **debe excluir `awaiting` y `rejected`** (no filtrar información de otros clientes de la mesa más allá de lo que ya muestra hoy). Para el cliente **con sesión** usar `order_status` de la EF (filtra por `guest_session_id` o `guest_device_id` propio).
- **Dashboard web:** en Configuración, sección **"Dispositivos bloqueados"**: tabla (id corto, motivo, desde, hasta, strikes) con botón **Desbloquear**. En `/dashboard/kitchen`/`/bar` **no** aparecen órdenes `awaiting` (filtro).

**PROHIBIDO en F4:** mandar a cocina/imprimir comandas antes de `approved`; cambiar `orders.status` a un valor nuevo (usar `approval_status`); permitir `add_order_no_code` en modo `stripe`; contar strikes por ediciones o por pedidos con código; bloquear sin `guest_device_id`.

**Criterios de aceptación:**
- [ ] En modo `external`, pedido sin código → aparece en "Por aprobar" con vibración/sonido según ajuste; **no** aparece en KDS ni imprime comanda; la mesa muestra badge.
- [ ] Aprobar → entra al KDS, imprime comanda, se adjunta a la cuenta, `taken_by` correcto, el cliente ve "recibido".
- [ ] Editar → cantidades/ítems cambian con precio de servidor; luego aprobar.
- [ ] Rechazar 2 veces al mismo dispositivo → `guest_device_blocks` activo 30 días; el 3.º intento (`add_order_no_code` y `create_session`) → `DEVICE_BLOCKED`; desbloquear desde el dashboard vuelve a permitir.
- [ ] En modo `stripe`, `add_order_no_code` → `MODE_NOT_ALLOWED`.
- [ ] `get_table_order_status` no lista órdenes `awaiting/rejected`.

---

### FASE F5 — Cliente paga la cuenta por QR (modo 1): botón flotante, split ×3, saldo vivo — [CHECKPOINT: dinero]

**Objetivo:** D-09, D-10, D-23.

**Paso 0 (ESPERAR OK):**
1. Lee `stripe-webhook`: qué eventos maneja y cómo enruta por `metadata` (p. ej. `type`, `order_id`, `tab_payment_id`). Confirma si ya existe manejo de `tab_payments` (por el `pay_token` existente). Reporta.
2. Lee cómo `payments`/`guest-pay` crean el `PaymentIntent` en la **cuenta conectada** (`stripe_account_id`, `application_fee`, `transfer_data`) para replicar **exactamente** el mismo patrón.
3. Lee `pos_apply_payment`, `pos_create_split`, `pos_create_check` (cómo el M2 marca `order_items.paid_at` / `orders.paid_at` y cómo calcula pendiente) para que el saldo sea **uno solo**: define en Paso 0 la **función única de saldo** `public.tab_balance(p_tab_id) returns jsonb {due_cents, paid_cents, items:[{order_item_id, order_id, name, qty, line_cents, paid}]}` y propón que M2 y QR la usen.
4. Confirma el nombre real del CHECK de `tab_payments.method` (MIG-D).

**Cambios (tras OK):**
- **BD:** MIG-D (archivo). `create or replace function public.settle_tab_payment(...)` **reescrita**: marca el pago `succeeded`; si `split_kind='items'` → `order_items.paid_at=now()` para `order_item_ids` (validando que pertenecen a órdenes de la cuenta y no estaban pagados) y `orders.paid_at` cuando **todos** sus ítems queden pagados; recalcula `due = sum(total de órdenes de la cuenta no canceladas) - sum(tab_payments succeeded)` (**incluyendo pagos de M2 registrados en `pos_payments`** — en Paso 0 decide si se unifica registrando también los pagos M2 como `tab_payments method='card'`, **preferido**, o si `tab_balance` suma ambas tablas); si `due <= 0` → marca `paid_at` en todas las órdenes restantes y `table_tabs.status='paid', paid_at=now()`; **revoca** todas las `guest_tab_sessions` de la cuenta (`revoked_at=now()`) y devuelve `{settled, remaining_due_cents, tab_closed}`. Idempotente (`already_settled`). RPC `public.tab_balance` nueva (usada por staff y por la EF).
- **EF `guest-tab`:**
  - `summary {session_token}` → `{tab:{id,name}, table_label, pos_payment_mode, due_cents, paid_cents, items:[...], my_items:[order_item_id...]}` (solo si `pos_payment_mode='stripe'`; en `external` devuelve `due_cents` pero `can_pay:false`).
  - `create_payment {session_token, split_kind:'full'|'equal'|'items'|'amount', ways?, order_item_ids?, amount_cents?, tip_cents?}` → valida sesión; calcula **en servidor** el importe: `full` = due; `equal` = `ceil(due / ways)` (mínimo 50 ¢; el último pago ajusta al restante; si `ceil*ways` supera `due`, el importe se recorta a `due` restante); `items` = suma de líneas no pagadas seleccionadas (verificando pertenencia y que no estén pagadas — si alguna ya está pagada → `ITEM_ALREADY_PAID` y el cliente refresca); `amount` = `amount_cents` con `0 < amount <= due`. Inserta `tab_payments` (`method='stripe_web'`, `status='pending'`, `split_kind`, `split_ways`, `order_item_ids`, `guest_session_id`, `pay_token` vía `generate_tab_pay_token`), crea PI en la cuenta conectada con `metadata:{type:'tab_payment', tab_payment_id, business_id}`, devuelve `{client_secret, publishable_key, amount_cents}`. Concurrencia: `pg_advisory_xact_lock(tab_id)` al calcular.
- **Webhook:** `payment_intent.succeeded` con `metadata.type='tab_payment'` → `settle_tab_payment(tab_payment_id)`; `payment_intent.payment_failed/canceled` → `tab_payments.status='failed'|'cancelled'`.
- **Web — menú:** **botón flotante "Cuenta · $X"** (visible solo con `guestTabSession` válida y `pos_payment_mode='stripe'`; polling de `summary` cada 6 s mientras esté abierto el menú — mismo estilo del `OrderStatusModal`; si `summary` devuelve `SESSION_INVALID`/`TAB_CLOSED` → oculta el botón y limpia la sesión). Hoja **"Tu cuenta"**: lista de ítems (nombre × qty, importe de línea del servidor, marca de pagado), total, pagado, **pendiente**; botón **Pagar**. Hoja **"¿Cómo quieres pagar?"** con 3 tarjetas: **Partes iguales** (stepper "¿Entre cuántos?" 2–20, muestra tu parte), **Por artículo** (checklist de ítems no pagados, total seleccionado), **Monto libre** (input con máximo = pendiente). → Stripe `PaymentElement` reutilizando **el mismo componente de pago** de `CheckoutStep` (extraer `PaymentForm` a componente compartido si aún no lo es). Al éxito: recibo (mismo `Receipt` compartido) con "Pendiente de la cuenta: $Y" o "Cuenta cerrada".
- **Handheld:** la vista de cuenta muestra **pendiente real** (`tab_balance.due_cents`) y lista de pagos recibidos (canal: M2/efectivo/QR). Cuando `due` llega a 0 por pagos QR, la cuenta se cierra sola y la mesa vuelve a **Libre** (realtime en `table_tabs`).

**PROHIBIDO en F5:** confiar en importes del cliente; permitir pago QR en modo `external`; marcar ítems pagados sin verificar pertenencia a la cuenta; cerrar la cuenta con `due > 0`; duplicar la lógica de creación de PI (reusar helper compartido); tocar el flujo de Stripe por orden (`CheckoutStep`) salvo la extracción de componentes.

**Criterios de aceptación:**
- [ ] Cuenta $100: cliente A paga "iguales ÷4" ($25) → pendiente $75 en handheld y en el teléfono de B; B paga "por artículo" ($30) → $45; mesero cobra $45 con M2 → cuenta `paid`, mesa `Libre`, sesiones de invitado revocadas.
- [ ] Dos clientes intentan pagar el mismo ítem a la vez → uno recibe `ITEM_ALREADY_PAID`.
- [ ] `amount` > pendiente → rechazado en servidor.
- [ ] Webhook reintentado no duplica el asiento (`already_settled`).
- [ ] Modo `external`: el botón flotante muestra el total pero **sin** botón Pagar.

---

### FASE F6 — Cierre en modo 2 (efectivo / tarjeta externa) + ventas con asterisco — [sin checkpoint]

**Objetivo:** D-06, D-11, D-14, D-15.

**Paso 0 (reportar):**
1. Ubica el flujo de **cierre/cobro** de cuenta en el handheld y qué escribe hoy (`pos_payments` y/o `tab_payments`; método; recibo).
2. Ubica `/dashboard/sales` y la RPC/consulta de atribución (`taken_by`, "Sin asignar").

**Cambios:**
- **Handheld:** en modo `external`, el botón de cobro ofrece **Efectivo** y **Tarjeta (terminal externa)** (no M2/Stripe). Registra `tab_payments` con `method='cash'|'card_external'`, `amount_cents = due` (o parcial si el mesero lo indica), `taken_by`, y llama `settle_tab_payment`. Imprime **recibo** (impresora del mesero: F2 selector; Bluetooth en F7). La mesa vuelve a Libre al llegar `due=0`.
- **Ventas (`/dashboard/sales` y `/dashboard/summary`):** incluir en la atribución por mesero las órdenes con `source in ('customer_tab','customer_stripe')` usando `taken_by` (D-14) y renderizar **`*`** junto al importe/línea cuando `source` es de cliente; leyenda al pie: "\* Pedido realizado por el cliente desde su teléfono". Contabilizar solo `paid_at` no nulo (D-15). "Sin asignar" se mantiene para `taken_by` null (con `*` si aplica).
- **Backfill (opcional, reportar antes):** no re-atribuir órdenes históricas.

**PROHIBIDO en F6:** habilitar M2/Stripe en modo `external`; cambiar el criterio de "pagado" del reporte; inventar comisiones.

**Criterios de aceptación:**
- [ ] Modo `external`: cerrar con efectivo registra `tab_payments.method='cash'`, imprime recibo, cuenta `paid`, mesa `Libre`.
- [ ] Ventas: un pedido `customer_tab` pagado aparece bajo el mesero de la mesa con `*`; antes de pagarse, no aparece.

---

### FASE F7 — Impresoras Bluetooth del mesero (58/80 mm, ESC/POS) + selector — [CHECKPOINT: nativo]

**Objetivo:** D-16, D-17, D-18.

**Paso 0 (ESPERAR OK):**
1. Confirma la librería y el flujo de descubrimiento/conexión del **Stripe M2** en la app (permisos pedidos, pantalla, almacenamiento del lector) para replicar la UX.
2. Evalúa y propón **una** librería ESC/POS Bluetooth compatible con **Expo SDK 56 / RN 0.85** (prebuild + config plugin o módulo con autolinking), mantenida, con soporte **Bluetooth Classic SPP** (los NT-1809/M860 típicamente son Classic; BLE solo si la librería lo soporta y el printer lo anuncia). Reporta: nombre, versión, último release, cómo se integra, y si exige **nuevo build nativo** (sí → Juan lanza EAS build por CLI). **No instales nada antes del OK.**
3. Confirma cómo se construye hoy el ESC/POS para red (para reutilizar el builder con salida por BT).
4. Verifica `app.json`/`app.config.*` y el manifest resultante para declarar permisos.

**Cambios (tras OK):**
- **Permisos Android (según documentación oficial de Android, verificada 2026-09-08):** para `targetSdk >= 31`: `BLUETOOTH_SCAN` con `android:usesPermissionFlags="neverForLocation"` y `BLUETOOTH_CONNECT` (ambos **runtime** → pedir con `PermissionsAndroid.requestMultiple` antes de escanear/conectar); legacy `BLUETOOTH` y `BLUETOOTH_ADMIN` con `android:maxSdkVersion="30"`; **no** declarar `ACCESS_FINE_LOCATION` para esto (no derivamos ubicación) salvo que la librería lo exija para Android ≤ 11, en cuyo caso `maxSdkVersion="30"`. Configúralo vía config plugin de Expo (no editar `android/` a mano si el proyecto usa prebuild).
- **BD:** MIG-E (archivo).
- **Móvil — "Mis impresoras" (ajustes del POS):** lista de impresoras Bluetooth **emparejadas en este dispositivo** (`AsyncStorage['tabpos.btPrinters'] = [{id, name, address, widthMm: 58|80, addedAt}]`), botón **Agregar impresora** → pide permisos → escanea/lista dispositivos emparejados → elegir → **elegir ancho (58/80)** → **Imprimir prueba** → guardar. Editar ancho, quitar.
- **Selector de impresión** (F2 lo creó): ahora lista **(a)** impresoras Bluetooth locales y **(b)** impresoras de red del negocio con `role in ('receipt','waiter') and is_active`; **excluye** `kitchen`/`bar` **siempre** (filtro en cliente **y** validación defensiva en el helper de impresión: si le pasan una impresora con rol kitchen/bar, lanza error). Recuerda la última usada por tipo de ticket.
- **Salida BT:** `printEscPos(printer, bytes)` — conectar → escribir en chunks (≤ 512 bytes con pequeña pausa; muchos módulos SPP baratos pierden datos con escrituras grandes) → cortar (si el modelo no tiene cutter, alimentar 3 líneas) → desconectar. Reintento ×1 con mensaje claro si falla ("Enciende la impresora y acércala").
- **Tickets:** `buildTabCodeTicket` (F2) y el **recibo** (`buildReceiptTicket`) adaptables por `widthMm`; caracteres acentuados: usar la tabla de códigos que soporte el printer (CP437/CP858; probar `ñ`, `á`) o transliterar si la librería no soporta code pages — reporta la decisión.
- **Dashboard `/dashboard/printers`:** permitir `role='waiter'`; texto de ayuda: "Las impresoras Bluetooth se agregan desde el handheld de cada mesero."

**PROHIBIDO en F7:** imprimir códigos/recibos en `kitchen`/`bar` bajo ninguna ruta; pedir permiso de ubicación sin necesidad; guardar impresoras Bluetooth en `pos_printers`; instalar librerías antes del OK; asumir que el APK actual ya trae el módulo (requiere build nuevo).

**Criterios de aceptación:**
- [ ] Emparejar NT-1809 (58) y M860 (80) en el mismo handheld; imprimir el código en ambos con formato correcto (código legible, doble tamaño, centrado, texto no cortado).
- [ ] El selector nunca muestra "Kitchen Station" ni impresoras `bar`.
- [ ] Sin permisos concedidos, la app explica y no crashea.
- [ ] Recibo de cierre (F6) imprime por BT.

---

### FASE F8 — Cierre: i18n, documentación, limpieza — [sin checkpoint]

- **i18n:** barrido EN/ES de todas las claves nuevas (web: `dashboardCommon`, `menu`, `checkout`; móvil: `pos`/`printers`/nuevos ns); conteo idéntico; sin locales hardcodeados nuevos (anotar deuda si aparece).
- **Docs en repo:** `docs/DECISIONS.md` agrega **D-83..D-105** (transcribe la tabla de la sección 2 con IDs correlativos reales del repo); `docs/ESTADO.md` y `docs/PROJECT_STATUS.md` con el estado final; `docs/CLAUDE_CODE_INSTRUCTIONS.md` con las reglas de impresión (nunca kitchen/bar) y de dinero.
- **Limpieza:** eliminar flags "Disponible pronto" de F3; revisar que no queden `console.log` de depuración; `npm audit` informativo.
- **Deuda explícita (documentar, no hacer):** rotación manual del código; pausa/tope de pedidos; NFC; fusión de mesas con sesiones de invitado (al combinar/descombinar mesas, revocar sesiones de invitado de las secundarias — **si el Paso 0 de F2 detecta que `pos_combine_tables` ya toca `table_tabs`, incluirlo en F2**).

---

## 6. CONTRATOS Y REGLAS TRANSVERSALES

### 6.1 Seguridad (aplica a toda EF/RPC nueva)
- La EF `guest-tab` usa **service role** y CORS restringido a los dominios de producción y preview (copiar la lista de `guest-pay`).
- Toda RPC nueva: `security definer`, `set search_path to ''`, `revoke all ... from public, anon, authenticated` salvo las que el cliente autenticado (staff) deba invocar (`grant execute ... to authenticated` **solo** a esas), y validación de autorización **dentro** del cuerpo con los helpers existentes.
- Nunca devolver al navegador: `access_code`, `token_hash`, `device_id` de otros, `stripe_account_id`, `guest_device_id` completo (solo sufijo de 6 en pantallas de staff).
- Errores al cliente: genéricos y estables (`code`), mensajes traducidos en el cliente.
- Logs de seguridad: en `guest_code_attempts` y `guest_device_strikes`; no loguear el código introducido.

### 6.2 Dinero
- Importes solo del servidor; `orders.total_cents` y `tab_payments.amount_cents` son la verdad; el cliente muestra lo que el servidor devuelve.
- Todas las operaciones sobre una cuenta que cambian saldo toman `pg_advisory_xact_lock(hashtextextended(tab_id::text, 0))`.
- Cierre de cuenta solo por `settle_tab_payment` con `due <= 0`.

### 6.3 Realtime / rendimiento
- Canales por `business_id` (no globales). Debounce 600 ms en refrescos (patrón existente).
- El menú público usa **polling** (6 s) para invitados anónimos (no hay sesión Supabase): `summary` y `order_status`.

### 6.4 Nombres visibles (ES / EN)
| Concepto | ES | EN |
|---|---|---|
| Cuenta (table_tabs) | Cuenta | Tab |
| Código de acceso | Código de mesa | Table code |
| Sesión de invitado | (no visible) | (no visible) |
| Agregar a la cuenta | Agregar a la cuenta de la mesa | Add to table tab |
| Esperando aprobación | Esperando aprobación del mesero | Waiting for server approval |
| Bloqueo | Dispositivo bloqueado | Device blocked |
| Impresora del mesero | Impresora del mesero | Server printer |

---

## 7. PROHIBIDO GLOBAL (TODAS LAS FASES)

1. Aplicar migraciones a producción o tocar configuración de Auth/Stripe/hCaptcha/URLs en paneles. Solo Juan/Planning.
2. Confiar en cualquier dato del cliente para dinero, mesa, cuenta, negocio o autorización.
3. Escrituras directas del cliente a `orders.tab_id/approval_status/taken_by/paid_at`, `order_items.paid_at`, `tab_payments`, `table_tabs.access_code/status`, `guest_*`.
4. Imprimir códigos o recibos del mesero en impresoras `kitchen`/`bar`.
5. Leer o intentar leer MAC address; pedir permisos de ubicación sin necesidad.
6. Cambiar firmas públicas de RPCs existentes usadas por la app (`pos_*`, `open_tab_on_table`, `attach_order_to_tab`); solo extender cuerpos o crear nuevas.
7. Tocar `public_profiles`, RLS de `users`, `stripe-webhook.verify_jwt` (debe seguir `false`), `_shared/pricing.ts` (solo reutilizar; si necesitas un cambio, propónlo en Paso 0).
8. Colores hex nuevos en el dashboard; `localStorage` para tokens de sesión de invitado.
9. Variables locales llamadas `t` en componentes con `useTranslations`.
10. Reportar trabajo no ejecutado o pushes no realizados.
11. Fusionar enums distintos aunque el texto coincida; traducir valores lógicos.
12. Instalar dependencias nativas nuevas sin OK explícito (F7).

---

## 8. PLAN DE PRUEBAS (resumen por fase; detalle en cada fase)

**Funcionales:** abrir cuenta → código → 2 teléfonos → pedidos → KDS → pagos mixtos (QR iguales/ítems/monto + M2 + efectivo) → cierre → mesa libre → cuenta nueva con código nuevo → código viejo rechazado.
**Seguridad:** fuerza bruta del código (rate limit), manipulación de `tab_id/precios/ítems`, reuso de sesión tras cierre, pago de ítem ya pagado, `add_order_no_code` en modo `stripe`, `access_code` por anon, impresión forzada a kitchen (debe fallar en helper), webhook duplicado.
**Operativas:** mesa combinada/descombinada con cuenta abierta; varios meseros asignados; sin mesero asignado; pérdida de red al imprimir; 58 vs 80 mm; permisos BT denegados.
**Regresión (obligatoria en cada fase):** pago Stripe por orden desde el menú (con y sin sesión) sigue igual; KDS/expedición sin cambios para órdenes del mesero; reservas (F9) y subchats intactos; ocupación de mesas correcta.

---

## 9. ORDEN DE ENTREGA Y CADENCIA

| Fase | Rama | Checkpoint Paso 0 | Migración | Entrega |
|---|---|---|---|---|
| F1 | `feat/tabpos-f1-payment-mode` | No | MIG-A | SHA + reporte |
| F2 | `feat/tabpos-f2-tab-code` | **Sí** | MIG-B | SHA + reporte |
| F3 | `feat/tabpos-f3-guest-tab` | **Sí** | MIG-C | SHA + reporte |
| F4 | `feat/tabpos-f4-approval` | **Sí** | (usa MIG-B/C) | SHA + reporte |
| F5 | `feat/tabpos-f5-qr-pay` | **Sí** | MIG-D | SHA + reporte |
| F6 | `feat/tabpos-f6-external-close-sales` | No | — | SHA + reporte |
| F7 | `feat/tabpos-f7-bt-printers` | **Sí** | MIG-E | SHA + reporte + **EAS build por Juan** |
| F8 | `feat/tabpos-f8-i18n-docs` | No | — | SHA + reporte |

Después de cada entrega: Planning verifica push (`list_commits`), audita `get_commit full_patch`, aplica la migración por MCP, y Juan prueba en preview (web) / build (móvil) y hace `git fetch origin && git merge --ff-only origin/<rama>` + `git push`. Ninguna fase arranca sin el merge de la anterior.

**Fin del documento.**
