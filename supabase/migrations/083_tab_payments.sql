-- 083: cobrar un TAP — modelo de datos (Cobro parte A).
--
-- Un tap agrupa N pedidos; orders.stripe_pi_id es 1:1 (un pedido : un cobro), así
-- que el cobro de un tap NO cabe en orders — necesita tabla propia. tab_payments
-- registra cada intento de cobro de un tap (tarjeta o efectivo). El dinero real lo
-- mueve Stripe (tarjeta) o se registra a mano (efectivo, simple en esta tanda).
--
-- SEGURIDAD: solo service_role escribe (vía Edge Function). authenticated puede
-- LEER (RLS: dueño/admin/mesero que ve la mesa). anon: cero grants sobre la tabla;
-- su única puerta es resolve_tab_payment (SECURITY DEFINER), la página pública /pay.

begin;

-- ── Tabla ────────────────────────────────────────────────────────────────────
create table if not exists public.tab_payments (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  tab_id       uuid not null references public.table_tabs(id) on delete restrict,
  amount_cents int  not null check (amount_cents > 0),
  tip_cents    int  not null default 0 check (tip_cents >= 0),
  method       text not null check (method in ('card', 'cash')),
  status       text not null default 'pending'
               check (status in ('pending', 'succeeded', 'failed', 'cancelled')),
  stripe_pi_id text,                 -- solo tarjeta
  pay_token    text not null,        -- token opaco para /pay/{token}
  taken_by     uuid references auth.users(id) on delete set null,  -- mesero que lo inició
  paid_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Reenvío de Stripe: el mismo PI no puede crear dos cobros.
create unique index if not exists uq_tab_payments_stripe_pi
  on public.tab_payments (stripe_pi_id) where stripe_pi_id is not null;
create unique index if not exists uq_tab_payments_pay_token
  on public.tab_payments (pay_token);
create index if not exists idx_tab_payments_tab_status  on public.tab_payments (tab_id, status);
create index if not exists idx_tab_payments_biz_created on public.tab_payments (business_id, created_at);
create index if not exists idx_tab_payments_pay_token   on public.tab_payments (pay_token);

-- ── pay_token generator (mirrors generate_table_qr_token, 073, 'pay' type) ────
-- Más entropía que los tokens de mesa: es la URL donde se paga.
create or replace function public.generate_tab_pay_token(_business_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  _raw_slug text;
  _slug     text;
  _token    text;
begin
  select lower(regexp_replace(b.name, '[^a-zA-Z0-9]+', '-', 'g'))
  into _raw_slug from public.businesses b where b.id = _business_id;
  _slug := coalesce(nullif(trim(both '-' from left(coalesce(_raw_slug, ''), 16)), ''), 'tab');
  loop
    _token := _slug || '-pay-' || left(replace(gen_random_uuid()::text, '-', ''), 20);
    exit when not exists (select 1 from public.tab_payments where pay_token = _token);
  end loop;
  return _token;
end $$;
revoke execute on function public.generate_tab_pay_token(uuid) from public, anon;

-- ── Trigger: business_id (desde el tap) + pay_token, before insert ───────────
-- El cliente nunca escribe business_id ni pay_token (la EF sí manda tab_id).
create or replace function public.trg_fn_tab_payment_defaults()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select tt.business_id into new.business_id
  from public.table_tabs tt where tt.id = new.tab_id;
  if new.business_id is null then
    raise exception 'tab_id % not found', new.tab_id;
  end if;
  if new.pay_token is null then
    new.pay_token := public.generate_tab_pay_token(new.business_id);
  end if;
  return new;
end $$;
revoke execute on function public.trg_fn_tab_payment_defaults() from public, anon;

drop trigger if exists trg_tab_payment_defaults on public.tab_payments;
create trigger trg_tab_payment_defaults
  before insert on public.tab_payments
  for each row execute function public.trg_fn_tab_payment_defaults();

drop trigger if exists trg_tab_payments_updated_at on public.tab_payments;
create trigger trg_tab_payments_updated_at
  before update on public.tab_payments
  for each row execute function public.set_updated_at();

-- ── Grants (D-54: nada de escritura para authenticated) ──────────────────────
revoke all on table public.tab_payments from anon, authenticated;
grant select on table public.tab_payments to authenticated;   -- lectura vía RLS
-- Sin INSERT/UPDATE/DELETE: solo service_role escribe (bypassa RLS).

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.tab_payments enable row level security;

-- SELECT: dueño del negocio, admin, o el mesero que puede ver la mesa del tap.
-- El table_id vive en el tap, así que se resuelve a través de table_tabs.
create policy "tab_payments: owner/admin/waiter read"
  on public.tab_payments for select to authenticated
  using (
    exists (
      select 1 from public.table_tabs tt
      where tt.id = tab_payments.tab_id
        and (
          public.owns_business_of_table(tt.table_id)
          or public.can_employee_see_table(tt.table_id)
          or public.is_platform_admin()
        )
    )
  );
-- Sin políticas de INSERT/UPDATE/DELETE: authenticated no puede escribir jamás.

-- ── RPC: importe a cobrar de un tap (server-side — mina 2) ───────────────────
create or replace function public.tab_amount_due(p_tab_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_biz uuid;
  v_amount int;
  v_count int;
  v_paid int;
begin
  select tt.business_id into v_biz from public.table_tabs tt where tt.id = p_tab_id;
  if v_biz is null then raise exception 'TAB_NOT_FOUND'; end if;

  if not (
    public.is_employee_of_business(v_biz)
    or exists (select 1 from public.businesses b where b.id = v_biz and b.owner_id = v_uid)
    or public.is_platform_admin()
  ) then
    raise exception 'NOT_ALLOWED';
  end if;

  -- Lo que aún se debe: pedidos del tap sin pagar (al sellar paid_at, salen solos).
  select coalesce(sum(o.total_cents), 0), count(*)
    into v_amount, v_count
  from public.orders o
  where o.tab_id = p_tab_id
    and o.paid_at is null
    and o.status not in ('cancelled', 'refunded');

  select coalesce(sum(tp.amount_cents), 0) into v_paid
  from public.tab_payments tp
  where tp.tab_id = p_tab_id and tp.status = 'succeeded';

  return jsonb_build_object(
    'amount_cents', v_amount,
    'orders_count', v_count,
    'already_paid_cents', v_paid
  );
end $$;
revoke execute on function public.tab_amount_due(uuid) from public, anon;
grant execute on function public.tab_amount_due(uuid) to authenticated;

-- ── RPC pública: resuelve el cobro para la página /pay (patrón resolve_table_qr) ─
-- Devuelve SOLO lo mínimo para pintar la página, y solo si está 'pending'.
create or replace function public.resolve_tab_payment(p_token text)
returns table (
  business_name text,
  table_label   text,
  tab_name      text,
  amount_cents  int,
  tip_cents     int,
  status        text
)
language sql stable security definer set search_path = '' as $$
  select b.name, t.label, tt.name, tp.amount_cents, tp.tip_cents, tp.status
  from public.tab_payments tp
  join public.table_tabs tt on tt.id = tp.tab_id
  join public.tables t on t.id = tt.table_id
  join public.businesses b on b.id = tp.business_id
  where tp.pay_token = p_token and tp.status = 'pending';
$$;
revoke execute on function public.resolve_tab_payment(text) from public;
grant execute on function public.resolve_tab_payment(text) to anon, authenticated;

commit;
