-- ROLLBACK de 277_reservation_cancel_notify_expire (destructivo: borra el trigger de sello, reservations_expire(), el cron y el estado 'expired'). Juan lo aplica a mano en el SQL Editor.
-- Restaura los cuerpos de la 274 de reservations_notify y set_reservation_status, y la lista del push de la 274 (19 tipos).
-- Antes de cambiar el CHECK, las reservas 'expired' pasan a 'cancelled' (el código viejo no conoce 'expired'); el trigger de sello ya está borrado, así que no estorba.
-- NO borra la columna status_changed_by (guarda historial) ni las notificaciones 'reservation_cancelled_by_customer' ya creadas (quedan sin push).
-- Estado antes de la 277 (leer en producción antes de aplicarla, para comparar): select pg_get_constraintdef(oid) from pg_constraint where conname = 'reservations_status_check';
--   select tgname from pg_trigger where tgrelid = 'public.reservations'::regclass and not tgisinternal order by 1;  select jobname, schedule from cron.job where jobname like 'reservation%';

select cron.unschedule('reservations-expire') where exists (select 1 from cron.job where jobname = 'reservations-expire');

drop trigger if exists reservations_stamp_status_change on public.reservations;
drop function if exists public.reservations_stamp_status_change();
drop function if exists public.reservations_expire();

update public.reservations set status = 'cancelled' where status = 'expired';

alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations add constraint reservations_status_check check (status in ('pending', 'confirmed', 'arrived', 'no_show', 'cancelled', 'rejected'));

create or replace trigger trg_push_on_notification_insert
  after insert on public.notifications
  for each row
  when (new.type = any (array['follower', 'like', 'comment', 'work_alert', 'match_like', 'match_super', 'match_match', 'match_new_people', 'order_status',
                              'gift_offer', 'gift_response', 'business_closed', 'reservation_cancelled', 'staff_added', 'staff_removed',
                              'reservation_confirmed', 'reservation_rejected', 'reservation_requested', 'reservation_reminder']))
  execute function public.push_on_notification_insert();

-- reservations_notify: el cuerpo de la 274
create or replace function public.reservations_notify() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
  v_type text;
begin
  if new.user_id is null then return new; end if;                           -- reserva por teléfono: sin cuenta que avisar
  if new.status is not distinct from old.status then return new; end if;
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

-- set_reservation_status: el cuerpo de la 274
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
