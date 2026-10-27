-- 165: Método de pago + cierre en modo external — Tab POS · F6 · D-06/D-11/D-36.
--
-- Tres acciones:
--   1. Añadir columna payment_method a pos_payments + backfill histórico.
--   2. Nueva función pos_apply_external_payment (cash/card_external, solo modo external).
--   3. Reescribir pos_receipts_today (RETURNS TABLE cambia → DROP + CREATE).
--
-- Planning aplica por MCP. NO ejecutar directamente.

begin;

-- ── 1. Método de pago explícito ──────────────────────────────────────────────
alter table public.pos_payments add column if not exists payment_method text;
alter table public.pos_payments drop constraint if exists pos_payments_method_chk;
alter table public.pos_payments add constraint pos_payments_method_chk
  check (payment_method is null or payment_method in ('stripe_terminal','stripe_web','cash','card_external'));
comment on column public.pos_payments.payment_method is
  'stripe_terminal = M2 (cargo directo); stripe_web = cliente por QR (destino); cash / card_external = cobrado por fuera en modo external. F6.';

-- Backfill de históricos (idempotente): inferir método por source + stripe_pi_id
update public.pos_payments
   set payment_method = 'stripe_web'
 where payment_method is null
   and source = 'guest';

update public.pos_payments
   set payment_method = 'stripe_terminal'
 where payment_method is null
   and source = 'pos'
   and stripe_pi_id is not null;

-- ── 2. Cobro externo (efectivo / tarjeta externa) — solo modo external ───────
-- p_payment_id: fila 'pending' del plan (split/check) a cobrar; null = "todo el pendiente".
create or replace function public.pos_apply_external_payment(
  p_business_id uuid,
  p_table_id    uuid,
  p_method      text,
  p_tip_cents   integer default 0,
  p_payment_id  uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_mode    text;
  v_open    timestamptz;
  v_bal     jsonb;
  v_due     bigint;
  v_pid     uuid;
  v_amount  integer;
  v_row     record;
  v_closed  boolean;
  v_code    text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.pos_can_access(p_business_id) then raise exception 'NOT_ALLOWED'; end if;
  if p_method not in ('cash', 'card_external') then raise exception 'BAD_METHOD'; end if;

  select b.pos_payment_mode into v_mode
    from public.businesses b
   where b.id = p_business_id;
  if v_mode is distinct from 'external' then raise exception 'MODE_NOT_ALLOWED'; end if;

  -- Mesero asignado a la mesa, o dueño, o mesa sin mesero asignado
  if not (
    public.is_waiter_of_table(p_table_id)
    or public.owns_business_of_table(p_table_id)
    or not exists (select 1 from public.table_waiters tw where tw.table_id = p_table_id)
  ) then
    raise exception 'NOT_ASSIGNED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));

  select t.session_opened_at into v_open
    from public.tables t
   where t.id = p_table_id and t.business_id = p_business_id;

  v_bal := public.pos_table_balance(p_business_id, p_table_id);
  v_due := (v_bal->>'due_cents')::bigint;

  if p_payment_id is not null then
    -- Cobrar una parte ya planificada por el mesero (split even / check por ítems)
    select * into v_row
      from public.pos_payments pp
     where pp.id            = p_payment_id
       and pp.business_id   = p_business_id
       and pp.table_id      = p_table_id
       and pp.source        = 'pos'
       and pp.status        = 'pending'
     for update;
    if v_row.id is null then raise exception 'PAYMENT_NOT_PENDING'; end if;
    v_pid := v_row.id;
    update public.pos_payments
       set payment_method    = p_method,
           paid_by           = v_uid,
           session_opened_at = coalesce(session_opened_at, v_open),
           updated_at        = now()
     where id = v_pid;
  else
    -- Todo el pendiente en un solo cobro (siempre permitido, D-33 no aplica)
    if v_due <= 0 then raise exception 'NOTHING_DUE'; end if;
    v_amount := v_due::integer;
    insert into public.pos_payments
      (business_id, table_id, amount_cents, kind, status, paid_by, session_opened_at, source, payment_method)
    values
      (p_business_id, p_table_id, v_amount, 'full', 'pending', v_uid, v_open, 'pos', p_method)
    returning id into v_pid;
  end if;

  v_closed := public.pos_apply_payment(v_pid, greatest(0, coalesce(p_tip_cents, 0)));

  -- Generar receipt_code si no existe (mismo formato que terminal: 22 chars base64url)
  v_code := translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_');
  update public.pos_payments
     set receipt_code = coalesce(receipt_code, left(v_code, 22))
   where id = v_pid;
  select receipt_code into v_code from public.pos_payments where id = v_pid;

  return jsonb_build_object(
    'payment_id',           v_pid,
    'receipt_code',         v_code,
    'tab_closed',           v_closed,
    'remaining_due_cents',  (public.pos_table_balance(p_business_id, p_table_id)->>'due_cents')::bigint
  );
end $$;

revoke all on function public.pos_apply_external_payment(uuid, uuid, text, integer, uuid)
  from public, anon;
grant execute on function public.pos_apply_external_payment(uuid, uuid, text, integer, uuid)
  to authenticated;

-- ── 3. Recibos: método de pago en el listado ─────────────────────────────────
-- RETURNS TABLE cambia (añade payment_method) → DROP obligatorio antes del CREATE.
drop function if exists public.pos_receipts_today(uuid);

create function public.pos_receipts_today(p_business_id uuid)
returns table(
  id             uuid,
  receipt_code   text,
  table_label    text,
  amount_cents   integer,
  tip_cents      integer,
  status         text,
  paid_by        uuid,
  source         text,
  payment_method text,
  created_at     timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_is_owner    boolean;
  v_is_employee boolean;
begin
  v_is_owner := exists (
    select 1 from public.businesses b
     where b.id = p_business_id and b.owner_id = auth.uid()
  );
  v_is_employee := public.is_employee_of_business(p_business_id);

  if not v_is_owner and not v_is_employee then
    raise exception 'no access';
  end if;

  return query
    select
      pp.id,
      pp.receipt_code,
      t.label                         as table_label,
      pp.amount_cents,
      coalesce(pp.tip_cents, 0)       as tip_cents,
      pp.status,
      pp.paid_by,
      pp.source,
      pp.payment_method,
      pp.created_at
    from   public.pos_payments pp
    left join public.tables t on t.id = pp.table_id
    where  pp.business_id = p_business_id
      and  pp.status = 'succeeded'
      and  pp.created_at >= (
             date_trunc('day', now() at time zone 'America/New_York')
             at time zone 'America/New_York'
           )
      and  (
        v_is_owner
        or pp.paid_by = auth.uid()
        or (pp.source = 'guest' and public.is_waiter_of_table(pp.table_id))
      )
    order by pp.created_at desc;
end $$;

revoke all on function public.pos_receipts_today(uuid) from public, anon;
grant execute on function public.pos_receipts_today(uuid) to authenticated;

commit;
