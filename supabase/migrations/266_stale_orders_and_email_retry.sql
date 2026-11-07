-- JChat 3.0 — D5 (2026-11-06): pedidos abandonados + reintento de correos.
-- Idempotente y no destructiva (CREATE OR REPLACE, IF NOT EXISTS). La aplica Juan Carlos en producción por MCP; NO usar `supabase db push`.
--
-- Qué hace:
--   A. Un pedido que lleva más de 24 h sin cambiar de estado (pending/confirmed/preparing/ready; `disputed` no) se cierra solo:
--        · pagado (paid_at no nulo)  → 'delivered', y sus order_items sin terminar pasan a 'done' (done_at = now());
--        · sin pagar                 → 'cancelled' + canceled_at = now() (el trigger de mesa existente libera la mesa; no hubo cobro, no hay reembolso).
--      orders.auto_settled_at marca estos cierres (reportes/KDS). Sin push al cliente: la función enciende `jchat.silent_order_notify` y
--      notify_order_status() sale temprano (único cambio a una función existente). Una fila en security_logs por pasada si n > 0.
--      orders_auto_settle() returns int (límite 500 por pasada), cron 'orders-auto-settle' cada hora (minuto 17).
--   B. Reintento de public.outbound_emails (la cola de la 265): columnas last_attempt_at / last_error, índice, y outbound_emails_retry() returns int
--      (cron cada 10 min): hasta 50 filas pending/failed con attempts < 6, creadas hace más de 10 min (delete-account ya intentó en línea) y con
--      backoff 10 min × 2^attempts (tope 6 h); cuenta el intento (attempts + 1, last_attempt_at = now()) y hace UN net.http_post a la edge function
--      outbound-emails con {ids:[...]} y x-push-secret (vault 'push_webhook_secret'; sin secreto devuelve 0). Al llegar a 6 intentos sin éxito la
--      fila queda 'failed' (terminal) y se escribe UNA fila security_logs 'outbound_email_gave_up'.
--
-- Rollback (manual, solo si se abandona; en el SQL Editor):
--   -- select cron.unschedule('orders-auto-settle'); select cron.unschedule('outbound-emails-retry');            (destructivo: NNN_destructive.sql aparte)
--   -- drop function if exists public.orders_auto_settle(); drop function if exists public.outbound_emails_retry();
--   -- notify_order_status(): quitar la línea de salida temprana (volver al cuerpo de 245_baseline.sql, líneas 3827-3843).
--   -- las columnas orders.auto_settled_at, outbound_emails.last_attempt_at / last_error y el índice pueden quedarse sin uso.

-- ───────── A. Pedidos abandonados ─────────
alter table public.orders add column if not exists auto_settled_at timestamptz;

-- notify_order_status(): igual que 245_baseline.sql + salida temprana cuando el barrido automático lo silencia.
create or replace function public.notify_order_status() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare v_biz text;
begin
  if current_setting('jchat.silent_order_notify', true) = 'on' then return new; end if;
  if new.user_id is null or new.status is not distinct from old.status then return new; end if;
  if new.status not in ('preparing','ready','delivered','cancelled') then return new; end if;
  select name into v_biz from public.businesses where id = new.business_id;
  insert into public.notifications (user_id, type, payload)
  values (new.user_id, 'order_status', jsonb_build_object(
    'order_id', new.id, 'order_number', new.order_number, 'business_id', new.business_id, 'business_name', v_biz,
    'status', new.status, 'order_type', new.order_type, 'table_label', new.table_label));
  return new;
end;
$$;

create or replace function public.orders_auto_settle() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids      uuid[];
  v_paid     int := 0;
  v_cancel   int := 0;
begin
  -- the sweep is silent: no order_status notification (and so no push) for old orders
  perform set_config('jchat.silent_order_notify', 'on', true);

  select coalesce(array_agg(id), '{}') into v_ids from (
    select o.id from public.orders o
     where o.status in ('pending', 'confirmed', 'preparing', 'ready')
       and coalesce(o.status_updated_at, o.created_at) < now() - interval '24 hours'
     order by coalesce(o.status_updated_at, o.created_at)
     limit 500
  ) s;
  if cardinality(v_ids) = 0 then
    perform set_config('jchat.silent_order_notify', 'off', true);
    return 0;
  end if;

  -- paid → delivered (its pending items are done)
  with d as (
    update public.orders set status = 'delivered', auto_settled_at = now()
     where id = any (v_ids) and paid_at is not null and status in ('pending', 'confirmed', 'preparing', 'ready')
    returning id
  ), i as (
    update public.order_items set item_status = 'done', done_at = coalesce(done_at, now())
     where order_id in (select id from d) and item_status <> 'done'
    returning 1
  )
  select count(*) into v_paid from d;

  -- not paid → cancelled (canceled_at frees the table through trg_table_session_autoclose; nothing was charged)
  with c as (
    update public.orders set status = 'cancelled', canceled_at = now(), auto_settled_at = now()
     where id = any (v_ids) and paid_at is null and status in ('pending', 'confirmed', 'preparing', 'ready')
    returning id
  ), i as (
    update public.order_items set item_status = 'done', done_at = coalesce(done_at, now())
     where order_id in (select id from c) and item_status <> 'done'
    returning 1
  )
  select count(*) into v_cancel from c;

  if v_paid + v_cancel > 0 then
    insert into public.security_logs (actor_id, action, target_type, target_id, detail)
    values (null, 'orders_auto_settled', 'orders', null, 'delivered:' || v_paid || ' cancelled:' || v_cancel);
  end if;
  -- do not leave the switch on for whatever else runs in this transaction (a manual call from the SQL Editor)
  perform set_config('jchat.silent_order_notify', 'off', true);
  return v_paid + v_cancel;
end;
$$;

revoke all on function public.orders_auto_settle() from public, anon, authenticated;
grant execute on function public.orders_auto_settle() to service_role;

-- ───────── B. Reintento de correos ─────────
alter table public.outbound_emails add column if not exists last_attempt_at timestamptz;
alter table public.outbound_emails add column if not exists last_error text;
create index if not exists outbound_emails_status_attempt_idx on public.outbound_emails (status, last_attempt_at);

create or replace function public.outbound_emails_retry() returns integer
language plpgsql security definer set search_path = public, extensions
as $$
declare v_secret text; v_ids uuid[]; v_gave_up record;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_secret is null then return 0; end if;

  -- 6 attempts and still not sent: terminal 'failed', logged once (give the last call 10 min to answer first)
  for v_gave_up in
    with u as (
      update public.outbound_emails
         set status = 'failed'
       where status in ('pending', 'failed') and attempts >= 6
         and coalesce(last_attempt_at, created_at) < now() - interval '10 minutes'
         and not exists (select 1 from public.security_logs l where l.action = 'outbound_email_gave_up' and l.target_id = outbound_emails.id)
      returning id, kind
    )
    select id, kind from u
  loop
    insert into public.security_logs (actor_id, action, target_type, target_id, detail)
    values (null, 'outbound_email_gave_up', 'outbound_emails', v_gave_up.id, v_gave_up.kind);
  end loop;

  with picked as (
    select id from public.outbound_emails
     where status in ('pending', 'failed') and attempts < 6
       and created_at < now() - interval '10 minutes'
       and (last_attempt_at is null
            or last_attempt_at <= now() - least(interval '6 hours', interval '10 minutes' * power(2, attempts)))
     order by created_at
     limit 50
     for update skip locked
  ), bumped as (
    update public.outbound_emails e
       set attempts = e.attempts + 1, last_attempt_at = now()
      from picked where e.id = picked.id
    returning e.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from bumped;

  if cardinality(v_ids) = 0 then return 0; end if;
  perform net.http_post(
    url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/outbound-emails',
    body := jsonb_build_object('ids', to_jsonb(v_ids)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 20000);
  return cardinality(v_ids);
end;
$$;

revoke all on function public.outbound_emails_retry() from public, anon, authenticated;
grant execute on function public.outbound_emails_retry() to service_role;

-- ───────── Crons ─────────
-- cron.schedule con un nombre existente actualiza ese job (pg_cron 1.6): idempotente sin cron.unschedule previo.
select cron.schedule('orders-auto-settle', '17 * * * *', $$select public.orders_auto_settle()$$);
select cron.schedule('outbound-emails-retry', '*/10 * * * *', $$select public.outbound_emails_retry()$$);
