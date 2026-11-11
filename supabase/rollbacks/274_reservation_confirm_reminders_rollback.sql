-- ROLLBACK de 274_reservation_confirm_reminders (destructivo: borra reservations_can_manage, reject_reservation, reservation_reminders, los triggers de aviso, las políticas del personal,
-- los CHECK y el cron). Juan lo aplica a mano en el SQL Editor.
-- Restaura los cuerpos de producción de set_reservation_status, create_reservation, update_reservation, set_table_reserved y la lista del push de 273 (15 tipos).
-- NO borra las columnas status_changed_by, status_reason, reminder_24h_at, reminder_2h_at (guardan historial) ni las notificaciones ya creadas.
-- Las reservas que ya estén en 'confirmed' / 'rejected' se quedan con ese texto (el código viejo no lo conoce): antes de revertir, pasarlas a 'pending' / 'cancelled' si hace falta.

select cron.unschedule('reservation-reminders') where exists (select 1 from cron.job where jobname = 'reservation-reminders');

create or replace trigger trg_push_on_notification_insert
  after insert on public.notifications
  for each row
  when (new.type = any (array['follower', 'like', 'comment', 'work_alert', 'match_like', 'match_super', 'match_match', 'match_new_people', 'order_status',
                              'gift_offer', 'gift_response', 'business_closed', 'reservation_cancelled', 'staff_added', 'staff_removed']))
  execute function public.push_on_notification_insert();

drop trigger if exists trg_reservations_notify on public.reservations;
drop trigger if exists trg_reservations_requested on public.reservations;
drop function if exists public.reservations_notify();
drop function if exists public.reservations_notify_requested();
drop function if exists public.reservation_reminders();

drop policy if exists reservations_staff_manage_select on public.reservations;
drop policy if exists reservations_staff_manage_update on public.reservations;
drop policy if exists "reservation_tables: staff read" on public.reservation_tables;
drop policy if exists "res_customers: staff read" on public.reservation_customers;

alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations drop constraint if exists reservations_status_reason_check;

create or replace function public.set_reservation_status(p_reservation_id uuid, p_status text)
returns void
language plpgsql security definer set search_path to ''
as $function$
declare
  v_biz uuid;
  v_table_id uuid;
begin
  if p_status not in ('arrived','no_show','cancelled','pending') then
    raise exception 'BAD_STATUS';
  end if;

  select business_id into v_biz from public.reservations where id = p_reservation_id;
  if v_biz is null then raise exception 'RESERVATION_NOT_FOUND'; end if;

  if not (
    exists (select 1 from public.businesses b where b.id = v_biz and b.owner_id = auth.uid())
    or public.is_platform_admin()
  ) then
    raise exception 'NOT_ALLOWED';
  end if;

  update public.reservations set status = p_status where id = p_reservation_id;

  -- Al cancelar o no-show, liberar las mesas de esta reserva (vía RPC de F8, escribe log).
  if p_status in ('no_show','cancelled') then
    for v_table_id in
      select table_id from public.reservation_tables where reservation_id = p_reservation_id
    loop
      perform public.set_table_reserved(v_table_id, false, null, null);
    end loop;
  end if;
end $function$;

create or replace function public.set_table_reserved(p_table_id uuid, p_reserved boolean, p_note text default null::text, p_until timestamp with time zone default null::timestamp with time zone)
returns void
language plpgsql security definer set search_path to ''
as $function$
declare
  v_biz   uuid;
  v_label text;
begin
  select business_id, label into v_biz, v_label
  from public.tables where id = p_table_id;
  if v_biz is null then raise exception 'TABLE_NOT_FOUND'; end if;

  if not (public.owns_business_of_table(p_table_id) or public.is_platform_admin()) then
    raise exception 'NOT_ALLOWED';
  end if;

  if p_reserved then
    update public.tables
    set is_reserved = true,
        reserved_note = nullif(trim(coalesce(p_note, '')), ''),
        reserved_until = p_until
    where id = p_table_id;
  else
    update public.tables
    set is_reserved = false,
        reserved_note = null,
        reserved_until = null
    where id = p_table_id;
  end if;

  insert into public.table_reservation_log
    (business_id, table_id, table_label, action, note, reserved_until, changed_by)
  values
    (v_biz, p_table_id, v_label,
     case when p_reserved then 'reserved' else 'released' end,
     nullif(trim(coalesce(p_note, '')), ''),
     case when p_reserved then p_until else null end,
     auth.uid());
end $function$;

create or replace function public.create_reservation(p_business_id uuid, p_reserved_at timestamp with time zone, p_party_size integer, p_table_ids uuid[], p_event_type text default null::text, p_phone text default null::text, p_first_name text default null::text, p_last_name text default null::text, p_special_requests text default null::text)
returns uuid
language plpgsql security definer set search_path to ''
as $function$
declare
  v_customer_id uuid;
  v_reservation_id uuid;
  v_table_id uuid;
  v_note text;
  v_has_tables boolean := (p_table_ids is not null and array_length(p_table_ids, 1) is not null);
begin
  -- Permiso: dueño del negocio o admin.
  if not (
    exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = auth.uid())
    or public.is_platform_admin()
  ) then
    raise exception 'NOT_ALLOWED';
  end if;

  if p_party_size is null or p_party_size < 1 then raise exception 'BAD_PARTY_SIZE'; end if;
  if p_first_name is null or trim(p_first_name) = '' then raise exception 'NO_CUSTOMER_NAME'; end if;
  -- MESA AHORA OPCIONAL: ya NO se exige p_table_ids.

  -- Si vienen mesas, todas deben pertenecer al negocio.
  if v_has_tables and exists (
    select 1 from unnest(p_table_ids) tid
    where not exists (select 1 from public.tables t where t.id = tid and t.business_id = p_business_id)
  ) then
    raise exception 'TABLE_NOT_IN_BUSINESS';
  end if;

  -- Cliente: reusa por teléfono (si viene) o crea nuevo.
  if p_phone is not null and trim(p_phone) <> '' then
    select id into v_customer_id
    from public.reservation_customers
    where business_id = p_business_id and phone = trim(p_phone)
    limit 1;
  end if;

  if v_customer_id is null then
    insert into public.reservation_customers (business_id, phone, first_name, last_name)
    values (p_business_id, nullif(trim(coalesce(p_phone,'')),''), trim(p_first_name), nullif(trim(coalesce(p_last_name,'')),''))
    returning id into v_customer_id;
  end if;

  -- La reserva. user_id null (cliente por teléfono, sin cuenta). status 'pending'.
  insert into public.reservations
    (business_id, user_id, customer_id, reserved_at, party_size, event_type, special_requests, status)
  values
    (p_business_id, null, v_customer_id, p_reserved_at, p_party_size, nullif(trim(coalesce(p_event_type,'')),''), nullif(trim(coalesce(p_special_requests,'')),''), 'pending')
  returning id into v_reservation_id;

  -- Solo si hay mesas: vincular + marcar reservadas (reusa RPC de F8).
  if v_has_tables then
    v_note := trim(p_first_name) || coalesce(' ' || nullif(trim(coalesce(p_last_name,'')),''), '') || ' · ' || p_party_size::text || 'p';
    foreach v_table_id in array p_table_ids loop
      insert into public.reservation_tables (reservation_id, table_id)
      values (v_reservation_id, v_table_id)
      on conflict do nothing;
      perform public.set_table_reserved(v_table_id, true, v_note, p_reserved_at);
    end loop;
  end if;

  return v_reservation_id;
end $function$;

create or replace function public.update_reservation(p_reservation_id uuid, p_reserved_at timestamp with time zone, p_party_size integer, p_table_ids uuid[], p_event_type text default null::text, p_phone text default null::text, p_first_name text default null::text, p_last_name text default null::text, p_special_requests text default null::text)
returns void
language plpgsql security definer set search_path to ''
as $function$
declare
  v_biz uuid;
  v_customer_id uuid;
  v_table_id uuid;
  v_note text;
  v_has_tables boolean := (p_table_ids is not null and array_length(p_table_ids, 1) is not null);
  v_old_table_id uuid;
begin
  select business_id, customer_id into v_biz, v_customer_id
  from public.reservations where id = p_reservation_id;
  if v_biz is null then raise exception 'RESERVATION_NOT_FOUND'; end if;
  if not (
    exists (select 1 from public.businesses b where b.id = v_biz and b.owner_id = auth.uid())
    or public.is_platform_admin()
  ) then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_party_size is null or p_party_size < 1 then raise exception 'BAD_PARTY_SIZE'; end if;
  if p_first_name is null or trim(p_first_name) = '' then raise exception 'NO_CUSTOMER_NAME'; end if;
  if v_has_tables and exists (
    select 1 from unnest(p_table_ids) tid
    where not exists (select 1 from public.tables t where t.id = tid and t.business_id = v_biz)
  ) then
    raise exception 'TABLE_NOT_IN_BUSINESS';
  end if;
  if v_customer_id is not null then
    update public.reservation_customers
    set phone = nullif(trim(coalesce(p_phone,'')),''),
        first_name = trim(p_first_name),
        last_name = nullif(trim(coalesce(p_last_name,'')),'')
    where id = v_customer_id;
  end if;
  update public.reservations
  set reserved_at = p_reserved_at,
      party_size = p_party_size,
      event_type = nullif(trim(coalesce(p_event_type,'')),''),
      special_requests = nullif(trim(coalesce(p_special_requests,'')),'')
  where id = p_reservation_id;
  for v_old_table_id in
    select table_id from public.reservation_tables where reservation_id = p_reservation_id
  loop
    perform public.set_table_reserved(v_old_table_id, false, null, null);
  end loop;
  delete from public.reservation_tables where reservation_id = p_reservation_id;
  if v_has_tables then
    v_note := trim(p_first_name) || coalesce(' ' || nullif(trim(coalesce(p_last_name,'')),''), '') || ' · ' || p_party_size::text || 'p';
    foreach v_table_id in array p_table_ids loop
      insert into public.reservation_tables (reservation_id, table_id)
      values (p_reservation_id, v_table_id)
      on conflict do nothing;
      perform public.set_table_reserved(v_table_id, true, v_note, p_reserved_at);
    end loop;
  end if;
end $function$;

drop function if exists public.reject_reservation(uuid, text);
drop function if exists public.reservations_can_manage(uuid, uuid);
