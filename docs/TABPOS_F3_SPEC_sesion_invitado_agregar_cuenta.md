# TAB POS — FASE F3: Sesión de invitado por código + "Agregar a la cuenta" desde el menú

**Versión:** 1.0 · **Fecha:** 2026-09-09 · **Autor:** Planning Claude (Fable)
**Documentos padre:** `TABPOS_PLAN_CUENTAS_CODIGO_v1.md` (reglas 0, decisiones 2, PROHIBIDO 7) y `TABPOS_F2_SPEC_codigo_de_mesa.md` (Variante T aplicada en prod, migración 160). **Léelos antes.**
**Rama:** `feat/tabpos-f3-guest-tab` desde `origin/main @ 87157f6` (F2 mergeada). **Checkpoint:** SÍ — Paso 0 y **espera OK** (dinero + seguridad).
**Migración:** `161_guest_tab.sql` (siguiente a 160). Planning aplica por MCP; tú solo versionas.

---

## 0. Tarea previa obligatoria (1 commit pequeño, misma rama, antes del Paso 0)

**Sincronizar `160_table_access_code.sql` con lo aplicado en producción.** En la sección 10 del archivo, `create or replace function public.pos_tables_overview(...)` **falla** al aplicarse porque el `RETURNS TABLE` cambió (PostgreSQL 42P13). En producción se aplicó con `drop` + `create`. Edita el archivo para que quede exactamente:

```sql
-- pos_tables_overview: DROP + CREATE (cambia el tipo de retorno; no se puede REPLACE)
drop function if exists public.pos_tables_overview(uuid);
create function public.pos_tables_overview(p_business_id uuid)
```
(y elimina el `or replace` de esa función únicamente). Nada más cambia en 160. Commit: `fix(migrations): 160 drop+create pos_tables_overview (sync con prod)`.

---

## 1. Objetivo de F3

Al terminar F3, desde el **menú público por QR** (`/m/[slug]` llegando por `/t/[qr_token]`):

1. El cliente puede **ingresar el código de mesa** (6 dígitos, F2) y obtener una **sesión de invitado** ligada a la **sesión de ocupación de esa mesa** (Variante T).
2. Con esa sesión, en el paso de confirmar/pagar ve, según el modo del negocio (F1):
   - **`stripe`:** **Pagar ahora** (flujo actual, intacto) **o** **Agregar a la cuenta de la mesa** (D-04).
   - **`external`:** **sin Stripe**; **Enviar a la cuenta**: con código → directo a cocina; sin código → botón deshabilitado "Disponible en breve" hasta F4 (D-05, gating ya activo).
3. **Agregar a la cuenta** crea la orden **en servidor** (precios de BD, nunca del cliente), **adjunta a la mesa** (`table_id` desde la sesión), con `source='customer_tab'`, `taken_by` según D-14, **sin pago** (`paid_at=null`), y la orden entra al **mismo saldo de mesa** que ve el mesero (`pos_table_session.open_total_cents`, `pos_tab_total`) y al **KDS**.
4. Seguridad: rate limit del código, bloqueo por dispositivo (esquema y verificación listos; los strikes se generan en F4), token opaco con hash, sesión que muere cuando la mesa se libera.
5. **Puente de impresión de comandas (D-24, aprobado por Juan):** toda orden del cliente creada por una EF (`customer_tab` **y** `customer_stripe`) **imprime su comanda a cocina/bar por estación** igual que las del mesero. Como la nube no alcanza la impresora del local, el **handheld del mesero** (cualquiera con el POS abierto) la imprime al recibirla por Realtime, con un **reclamo atómico** en BD para que nunca salga duplicada aunque haya varios handhelds. Ver sección 6.5.

F3 **no** implementa: aprobación del mesero (F4), pago de la cuenta por QR (F5), botón flotante de saldo (F5), ni la "Estación de impresión" (agente permanente en el local — fase propia después de F8).

---

## 2. Hechos verificados por Planning (2026-09-09, `main @ 87157f6` + BD)

### 2.1 Cómo nacen las órdenes hoy (dos formas distintas — F3 calca la del mesero)
| Camino | Quién inserta | `status` | `paid_at` | `total_cents` | `order_items.item_status` | Llega a KDS | Imprime comanda |
|---|---|---|---|---|---|---|---|
| Mesero (`pos_create_order`) | RPC | `'preparing'` | `null` | `= subtotal` (sin impuesto a nivel orden) | `'pending'` | Realtime INSERT | **Sí, desde el handheld** (`printKitchenTickets` fire-and-forget tras la RPC) |
| Cliente Stripe (`guest-pay`/`payments` → **webhook**) | `stripe-webhook` en `payment_intent.succeeded` | `'confirmed'` | `now()` | subtotal+tax(+tip−desc) | `'pending'` | Realtime INSERT | **No** (nada la imprime) |

**Regla F3:** las órdenes "a la cuenta" del cliente se insertan **con la forma del mesero** (`status='preparing'`, `paid_at=null`, `total_cents=subtotal_cents`, `tax_cents=0`, `order_type='table'`, ítems `'pending'`) porque entran al mismo saldo por mesa que los pedidos del mesero. **Paridad de impresión:** igual que las órdenes Stripe de hoy, **no imprimen comanda** en F3 (solo KDS). Ver D-24.

### 2.2 `guest-pay` (patrón a calcar, NO duplicar)
- Endpoint público (`verify_jwt=false`), CORS `*`, `Deno.serve`, `switch(action)`.
- **hCaptcha** server-side (`verifyCaptcha(token, remoteip)` con `HCAPTCHA_SECRET`, token de un solo uso; IP desde `x-forwarded-for`/`cf-connecting-ip`).
- **Precios:** `priceLinesFromDb(db, businessId, items) → { lineUnitCents[], resolvedOptions[], subtotalCents } | { error, status }` y `computeTaxCents`, `TAX_FALLBACK` desde `../_shared/pricing.ts`. `items[]` = `{ menu_item_id, qty (int ≥1), options?, special_instructions? }`.
- **Mesa:** resuelve `tables` por `qr_token` + `is_active` y exige `business_id` igual (`"La mesa no pertenece a este negocio"`).
- Gate de negocio: `businessChargeGate` (`../_shared/connect.ts`) — **solo aplica a cobros Stripe**; para "a la cuenta" **no** se exige Stripe habilitado.
- `contact_name` opcional (≤60), email opcional.

### 2.3 Webhook y `tab-pay` (para F5; F3 no los toca)
`stripe-webhook` ya enruta `metadata.payment_kind='tab_settlement'` + `tab_payment_id` → `settle_tab_payment`. Existe EF `supabase/functions/tab-pay/`. **No modificar en F3.**

### 2.4 Estado F2 en producción (Variante T)
`tables.access_code` (6 dígitos, único por negocio entre sesiones abiertas), `session_opened_at`, `session_opened_by` (user_id). `pos_create_order` abre sesión en la primera orden. `trg_table_session_autoclose` limpia los tres campos al pagar/cancelar la última orden abierta. `pos_table_session` es el único lector del código para staff. `anon` **no** puede leer `access_code`. `pos_tables_overview.has_access_code`.

### 2.5 Columnas de `orders` que F3 necesita y **aún no existen** (MIG-B.3 del plan no se ha aplicado)
`source`, `approval_status`, `approved_by`, `approved_at`, `rejected_reason`, `guest_device_id`, `guest_session_id`. Van en `161`.

### 2.6 Web
- `web/app/t/[token]/TableEntry.tsx` guarda `sessionStorage['jchat.tableContext'] = {token, tableLabel, businessSlug}`.
- `web/app/m/[slug]/MenuPageClient.tsx` (70 KB): lee `TABLE_CONTEXT_KEY` solo si `businessSlug` coincide; banda "Estás en la mesa X"; `CartSheet`; `PickupSheet` (permite escribir mesa a mano → **sin token**); `CheckoutStep` (Stripe con/sin sesión, hCaptcha invisible para invitados).
- `orders.taken_by` = **user id**.

---

## 3. PASO 0 (reportar con plantilla 0.2 y ESPERAR OK)

1. **Carga pública del negocio en `/m/[slug]`:** archivo/consulta exacta con la que `page.tsx` obtiene el negocio (¿`select` directo con anon? ¿vista? ¿RPC?). Reporta si `pos_payment_mode` ya es legible por `anon` en esa ruta (policy de `select` en `businesses` y columnas expuestas). Si no lo es, propón la forma **mínima** de exponer **solo** `pos_payment_mode` (p. ej. añadirlo al `select` explícito si la policy pública ya permite la fila; **no** abrir columnas sensibles).
2. **hCaptcha en web:** cómo `CheckoutStep` obtiene el token invisible (componente/hook, site key, dónde se renderiza) para reutilizarlo en `TabCodeSheet`. Confirma que el token es de un solo uso y cómo se refresca en reintentos.
3. **`CheckoutStep` y `MenuPageClient`:** líneas exactas donde (a) se decide invitado vs. sesión, (b) se llama a `guest-pay`/`payments`, (c) se muestra el botón de pagar. Propón dónde insertar `CheckoutChoiceSheet` **sin modificar** la lógica de Stripe (solo envolver/condicionar la entrada).
4. **`priceLinesFromDb`:** firma y forma exacta de `resolvedOptions` (para insertar `order_items.options` igual que el webhook) y errores devueltos (`MENU_ITEM_UNAVAILABLE` equivalente).
5. **KDS y comandas:** confirma (a) que el KDS web/móvil toma órdenes por Realtime INSERT en `orders` sin filtrar por `status` (o cuáles acepta), y (b) que **ninguna** ruta imprime comandas para órdenes creadas por el webhook (paridad D-24). Si el KDS filtra por `status in (...)`, reporta el conjunto para que `'preparing'` entre.
6. **`config.toml` de Edge Functions:** cómo está declarado `guest-pay` (`verify_jwt=false`) para replicarlo en `guest-tab`. Y cómo se despliegan las EFs en este proyecto (¿`supabase functions deploy` por Juan/CLI? ¿CI?). **F3 no despliega**: reporta el comando que Juan debe correr.
7. **Realtime en el handheld:** confirma que `PosTableHub`/`PosHomeScreen` refrescan al INSERT de `orders` del negocio (para que el mesero vea el pedido del cliente sin recargar). Si solo escuchan UPDATE, propón el cambio mínimo (añadir `INSERT` al canal existente).
8. **Diferencias** entre este documento y el código/BD real.

---

## 4. Migración `161_guest_tab.sql` (Planning aplica; escribe el archivo completo tal cual, dentro de `begin/commit`)

```sql
-- 161: Sesión de invitado por código de mesa + origen/aprobación de órdenes — Tab POS · F3 · D-04/D-05/D-08/D-14.
begin;

-- ── 1. Columnas en orders (MIG-B.3 del plan) ─────────────────────────────────
alter table public.orders
  add column if not exists source           text not null default 'pos',
  add column if not exists approval_status  text,
  add column if not exists approved_by      uuid,
  add column if not exists approved_at      timestamptz,
  add column if not exists rejected_reason  text,
  add column if not exists guest_device_id  text,
  add column if not exists guest_session_id uuid;
alter table public.orders drop constraint if exists orders_source_chk;
alter table public.orders add constraint orders_source_chk
  check (source in ('pos','app','customer_stripe','customer_tab'));
alter table public.orders drop constraint if exists orders_approval_status_chk;
alter table public.orders add constraint orders_approval_status_chk
  check (approval_status is null or approval_status in ('awaiting','approved','rejected'));
create index if not exists orders_awaiting_idx on public.orders (business_id, created_at) where approval_status = 'awaiting';
create index if not exists orders_guest_session_idx on public.orders (guest_session_id) where guest_session_id is not null;
comment on column public.orders.source is 'pos = mesero handheld; app = app JChat; customer_stripe = cliente web pagó por orden; customer_tab = cliente web agregó a la cuenta. D-14.';
comment on column public.orders.approval_status is 'null = no requiere aprobación; awaiting/approved/rejected (modo external sin código, F4). D-05/D-07.';

-- ── 2. Sesiones de invitado (ligadas a la SESIÓN DE OCUPACIÓN de la mesa, Variante T) ─
create table if not exists public.guest_tab_sessions (
  id                       uuid primary key default gen_random_uuid(),
  business_id              uuid not null references public.businesses(id) on delete cascade,
  table_id                 uuid not null references public.tables(id) on delete cascade,
  table_session_opened_at  timestamptz not null,   -- snapshot de tables.session_opened_at al crear
  device_id                text not null,
  fingerprint_hash         text,
  token_hash               text not null unique,   -- sha256 hex del token opaco entregado al navegador
  ip_hash                  text,
  user_agent               text,
  created_at               timestamptz not null default now(),
  last_seen_at             timestamptz,
  expires_at               timestamptz not null,
  revoked_at               timestamptz
);
create index if not exists guest_tab_sessions_table_idx on public.guest_tab_sessions (table_id) where revoked_at is null;
alter table public.guest_tab_sessions enable row level security;
revoke all on public.guest_tab_sessions from anon, authenticated;
alter table public.orders
  drop constraint if exists orders_guest_session_fk;
alter table public.orders
  add constraint orders_guest_session_fk foreign key (guest_session_id)
  references public.guest_tab_sessions(id) on delete set null;

-- ── 3. Intentos de código (rate limit) ───────────────────────────────────────
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
create index if not exists guest_code_attempts_ip_idx  on public.guest_code_attempts (ip_hash, created_at);
alter table public.guest_code_attempts enable row level security;
revoke all on public.guest_code_attempts from anon, authenticated;

-- ── 4. Strikes y bloqueos de dispositivo (esquema en F3; los strikes se escriben en F4) ─
create table if not exists public.guest_device_strikes (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  device_id   text not null,
  order_id    uuid references public.orders(id) on delete set null,
  created_by  uuid,
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
create policy guest_device_blocks_staff_read on public.guest_device_blocks
  for select to authenticated
  using (public.is_employee_of_business(business_id)
         or exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
         or public.is_platform_admin());

-- ── 5. Idempotencia de pedidos de invitado ───────────────────────────────────
create table if not exists public.guest_order_idempotency (
  idempotency_key text primary key,
  business_id     uuid not null,
  order_id        uuid not null references public.orders(id) on delete cascade,
  created_at      timestamptz not null default now()
);
alter table public.guest_order_idempotency enable row level security;
revoke all on public.guest_order_idempotency from anon, authenticated;

-- ── 6. Atribución D-14 (Variante T) ─────────────────────────────────────────
-- Devuelve el user_id del mesero al que se atribuye un pedido del cliente en esta mesa:
-- 1) quien abrió la sesión de la mesa; 2) el único mesero asignado; 3) el más antiguo; 4) null.
create or replace function public.resolve_table_waiter_for_attribution(p_table_id uuid)
returns uuid language sql stable security definer set search_path to '' as $$
  select coalesce(
    (select t.session_opened_by from public.tables t where t.id = p_table_id and t.session_opened_by is not null),
    (select e.user_id from public.table_waiters tw join public.employees e on e.id = tw.employee_id
      where tw.table_id = p_table_id order by tw.created_at asc limit 1)
  );
$$;
revoke all on function public.resolve_table_waiter_for_attribution(uuid) from public, anon, authenticated;

-- ── 7. Validar sesión de invitado (uso interno por la EF con service role) ────
-- Válida solo si: no revocada, no expirada, y la mesa sigue en LA MISMA sesión de ocupación
-- (mismo session_opened_at) con código vigente. Actualiza last_seen_at.
create or replace function public.guest_tab_session_validate(p_token_hash text)
returns table(session_id uuid, business_id uuid, table_id uuid, table_label text, device_id text, session_opened_at timestamptz)
language plpgsql security definer set search_path to '' as $$
begin
  return query
  with s as (
    select g.* from public.guest_tab_sessions g
    where g.token_hash = p_token_hash and g.revoked_at is null and g.expires_at > now()
  )
  select s.id, s.business_id, s.table_id, t.label, s.device_id, t.session_opened_at
  from s join public.tables t on t.id = s.table_id
  where t.is_active = true
    and t.access_code is not null
    and t.session_opened_at = s.table_session_opened_at;
  if found then
    update public.guest_tab_sessions set last_seen_at = now() where token_hash = p_token_hash;
  end if;
end $$;
revoke all on function public.guest_tab_session_validate(text) from public, anon, authenticated;

-- ── 8. Al cerrar la sesión de la mesa, revocar sesiones de invitado (higiene; la validación por snapshot ya las invalida) ─
create or replace function public.trg_fn_table_session_autoclose()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if ((new.paid_at is not null and old.paid_at is null) or (new.canceled_at is not null and old.canceled_at is null)) then
    if new.table_id is not null and not exists (
      select 1 from public.orders o where o.table_id = new.table_id and o.id <> new.id and o.paid_at is null and o.canceled_at is null
    ) then
      update public.tables set access_code = null, session_opened_at = null, session_opened_by = null where id = new.table_id;
      update public.guest_tab_sessions set revoked_at = now() where table_id = new.table_id and revoked_at is null;
    end if;
  end if;
  return new;
end $$;
-- pos_close_table_session también debe revocar: reescribe su cuerpo (copiar de la BD) añadiendo
--   update public.guest_tab_sessions set revoked_at = now() where table_id = p_table_id and revoked_at is null;
-- justo después del update de tables.

-- ── 9. Puente de impresión de comandas: reclamo atómico (D-24) ───────────────
alter table public.orders
  add column if not exists comanda_printed_at  timestamptz,
  add column if not exists comanda_claimed_at  timestamptz,
  add column if not exists comanda_claimed_by  uuid;
create index if not exists orders_comanda_pending_idx
  on public.orders (business_id, created_at)
  where comanda_printed_at is null and source in ('customer_stripe','customer_tab');

-- Reclamar la impresión de UNA orden: solo un dispositivo gana. El reclamo caduca a los 2 min
-- (si el ganador se cayó sin marcar impreso, otro puede reintentar).
create or replace function public.pos_claim_comanda_print(p_business_id uuid, p_order_id uuid)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); v_won int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not (public.pos_can_access(p_business_id)
          or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = v_uid)) then
    raise exception 'NOT_ALLOWED';
  end if;
  update public.orders o
     set comanda_claimed_at = now(), comanda_claimed_by = v_uid
   where o.id = p_order_id and o.business_id = p_business_id
     and o.comanda_printed_at is null
     and o.canceled_at is null
     and coalesce(o.approval_status, 'approved') <> 'awaiting'
     and (o.comanda_claimed_at is null or o.comanda_claimed_at < now() - interval '2 minutes');
  get diagnostics v_won = row_count;
  return v_won = 1;
end $$;
revoke all on function public.pos_claim_comanda_print(uuid, uuid) from public, anon;
grant execute on function public.pos_claim_comanda_print(uuid, uuid) to authenticated;

create or replace function public.pos_mark_comanda_printed(p_business_id uuid, p_order_id uuid)
returns void language sql security definer set search_path to '' as $$
  update public.orders set comanda_printed_at = now()
   where id = p_order_id and business_id = p_business_id and comanda_claimed_by = auth.uid();
$$;
revoke all on function public.pos_mark_comanda_printed(uuid, uuid) from public, anon;
grant execute on function public.pos_mark_comanda_printed(uuid, uuid) to authenticated;

create or replace function public.pos_release_comanda_print(p_business_id uuid, p_order_id uuid)
returns void language sql security definer set search_path to '' as $$
  update public.orders set comanda_claimed_at = null, comanda_claimed_by = null
   where id = p_order_id and business_id = p_business_id and comanda_claimed_by = auth.uid() and comanda_printed_at is null;
$$;
revoke all on function public.pos_release_comanda_print(uuid, uuid) from public, anon;
grant execute on function public.pos_release_comanda_print(uuid, uuid) to authenticated;

-- Órdenes del cliente pendientes de comanda (catch-up al abrir el POS): últimas 12 h.
create or replace function public.pos_pending_comandas(p_business_id uuid)
returns table(order_id uuid, table_label text, created_at timestamptz)
language sql stable security definer set search_path to '' as $$
  select o.id, o.table_label, o.created_at
  from public.orders o
  where o.business_id = p_business_id
    and public.pos_can_access(p_business_id)
    and o.source in ('customer_stripe','customer_tab')
    and o.comanda_printed_at is null
    and o.canceled_at is null
    and coalesce(o.approval_status, 'approved') <> 'awaiting'
    and o.created_at > now() - interval '12 hours'
  order by o.created_at asc;
$$;
revoke all on function public.pos_pending_comandas(uuid) from public, anon;
grant execute on function public.pos_pending_comandas(uuid) to authenticated;

commit;
```
> Los `create or replace` de `trg_fn_table_session_autoclose` y `pos_close_table_session` **reemplazan cuerpos existentes**: copia el cuerpo real desde la BD (los tienes en F2) y agrega solo la línea de revocación.

---

## 5. Edge Function `supabase/functions/guest-tab/index.ts` (nueva; service role; `verify_jwt=false`)

Estructura, CORS, `jsonResponse/errorResponse`, `getAdminClient`, `verifyCaptcha` e IP: **copia el patrón de `guest-pay`**. Errores: `{ error: { code, message, retry_after_s?, blocked_until? } }` con HTTP 4xx; `code` estable en mayúsculas (el cliente traduce por `code`).

Constantes en `supabase/functions/_shared/guestPolicy.ts` (nuevo): `CODE_ATTEMPTS_PER_DEVICE = 5 / 5 min`, `CODE_ATTEMPTS_PER_TABLE = 10 / 10 min`, `CODE_ATTEMPTS_PER_IP = 20 / 10 min`, `GUEST_SESSION_TTL_HOURS = 8`, `STRIKES_TO_BLOCK = 2`, `BLOCK_DAYS = 30`. Helpers: `sha256Hex(s)`, `hashIp(ip)` (sha256 de ip + `GUEST_IP_SALT` secreto; si no hay salt, sha256 simple y `console.warn`).

| action | input | output 200 | errores |
|---|---|---|---|
| `create_session` | `{ table_qr_token, access_code (6 dígitos), device_id (uuid), fingerprint (hex), captcha_token }` | `{ session_token, expires_at, table_label, business: { id, slug, name, pos_payment_mode } }` | `CAPTCHA_FAILED`(403), `TABLE_NOT_FOUND`(404), `DEVICE_BLOCKED`(403, `blocked_until`), `RATE_LIMITED`(429, `retry_after_s`), `CODE_INVALID`(401, mensaje genérico) |
| `session_status` | `{ session_token }` | `{ ok:true, table_label, pos_payment_mode, expires_at }` | `SESSION_INVALID`(401) |
| `add_order` | `{ session_token, idempotency_key (uuid), items[], contact_name?, notes? }` | `{ order_id, approval_status: null, subtotal_cents, total_cents, items:[{ name, qty }] }` | `SESSION_INVALID`(401), `DEVICE_BLOCKED`(403), `MENU_ITEM_UNAVAILABLE`(409), `EMPTY_CART`(400), `VALIDATION`(400) |

**`create_session` — orden exacto:**
1. Validar forma: `access_code` `/^\d{6}$/`, `device_id` uuid v4, `fingerprint` 8–128 hex, `captcha_token` no vacío.
2. `verifyCaptcha` → si falla `CAPTCHA_FAILED`.
3. Resolver `tables` por `qr_token` + `is_active` (select `id, business_id, label, access_code, session_opened_at`) → si no, `TABLE_NOT_FOUND`.
4. Bloqueo: `guest_device_blocks` con `business_id`, `device_id`, `unblocked_at is null`, `blocked_until > now()` → `DEVICE_BLOCKED`.
5. Rate limit: contar `guest_code_attempts` por `device_id` (5 min), por `table_id` (10 min) y por `ip_hash` (10 min); si supera cualquiera → **insertar intento `success=false`** y `RATE_LIMITED` con `retry_after_s`.
6. Insertar intento (`success=false` por defecto). Comparar `access_code` (**igualdad exacta de strings**, en servidor) y exigir `session_opened_at is not null`. Si no coincide → `CODE_INVALID` (mensaje genérico; **no** revelar si la mesa tiene sesión).
7. Generar `token` = 32 bytes aleatorios en base64url; `token_hash = sha256Hex(token)`; insertar `guest_tab_sessions` con `table_session_opened_at = tables.session_opened_at`, `expires_at = now() + 8h`, `ip_hash`, `user_agent` (≤200). Marcar el intento `success=true`.
8. Cargar `businesses` (`id, slug, name, pos_payment_mode`) y responder. **Nunca** devolver `access_code`.

**`add_order` — orden exacto:**
1. `guest_tab_session_validate(sha256Hex(session_token))` → si vacío, `SESSION_INVALID`.
2. Bloqueo activo del `device_id` de la sesión → `DEVICE_BLOCKED`.
3. **Idempotencia:** si `guest_order_idempotency[idempotency_key]` existe y su `business_id` coincide → devolver la misma respuesta (recargar orden). Si existe con otro negocio → `VALIDATION`.
4. Validar `items[]` como `guest-pay`; `contact_name` ≤60; `notes` ≤200.
5. `priceLinesFromDb(db, business_id, items)` → error → `MENU_ITEM_UNAVAILABLE`/`VALIDATION`.
6. **Transacción lógica** (service role; si falla el insert de ítems, `delete` de la orden y error 500): insertar `orders` con `business_id`, `table_id`, `table_label` (de la mesa, **no** del cliente), `order_type='table'`, `status='preparing'`, `source='customer_tab'`, `approval_status=null`, `guest_device_id`, `guest_session_id`, `contact_name`, `notes`, `subtotal_cents`, `tax_cents=0`, `tip_cents=0`, `discount_cents=0`, `total_cents=subtotal_cents`, `paid_at=null`, `taken_by = resolve_table_waiter_for_attribution(table_id)` (llamar por `db.rpc`), `status_updated_at=now()`. Insertar `order_items` con `price_cents=lineUnitCents[i]`, `options=resolvedOptions[i]`, `special_instructions`, `item_status='pending'`. Insertar `guest_order_idempotency`.
7. **Inventario:** replicar el descuento de stock de `pos_create_order` **solo si** en el Paso 0 confirmas que las órdenes del webhook también descuentan (si el webhook **no** descuenta stock, F3 tampoco — paridad; anótalo como deuda). No inventes una tercera lógica.
8. Responder con `items[{name, qty}]` (nombres desde `menu_items`) y totales del servidor.

**`session_status`:** validar y devolver `pos_payment_mode` actual (el cliente lo usa al reabrir la página).

Despliegue: **no** lo haces tú; incluye `guest-tab` en `supabase/config.toml` igual que `guest-pay` y reporta el comando (`supabase functions deploy guest-tab`) para Juan. Secretos requeridos: los mismos de `guest-pay` + opcional `GUEST_IP_SALT`.

---

## 6. Web (menú público)

### 6.1 Helpers
- `web/lib/guestDevice.ts`: `getDeviceId()` → uuid v4 persistido en `localStorage['tabpos.deviceId']` (fallback `sessionStorage`, luego efímero); `getFingerprint()` → sha256 hex (Web Crypto) de `[navigator.userAgent, navigator.language, screen.width, screen.height, devicePixelRatio, Intl timezone, hardwareConcurrency]`.
- `web/lib/guestTabSession.ts`: `GUEST_TAB_KEY = 'tabpos.guestTabSession'` en **`sessionStorage`** con `{ token, expiresAt, tableLabel, businessSlug, posPaymentMode }`; `read(slug)` (solo si `businessSlug === slug` y no expirada), `save`, `clear`. Cliente `guestTab.createSession/addOrder/sessionStatus` que llama a la EF con `fetch` (misma forma que `guest-pay` — reutiliza el helper de invocación si existe).

### 6.2 Componentes nuevos (`web/app/m/[slug]/`)
- **`TabCodeSheet`**: 6 casillas numéricas (`inputMode="numeric"`, autoavance, pegar, teclado numérico móvil), botón "Entrar", hCaptcha invisible (mismo mecanismo que `CheckoutStep`), estados: cargando, `CODE_INVALID` ("Código no válido. Revisa el código de tu mesa o pide ayuda a tu mesero"), `RATE_LIMITED` (cuenta regresiva `retry_after_s`), `DEVICE_BLOCKED` ("No puedes pedir desde este dispositivo. Pide ayuda a tu mesero"), `TABLE_NOT_FOUND`, `CAPTCHA_FAILED` (reintentar con token nuevo).
- **`CheckoutChoiceSheet`** (solo cuando hay `tableCtx` por QR): lee `pos_payment_mode` del negocio.
  - `stripe`: **"Pagar ahora"** → flujo actual (`CheckoutStep`) **sin cambios**; **"Agregar a la cuenta de la mesa"** → si no hay sesión → `TabCodeSheet` → `add_order`; si hay → `add_order` directo.
  - `external`: **sin Stripe**. "Enviar a la cuenta" → con sesión → `add_order`; sin sesión → "¿Tienes el código de tu mesa?" → **Sí** → `TabCodeSheet`; **No** → botón deshabilitado con texto "Pedidos sin código: disponible en breve" (F4 lo habilita).
  - Sin `tableCtx` (entrada manual): `stripe` → solo "Pagar ahora"; `external` → aviso "Escanea el QR de tu mesa para pedir", sin envío.
- **`TabOrderConfirmation`**: "Pedido agregado a la cuenta · Mesa {label}", lista `qty × nombre` (sin precios de línea), total del servidor, botón "Ver estado de mis órdenes" (`OrderStatusModal` existente), botón "Seguir pidiendo" (vacía el carrito local).
- **Banda de mesa**: si hay sesión de invitado, muestra "Cuenta de la mesa activa" y "Salir" (`clear()` local). Al cargar la página con sesión guardada, llamar `session_status`; si `SESSION_INVALID` → `clear()` silencioso.

### 6.3 i18n
Namespaces existentes `menu`/`checkout` (verifica cuál usa `MenuPageClient`). Claves: `tabCode.*` (title, subtitle, enter, invalid, rateLimited, blocked, tableNotFound, captchaFailed), `checkoutChoice.*` (payNow, addToTab, sendToTab, haveCode, yes, no, noCodeSoon, scanQrToOrder), `tabOrder.*` (addedTitle, viewStatus, keepOrdering), `tableBand.tabActive`, `tableBand.leaveTab`. EN/ES paridad.

### 6.4 Móvil — Realtime
Si el Paso 0 punto 7 lo exige, añadir `INSERT` a la suscripción Realtime de `PosTableHub`/`PosHomeScreen` para que el pedido del cliente aparezca sin recargar.

### 6.5 Móvil — Puente de impresión de comandas (D-24, obligatorio en F3)
Nuevo hook **`mobile/hooks/useComandaPrintBridge.ts`** montado **una sola vez** en el nivel del POS (donde viva la sesión POS activa: `PosNavigator`/`PosHomeScreen` — decidir en Paso 0), activo mientras el POS esté en primer plano y haya `businessId`:

1. **Suscripción:** canal Realtime `pos-comanda-bridge-${businessId}` a `postgres_changes` `INSERT` en `orders` filtrado por `business_id=eq.${businessId}`. Al recibir una fila con `source in ('customer_stripe','customer_tab')` y `approval_status` null → `tryPrint(orderId, tableLabel)`.
2. **Catch-up:** al montar y en cada `AppState` → `active`, llamar `pos_pending_comandas(businessId)` y procesar en orden (cubre el caso "no había ningún handheld abierto").
3. **`tryPrint(orderId, tableLabel)`:** `pos_claim_comanda_print` → si `false`, salir (otro dispositivo la tiene). Si `true` → `printKitchenTickets({ businessId, orderId, tableLabel, serverName: null })` (mismo helper; ticket idéntico al del mesero; si el negocio no tiene impresoras de estación configuradas, `printKitchenTickets` ya lo omite en silencio → marcar impreso igualmente para no reintentar eternamente). Éxito → `pos_mark_comanda_printed`. Fallo real de impresión (socket) → `pos_release_comanda_print` y reintento único a los 30 s; si vuelve a fallar, dejar liberado (otro dispositivo o el próximo catch-up lo tomará) y mostrar un aviso discreto en el handheld ("Comanda de mesa X pendiente de imprimir — revisa la impresora").
4. **Anti-duplicado local:** `Set` en memoria de `orderId` procesados en la sesión para no reintentar por eventos repetidos.
5. **Ticket:** `printKitchenTickets` necesita `tableLabel`; para `counter`/sin mesa usa `t('pos.pickupTitle')`-equivalente ("Mostrador"). `serverName`: "Cliente" (i18n `pos.comandaCustomer`) para distinguir en cocina que fue pedido por el cliente.
6. **No** aplicar el puente a `source='pos'` (esas ya imprimen desde su propio flujo).

### 6.6 Webhook — una línea (excepción explícita al PROHIBIDO)
En `stripe-webhook` `handlePaymentSucceeded`, en el `insert` de `orders`, añadir **`source: "customer_stripe"`**. Es la única modificación permitida al webhook en F3 (sin ella, las órdenes Stripe quedan con `source='pos'` por default y el puente no las ve). Reporta el diff exacto (debe ser +1 línea).

---

## 7. PROHIBIDO en F3 (además del global)
1. Modificar la lógica de `CheckoutStep`, `payments`, `guest-pay`, `tab-pay`, `_shared/pricing.ts`, `_shared/connect.ts` (solo importar/invocar). En `stripe-webhook` **solo** la línea `source: "customer_stripe"` de 6.6 — nada más.
2. Confiar en `table_id`, `business_id`, precios, totales o `pos_payment_mode` enviados por el cliente para decidir nada en servidor.
3. Devolver `access_code` al navegador; guardar el token de sesión en `localStorage`; loguear el código introducido.
4. Crear la orden con `status='confirmed'`/`paid_at` (eso es el webhook); crear órdenes con `approval_status='awaiting'` (F4).
5. Permitir "Agregar a la cuenta" sin `tableCtx` por QR (entrada manual de mesa).
6. Desplegar EFs o aplicar la migración.
7. Duplicar la lógica de precios o de hCaptcha.

---

## 8. Criterios de aceptación

**BD (Planning por SQL tras aplicar 161):**
- [ ] Columnas nuevas en `orders` con sus CHECK; tablas `guest_tab_sessions`, `guest_code_attempts`, `guest_device_strikes`, `guest_device_blocks`, `guest_order_idempotency` con RLS y sin grants a `anon/authenticated` (salvo la policy de lectura de bloqueos para staff).
- [ ] `resolve_table_waiter_for_attribution` devuelve `session_opened_by` cuando existe; si no, el mesero más antiguo; si no, null.
- [ ] `guest_tab_session_validate` devuelve fila con token válido y **nada** tras liberar la mesa o cambiar `session_opened_at`.

**Funcional (Juan, en preview + Metro):**
- [ ] QR → menú → "Agregar a la cuenta" → código correcto → pedido creado; el handheld muestra el pedido y el total sube sin recargar; el KDS lo muestra.
- [ ] Dos teléfonos con el mismo código → sesiones distintas, ambos piden a la misma mesa.
- [ ] Código incorrecto → "Código no válido"; 6.º intento → cuenta regresiva.
- [ ] Cobrar toda la mesa → el teléfono, al intentar otro pedido, recibe `SESSION_INVALID` y vuelve a pedir código; abrir mesa nueva → el código viejo no sirve.
- [ ] Manipular precios/`table_id`/`business_id` en el request → la orden en BD no cambia (precios de BD, mesa de la sesión).
- [ ] Reintentar `add_order` con el mismo `idempotency_key` → no duplica.
- [ ] Modo `external`: no aparece Stripe; sin código el botón queda deshabilitado con el aviso.
- [ ] Modo `stripe`: "Pagar ahora" funciona exactamente como antes (regresión).
- [ ] `orders.source='customer_tab'`, `taken_by` = mesero que abrió la sesión, `paid_at=null`, `status='preparing'`.

**Puente de impresión (Juan, con impresora real):**
- [ ] Pedido del cliente "a la cuenta" con un handheld abierto → comanda impresa en cocina y/o bar según la estación de cada ítem; `orders.comanda_printed_at` queda marcado.
- [ ] **Dos handhelds abiertos** a la vez → **una sola** comanda (el reclamo gana en uno; el otro sale en silencio).
- [ ] Pedido Stripe desde el menú → también imprime (fix del bug preexistente); `orders.source='customer_stripe'`.
- [ ] Sin ningún handheld abierto → el pedido queda en KDS; al abrir el POS en cualquier handheld, imprime lo pendiente (catch-up de 12 h) sin duplicar.
- [ ] Impresora apagada → el reclamo se libera, reintenta 1 vez, muestra aviso; al encenderla y reabrir el POS, imprime.
- [ ] Órdenes del mesero (`source='pos'`) siguen imprimiendo exactamente como antes (regresión).

**Calidad:** tsc/build web verdes; tsc móvil sin errores nuevos; EN/ES paridad; entrega 0.3 con SHA, `160` corregido y `161` incluido, y el comando de deploy de `guest-tab` **y** `stripe-webhook` (por la línea nueva) para Juan.

---

## 9. Decisiones de producto tomadas con Juan (2026-09-09)
- **D-24 — Toda orden imprime su comanda, siempre**, a cocina y/o bar según la estación de cada artículo (un solo printer = misma IP en ambos slots, ya soportado). Las órdenes creadas por EF (Stripe y "a la cuenta") las imprime el **handheld del mesero como puente**, con **reclamo atómico** anti-duplicados y **catch-up** al abrir el POS. Esto **corrige el bug preexistente** de que las órdenes Stripe no imprimían. **Requisito operativo aceptado:** debe haber al menos un handheld del negocio con el POS abierto para que salgan las comandas de pedidos del cliente; si no lo hay, salen al abrir el siguiente.
- **D-25 — "Estación de impresión" (agente permanente en el local):** modo dedicado de la app en un dispositivo enchufado (p. ej. la tablet del KDS) que imprime siempre sin intervención del dueño. **Fase propia después de F8.** Requiere *foreground service* en Android (verificar doc oficial al diseñarla).
- **D-26 — Cloud print** (Star CloudPRNT / Epson ePOS Cloud): fuera de alcance por ahora; opción futura para negocios con impresoras compatibles.

**Fin del spec F3.**
