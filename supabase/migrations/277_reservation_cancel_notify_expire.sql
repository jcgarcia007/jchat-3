-- JChat 3.0 — Lote 2 (2026-11-26): quién cambió el estado de una reserva, aviso al local cuando el cliente cancela, y caducidad de las reservas sin respuesta. NO APLICADA (la aplica Planning / Juan por MCP; nunca `supabase db push`).
-- Reversión: supabase/rollbacks/277_reservation_cancel_notify_expire_rollback.sql · Pruebas: supabase/scripts/test_277_local.sh
-- Idempotente y no destructiva (CREATE OR REPLACE; el CHECK se reemplaza dentro de un DO que comprueba su definición, como la 271; cron.schedule con nombre existente actualiza el job).
-- Parte de los cuerpos de la 274 (reservations_notify, set_reservation_status, trg_push_on_notification_insert) y del baseline 245 (reservations_customer_guard, que NO se toca).
--
-- Qué hace:
--   1. N-02. Trigger BEFORE UPDATE reservations_stamp_status_change: si cambia el estado y hay sesión (auth.uid() no nulo), status_changed_by := auth.uid().
--      Hasta ahora solo lo escribía set_reservation_status: cuando el cliente cancelaba con un UPDATE directo desde la app quedaba el dueño que confirmó.
--      Se ejecuta DESPUÉS de reservations_customer_guard (los triggers del mismo evento van en orden alfabético: 'reservations_c…' < 'reservations_s…') y solo escribe una columna
--      que el guard no mira, así que no rechaza ninguna cancelación. Sin sesión (cron, service_role) no toca la columna.
--      Además: una reserva 'expired' es terminal; cualquier cambio de su estado se rechaza (RESERVATION_EXPIRED), también desde un UPDATE directo del cliente o del dueño.
--   2. N-01. reservations_notify: si el estado pasa de pending o confirmed a cancelled y lo cambia el propio cliente (auth.uid() = user_id), notificación
--      'reservation_cancelled_by_customer' al dueño y al personal aceptado con reservations_manage (nunca al autor). Payload: business_id, business_name, reservation_id,
--      reserved_at, timezone, party_size y customer_name (display_name, o el usuario si no tiene). Lo demás (confirmed / rejected al cliente) queda igual.
--      trg_push_on_notification_insert = la lista de la 274 (19 tipos) + reservation_cancelled_by_customer.
--   3. H-030 / H-059. Estado 'expired' en reservations_status_check. reservations_expire() (solo service_role): toda reserva 'pending' con reserved_at < now() − 2 h pasa a
--      'expired' con status_changed_by = null y libera sus mesas (salvo que otra reserva viva — pending / confirmed / arrived — la tenga); no avisa a nadie. Cron
--      'reservations-expire' cada 10 min. 'expired' no cuenta en reservation_slot_load (solo pending / confirmed / arrived), no recibe recordatorios (solo pending / confirmed),
--      y set_reservation_status la rechaza como origen (BAD_TRANSITION). Ninguna otra función con lista de estados del esquema se rompe: owner_close_business solo toca reservas con
--      reserved_at > now() (las caducadas son pasadas).

-- ───────── 1. N-02: quién cambió el estado ─────────
create or replace function public.reservations_stamp_status_change() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if old.status = 'expired' then
      raise exception 'RESERVATION_EXPIRED';   -- una reserva sin respuesta caducada no se confirma, rechaza ni cancela
    end if;
    if auth.uid() is not null then
      new.status_changed_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.reservations_stamp_status_change() from public, anon, authenticated;
grant execute on function public.reservations_stamp_status_change() to service_role;

create or replace trigger reservations_stamp_status_change
  before update on public.reservations
  for each row execute function public.reservations_stamp_status_change();

-- ───────── 3a. Estado 'expired' ─────────
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.reservations'::regclass
     and conname = 'reservations_status_check';

  if v_def is not null and v_def not like '%expired%' then
    alter table public.reservations drop constraint reservations_status_check;
    alter table public.reservations add constraint reservations_status_check
      check (status in ('pending', 'confirmed', 'arrived', 'no_show', 'cancelled', 'rejected', 'expired'));
  elsif v_def is null then
    alter table public.reservations add constraint reservations_status_check
      check (status in ('pending', 'confirmed', 'arrived', 'no_show', 'cancelled', 'rejected', 'expired'));
  end if;
end $$;

-- set_reservation_status: el cuerpo de la 274 + una caducada no se toca (BAD_TRANSITION)
create or replace function public.set_reservation_status(p_reservation_id uuid, p_status text)
returns void
language plpgsql security definer set search_path to ''
as $function$
declare
  v_biz uuid;
  v_old text;
  v_table_id uuid;
begin
  if p_status not in ('arrived','no_show','cancelled','pending','confirmed','rejected') then
    raise exception 'BAD_STATUS';
  end if;

  select business_id, status into v_biz, v_old from public.reservations where id = p_reservation_id;
  if v_biz is null then raise exception 'RESERVATION_NOT_FOUND'; end if;

  if not public.reservations_can_manage(v_biz) then
    raise exception 'NOT_ALLOWED';
  end if;

  -- una reserva caducada (sin respuesta del local) es terminal
  if v_old = 'expired' then raise exception 'BAD_TRANSITION'; end if;

  -- confirmar o rechazar solo tiene sentido sobre una solicitud viva: una cancelada / llegada no se "confirma" (el cliente recibiría un aviso falso)
  if p_status = 'confirmed' and v_old not in ('pending', 'confirmed') then raise exception 'BAD_TRANSITION'; end if;
  if p_status = 'rejected' and v_old not in ('pending', 'confirmed', 'rejected') then raise exception 'BAD_TRANSITION'; end if;

  update public.reservations
     set status = p_status,
         status_changed_by = case when p_status is distinct from v_old then auth.uid() else status_changed_by end,
         status_reason = case when p_status = 'rejected' then status_reason else null end
   where id = p_reservation_id;

  -- Al cancelar, no-show o rechazar, liberar las mesas de esta reserva (vía RPC de F8, escribe log).
  if p_status in ('no_show','cancelled','rejected') then
    for v_table_id in
      select table_id from public.reservation_tables where reservation_id = p_reservation_id
    loop
      perform public.set_table_reserved(v_table_id, false, null, null);
    end loop;
  end if;
end $function$;

-- ───────── 3b. Caducidad ─────────
create or replace function public.reservations_expire() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  t record;
  v_n int := 0;
begin
  for r in
    select x.id from public.reservations x
     where x.status = 'pending' and x.reserved_at < now() - interval '2 hours'
     for update skip locked
  loop
    update public.reservations set status = 'expired', status_changed_by = null where id = r.id;

    -- liberar las mesas como cancelled, pero sin pisar una mesa que otra reserva viva tenga (nadie revisa esto a mano; set_table_reserved exige sesión de usuario, el cron no la tiene)
    for t in
      select rt.table_id, tb.business_id, tb.label
        from public.reservation_tables rt join public.tables tb on tb.id = rt.table_id
       where rt.reservation_id = r.id
    loop
      if not exists (
        select 1 from public.reservation_tables rt2 join public.reservations x2 on x2.id = rt2.reservation_id
         where rt2.table_id = t.table_id and rt2.reservation_id <> r.id and x2.status in ('pending', 'confirmed', 'arrived')
      ) then
        update public.tables set is_reserved = false, reserved_note = null, reserved_until = null
         where id = t.table_id and is_reserved;
        if found then
          insert into public.table_reservation_log (business_id, table_id, table_label, action, note, reserved_until, changed_by)
          values (t.business_id, t.table_id, t.label, 'released', null, null, null);
        end if;
      end if;
    end loop;

    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.reservations_expire() from public, anon, authenticated;
grant execute on function public.reservations_expire() to service_role;

-- cron.schedule con un nombre existente actualiza ese job (pg_cron 1.6): idempotente sin cron.unschedule previo.
select cron.schedule('reservations-expire', '*/10 * * * *', $$select public.reservations_expire()$$);

-- ───────── 2. N-01: aviso al local cuando el cliente cancela ─────────
-- reservations_notify: el cuerpo de la 274 + la rama de cancelación del propio cliente (antes de las demás: lo del cliente no entra en confirmed / rejected)
create or replace function public.reservations_notify() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
  v_type text;
  v_owner uuid;
  v_who  text;
  v_to   uuid;
begin
  if new.user_id is null then return new; end if;                           -- reserva por teléfono: sin cuenta que avisar
  if new.status is not distinct from old.status then return new; end if;

  -- el cliente cancela su propia reserva viva: se avisa al local (dueño + personal con reservations_manage), nunca al propio autor
  if new.status = 'cancelled' and old.status in ('pending', 'confirmed') and auth.uid() is not distinct from new.user_id then
    select b.name, b.owner_id into v_name, v_owner from public.businesses b where b.id = new.business_id;
    if not found then return new; end if;
    select coalesce(nullif(btrim(u.display_name), ''), u.username) into v_who from public.users u where u.id = new.user_id;
    for v_to in
      select v_owner where v_owner is not null
      union
      select e.user_id
        from public.employees e
        join public.custom_roles cr on cr.id = e.custom_role_id and cr.business_id = e.business_id
       where e.business_id = new.business_id and e.status = 'accepted' and e.user_id is not null
         and cr.permissions ->> 'reservations_manage' = 'true'
    loop
      continue when v_to is not distinct from new.user_id;
      insert into public.notifications (user_id, type, payload)
      values (v_to, 'reservation_cancelled_by_customer', jsonb_strip_nulls(jsonb_build_object(
        'business_id', new.business_id, 'business_name', v_name, 'reservation_id', new.id,
        'reserved_at', new.reserved_at, 'timezone', public.business_tz(new.business_id), 'party_size', new.party_size,
        'customer_name', v_who)));
    end loop;
    return new;
  end if;

  if new.status = 'confirmed' then v_type := 'reservation_confirmed';
  elsif new.status = 'rejected' then v_type := 'reservation_rejected';
  else return new;
  end if;
  if auth.uid() is not distinct from new.user_id then return new; end if;  -- nunca si lo cambia el propio cliente

  select b.name into v_name from public.businesses b where b.id = new.business_id;
  insert into public.notifications (user_id, type, payload)
  values (new.user_id, v_type, jsonb_strip_nulls(jsonb_build_object(
    'business_id', new.business_id, 'business_name', v_name, 'reservation_id', new.id,
    'reserved_at', new.reserved_at, 'timezone', public.business_tz(new.business_id), 'party_size', new.party_size,
    'reason', case when v_type = 'reservation_rejected' then new.status_reason end)));
  return new;
end;
$$;
revoke all on function public.reservations_notify() from public, anon, authenticated;
grant execute on function public.reservations_notify() to service_role;

-- ───────── Push: la lista de la 274 + el tipo nuevo (send-push lo renderiza: supabase/functions/_shared/reservationPush.ts) ─────────
create or replace trigger trg_push_on_notification_insert
  after insert on public.notifications
  for each row
  when (new.type = any (array['follower', 'like', 'comment', 'work_alert', 'match_like', 'match_super', 'match_match', 'match_new_people', 'order_status',
                              'gift_offer', 'gift_response', 'business_closed', 'reservation_cancelled', 'staff_added', 'staff_removed',
                              'reservation_confirmed', 'reservation_rejected', 'reservation_requested', 'reservation_reminder',
                              'reservation_cancelled_by_customer']))
  execute function public.push_on_notification_insert();
