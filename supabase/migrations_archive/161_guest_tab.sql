-- 161: Sesión de invitado por código de mesa + origen/aprobación de órdenes
--      Puente de impresión de comandas (D-24) — Tab POS · F3 · D-04/D-05/D-08/D-14.
-- Planning aplica por MCP. No ejecutar directamente.
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

create index if not exists orders_awaiting_idx
  on public.orders (business_id, created_at) where approval_status = 'awaiting';
create index if not exists orders_guest_session_idx
  on public.orders (guest_session_id) where guest_session_id is not null;

comment on column public.orders.source is
  'pos = mesero handheld; app = app JChat; customer_stripe = cliente web pagó por orden; customer_tab = cliente web agregó a la cuenta. D-14.';
comment on column public.orders.approval_status is
  'null = no requiere aprobación; awaiting/approved/rejected (modo external sin código, F4). D-05/D-07.';

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
create index if not exists guest_tab_sessions_table_idx
  on public.guest_tab_sessions (table_id) where revoked_at is null;
alter table public.guest_tab_sessions enable row level security;
revoke all on public.guest_tab_sessions from anon, authenticated;

alter table public.orders
  drop constraint if exists orders_guest_session_fk;
alter table public.orders
  add constraint orders_guest_session_fk
  foreign key (guest_session_id) references public.guest_tab_sessions(id) on delete set null;

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
create index if not exists guest_code_attempts_dev_idx
  on public.guest_code_attempts (device_id, created_at);
create index if not exists guest_code_attempts_tbl_idx
  on public.guest_code_attempts (table_id, created_at);
create index if not exists guest_code_attempts_ip_idx
  on public.guest_code_attempts (ip_hash, created_at);
alter table public.guest_code_attempts enable row level security;
revoke all on public.guest_code_attempts from anon, authenticated;

-- ── 4. Strikes y bloqueos de dispositivo (esquema; strikes se escriben en F4) ─
create table if not exists public.guest_device_strikes (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  device_id   text not null,
  order_id    uuid references public.orders(id) on delete set null,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists guest_device_strikes_idx
  on public.guest_device_strikes (business_id, device_id, created_at);

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
  using (
    public.is_employee_of_business(business_id)
    or exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
    or public.is_platform_admin()
  );

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
-- Devuelve el user_id al que se atribuye un pedido del cliente en esta mesa:
-- 1) quien abrió la sesión (session_opened_by); 2) el mesero más antiguo; 3) null.
create or replace function public.resolve_table_waiter_for_attribution(p_table_id uuid)
returns uuid language sql stable security definer set search_path to '' as $$
  select coalesce(
    (select t.session_opened_by
       from public.tables t
      where t.id = p_table_id and t.session_opened_by is not null),
    (select e.user_id
       from public.table_waiters tw
       join public.employees e on e.id = tw.employee_id
      where tw.table_id = p_table_id
      order by tw.created_at asc
      limit 1)
  );
$$;
revoke all on function public.resolve_table_waiter_for_attribution(uuid) from public, anon, authenticated;

-- ── 7. Validar sesión de invitado (uso interno por la EF con service role) ────
-- Válida solo si: no revocada, no expirada, y la mesa sigue en LA MISMA sesión
-- de ocupación (mismo session_opened_at) con código vigente. Actualiza last_seen_at.
create or replace function public.guest_tab_session_validate(p_token_hash text)
returns table(
  session_id         uuid,
  business_id        uuid,
  table_id           uuid,
  table_label        text,
  device_id          text,
  session_opened_at  timestamptz
)
language plpgsql security definer set search_path to '' as $$
begin
  return query
  with s as (
    select g.*
      from public.guest_tab_sessions g
     where g.token_hash = p_token_hash
       and g.revoked_at is null
       and g.expires_at > now()
  )
  select s.id, s.business_id, s.table_id, t.label, s.device_id, t.session_opened_at
    from s
    join public.tables t on t.id = s.table_id
   where t.is_active = true
     and t.access_code is not null
     and t.session_opened_at = s.table_session_opened_at;

  if found then
    update public.guest_tab_sessions
       set last_seen_at = now()
     where token_hash = p_token_hash;
  end if;
end;
$$;
revoke all on function public.guest_tab_session_validate(text) from public, anon, authenticated;

-- ── 8. Actualizar trigger y pos_close_table_session para revocar sesiones ─────
-- Cuerpos copiados EXACTAMENTE de migration 160, con +1 línea de revocación.

create or replace function public.pos_close_table_session(
  p_business_id uuid,
  p_table_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  if not (
    public.pos_can_access(p_business_id)
    or exists (
      select 1 from public.businesses b
      where b.id = p_business_id and b.owner_id = v_uid
    )
  ) then
    raise exception 'NOT_ALLOWED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));

  if exists (
    select 1 from public.orders o
    where o.table_id = p_table_id
      and o.business_id = p_business_id
      and o.paid_at is null
      and o.canceled_at is null
  ) then
    raise exception 'TABLE_HAS_OPEN_ORDERS';
  end if;

  update public.tables
  set
    access_code       = null,
    session_opened_at = null,
    session_opened_by = null
  where id = p_table_id and business_id = p_business_id;

  -- F3: revocar sesiones de invitado activas de esta mesa
  update public.guest_tab_sessions
  set revoked_at = now()
  where table_id = p_table_id and revoked_at is null;

  return jsonb_build_object('closed', true);
end;
$$;
revoke all on function public.pos_close_table_session(uuid, uuid) from public, anon;
grant execute on function public.pos_close_table_session(uuid, uuid) to authenticated;

comment on function public.pos_close_table_session(uuid, uuid) is
  'Cierre manual de sesión de mesa sin órdenes abiertas. F2 + F3 (revoca guest_tab_sessions).';

create or replace function public.trg_fn_table_session_autoclose()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- Reacciona a: paid_at null→no-null  O  canceled_at null→no-null
  if (
       (new.paid_at    is not null and old.paid_at    is null)
    or (new.canceled_at is not null and old.canceled_at is null)
  ) then
    if new.table_id is not null
       and not exists (
         select 1 from public.orders o
         where o.table_id = new.table_id
           and o.id <> new.id
           and o.paid_at is null
           and o.canceled_at is null
       )
    then
      update public.tables
      set
        access_code       = null,
        session_opened_at = null,
        session_opened_by = null
      where id = new.table_id;

      -- F3: revocar sesiones de invitado activas de esta mesa
      update public.guest_tab_sessions
      set revoked_at = now()
      where table_id = new.table_id and revoked_at is null;
    end if;
  end if;
  return new;
end;
$$;
-- Trigger ya existe desde F2; el OR REPLACE en la función es suficiente.

comment on function public.trg_fn_table_session_autoclose() is
  'Trigger: limpia access_code/session_* en tables y revoca guest_tab_sessions cuando la última orden de la mesa se paga o cancela. F2 + F3.';

-- ── 9. Puente de impresión de comandas (D-24) ─────────────────────────────────
alter table public.orders
  add column if not exists comanda_printed_at timestamptz,
  add column if not exists comanda_claimed_at timestamptz,
  add column if not exists comanda_claimed_by uuid;

create index if not exists orders_comanda_pending_idx
  on public.orders (business_id, created_at)
  where comanda_printed_at is null
    and source in ('customer_stripe','customer_tab');

-- Reclamar la impresión de UNA orden: solo un dispositivo gana.
-- El reclamo caduca a los 2 min (si el ganador se cayó sin marcar impreso,
-- otro puede reintentar). La comparación la hace el servidor — no hay clock skew.
create or replace function public.pos_claim_comanda_print(p_business_id uuid, p_order_id uuid)
returns boolean
language plpgsql security definer set search_path to '' as $$
declare
  v_uid uuid := auth.uid();
  v_won int;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not (
    public.pos_can_access(p_business_id)
    or exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = v_uid)
  ) then
    raise exception 'NOT_ALLOWED';
  end if;

  update public.orders o
     set comanda_claimed_at = now(),
         comanda_claimed_by = v_uid
   where o.id = p_order_id
     and o.business_id = p_business_id
     and o.comanda_printed_at is null
     and o.canceled_at is null
     and coalesce(o.approval_status, 'approved') <> 'awaiting'
     and (
           o.comanda_claimed_at is null
        or o.comanda_claimed_at < now() - interval '2 minutes'
     );

  get diagnostics v_won = row_count;
  return v_won = 1;
end;
$$;
revoke all on function public.pos_claim_comanda_print(uuid, uuid) from public, anon;
grant execute on function public.pos_claim_comanda_print(uuid, uuid) to authenticated;

create or replace function public.pos_mark_comanda_printed(p_business_id uuid, p_order_id uuid)
returns void
language sql security definer set search_path to '' as $$
  update public.orders
     set comanda_printed_at = now()
   where id = p_order_id
     and business_id = p_business_id
     and comanda_claimed_by = auth.uid();
$$;
revoke all on function public.pos_mark_comanda_printed(uuid, uuid) from public, anon;
grant execute on function public.pos_mark_comanda_printed(uuid, uuid) to authenticated;

create or replace function public.pos_release_comanda_print(p_business_id uuid, p_order_id uuid)
returns void
language sql security definer set search_path to '' as $$
  update public.orders
     set comanda_claimed_at = null,
         comanda_claimed_by = null
   where id = p_order_id
     and business_id = p_business_id
     and comanda_claimed_by = auth.uid()
     and comanda_printed_at is null;
$$;
revoke all on function public.pos_release_comanda_print(uuid, uuid) from public, anon;
grant execute on function public.pos_release_comanda_print(uuid, uuid) to authenticated;

-- Órdenes del cliente pendientes de comanda al abrir el POS (catch-up, últimas 12 h).
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
