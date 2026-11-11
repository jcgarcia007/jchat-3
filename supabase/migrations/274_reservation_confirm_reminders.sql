-- JChat 3.0 — M3 (2026-11-10): confirmación del local, personal con permiso de reservas, avisos y recordatorios. NO APLICADA (la aplica Juan Carlos / el asistente por MCP; nunca `supabase db push`).
-- Spec aprobada: docs/handoff/SPEC_M3_proxima_reserva.md (A, B y C) + decisión B de Juan (dueño + personal con `reservations_manage`) · Reversión: supabase/rollbacks/274_reservation_confirm_reminders_rollback.sql · Pruebas: supabase/scripts/test_274_local.sh
-- Idempotente y no destructiva (CREATE OR REPLACE, ADD COLUMN IF NOT EXISTS, políticas y constraint dentro de DO que comprueban su existencia).
--
-- Qué hace:
--   1. reservations_can_manage(p_business_id, p_user default auth.uid()): LA regla de permiso. true = dueño del local, o admin de plataforma, o empleado
--      status='accepted' del local cuyo custom_roles.permissions ->> 'reservations_manage' = 'true' (ni rol base ni pending). Con sesión de usuario solo responde
--      por el propio usuario (no se puede sondear a otro); sin sesión (service_role, cron) responde por p_user.
--   2. Esquema: reservations.status_changed_by (uuid, null, on delete set null), status_reason (clave del motivo de rechazo), reminder_24h_at / reminder_2h_at;
--      CHECK reservations_status_check (pending, confirmed, arrived, no_show, cancelled, rejected; producción hoy: pending, arrived, cancelled).
--   3. RLS: el personal con permiso puede SELECT y UPDATE reservations (no INSERT ni DELETE) y SELECT reservation_tables y reservation_customers.
--   4. set_reservation_status (cuerpo de producción + permiso por la función + confirmed/rejected + status_changed_by; rejected libera mesas como cancelled;
--      confirmed solo desde pending, rejected desde pending o confirmed), reject_reservation (con motivo), create_reservation / update_reservation / set_table_reserved
--      (cuerpo de producción; el permiso pasa por la misma función: el personal puede crear por teléfono y mover mesas, como el dueño).
--   5. Avisos: trg_reservations_notify (confirmed / rejected → reservation_confirmed / reservation_rejected al cliente; nunca si lo cambia el propio cliente),
--      trg_reservations_requested (reserva nueva de un cliente con cuenta → reservation_requested al dueño y al personal con permiso, nunca al propio autor).
--   6. Recordatorios: reservation_reminders() (24 h y 2 h antes, una sola vez por columna, solo pending/confirmed con cuenta y no en lista de espera) + cron
--      'reservation-reminders' cada 10 min.
--   7. Push: trg_push_on_notification_insert = la lista de producción (15 tipos) + reservation_confirmed, reservation_rejected, reservation_requested, reservation_reminder.

-- ───────── 1. La regla de permiso ─────────
create or replace function public.reservations_can_manage(p_business_id uuid, p_user uuid default auth.uid())
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_user is null or p_business_id is null then return false; end if;
  -- con sesión de usuario solo se responde por uno mismo
  if auth.uid() is not null and p_user is distinct from auth.uid() then return false; end if;
  return
    exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = p_user)
    or exists (select 1 from public.admin_roles ar where ar.user_id = p_user)
    or exists (select 1 from public.users u where u.id = p_user and u.role = 'super_admin')
    or exists (
      select 1
        from public.employees e
        join public.custom_roles cr on cr.id = e.custom_role_id and cr.business_id = e.business_id
       where e.business_id = p_business_id
         and e.user_id = p_user
         and e.status = 'accepted'
         and cr.permissions ->> 'reservations_manage' = 'true'
    );
end;
$$;
revoke all on function public.reservations_can_manage(uuid, uuid) from public, anon;
grant execute on function public.reservations_can_manage(uuid, uuid) to authenticated, service_role;
comment on function public.reservations_can_manage(uuid, uuid) is
  'M3: dueño del local, admin de plataforma o empleado aceptado cuyo rol personalizado tiene reservations_manage = true. Con sesión solo responde por el propio usuario.';

-- ───────── 2. Esquema ─────────
alter table public.reservations add column if not exists status_changed_by uuid references public.users(id) on delete set null;
alter table public.reservations add column if not exists status_reason text;
alter table public.reservations add column if not exists reminder_24h_at timestamptz;
alter table public.reservations add column if not exists reminder_2h_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.reservations'::regclass and conname = 'reservations_status_check') then
    alter table public.reservations
      add constraint reservations_status_check check (status in ('pending', 'confirmed', 'arrived', 'no_show', 'cancelled', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.reservations'::regclass and conname = 'reservations_status_reason_check') then
    alter table public.reservations
      add constraint reservations_status_reason_check check (status_reason is null or status_reason in ('no_availability', 'closed_that_day', 'group_too_large'));
  end if;
end $$;

-- authenticated solo tiene UPDATE sobre la columna status (grant por columnas, 245): ni el motivo ni la auditoría ni las marcas de recordatorio se pueden escribir
-- después de crear la fila, por eso reservations_customer_guard NO se toca. (SELECT e INSERT son a nivel de tabla: las columnas nuevas heredan ese grant.)

-- ───────── 3. RLS del personal con permiso ─────────
do $$
begin
  if not exists (select 1 from pg_policy where polrelid = 'public.reservations'::regclass and polname = 'reservations_staff_manage_select') then
    create policy reservations_staff_manage_select on public.reservations for select
      using (public.reservations_can_manage(business_id));
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.reservations'::regclass and polname = 'reservations_staff_manage_update') then
    create policy reservations_staff_manage_update on public.reservations for update
      using (public.reservations_can_manage(business_id))
      with check (public.reservations_can_manage(business_id));
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.reservation_tables'::regclass and polname = 'reservation_tables: staff read') then
    create policy "reservation_tables: staff read" on public.reservation_tables for select
      using (exists (select 1 from public.reservations r where r.id = reservation_tables.reservation_id and public.reservations_can_manage(r.business_id)));
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.reservation_customers'::regclass and polname = 'res_customers: staff read') then
    create policy "res_customers: staff read" on public.reservation_customers for select
      using (public.reservations_can_manage(business_id));
  end if;
end $$;

-- ───────── 4. Funciones: el permiso pasa por reservations_can_manage ─────────
-- set_table_reserved: cuerpo de producción; el permiso añade reservations_can_manage (lo necesitan rejected / cancelled / crear por teléfono del personal)
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

  if not (public.owns_business_of_table(p_table_id) or public.is_platform_admin() or public.reservations_can_manage(v_biz)) then
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

-- set_reservation_status: cuerpo de producción + permiso + confirmed / rejected + status_changed_by
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

-- reject_reservation: rechazar con motivo opcional (clave de un chip). El motivo se guarda ANTES del cambio de estado: el aviso al cliente lo lleva.
create or replace function public.reject_reservation(p_reservation_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path to ''
as $function$
declare
  v_biz uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_reason is not null and v_reason not in ('no_availability', 'closed_that_day', 'group_too_large') then
    raise exception 'BAD_REASON';
  end if;
  select business_id into v_biz from public.reservations where id = p_reservation_id;
  if v_biz is null then raise exception 'RESERVATION_NOT_FOUND'; end if;
  if not public.reservations_can_manage(v_biz) then raise exception 'NOT_ALLOWED'; end if;

  update public.reservations set status_reason = v_reason where id = p_reservation_id;
  perform public.set_reservation_status(p_reservation_id, 'rejected');
end $function$;
revoke all on function public.reject_reservation(uuid, text) from public, anon;
grant execute on function public.reject_reservation(uuid, text) to authenticated, service_role;

-- create_reservation: cuerpo de producción; permiso = reservations_can_manage
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
  -- Permiso: dueño del negocio, personal con reservations_manage o admin.
  if not public.reservations_can_manage(p_business_id) then
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

-- update_reservation: cuerpo de producción; permiso = reservations_can_manage
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
  if not public.reservations_can_manage(v_biz) then
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

-- ───────── 5. Avisos ─────────
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

create or replace trigger trg_reservations_notify
  after update of status on public.reservations
  for each row execute function public.reservations_notify();

create or replace function public.reservations_notify_requested() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name  text;
  v_owner uuid;
  v_to    uuid;
begin
  if new.user_id is null or new.status <> 'pending' then return new; end if;   -- las que crea el local por teléfono no se avisan a sí mismas
  select b.name, b.owner_id into v_name, v_owner from public.businesses b where b.id = new.business_id;
  if not found then return new; end if;

  for v_to in
    select v_owner where v_owner is not null
    union
    select e.user_id
      from public.employees e
      join public.custom_roles cr on cr.id = e.custom_role_id and cr.business_id = e.business_id
     where e.business_id = new.business_id and e.status = 'accepted' and cr.permissions ->> 'reservations_manage' = 'true'
  loop
    continue when v_to is not distinct from new.user_id;                          -- nunca al propio autor (p. ej. el dueño reservando en su local)
    insert into public.notifications (user_id, type, payload)
    values (v_to, 'reservation_requested', jsonb_build_object(
      'business_id', new.business_id, 'business_name', v_name, 'reservation_id', new.id,
      'reserved_at', new.reserved_at, 'timezone', public.business_tz(new.business_id), 'party_size', new.party_size));
  end loop;
  return new;
end;
$$;
revoke all on function public.reservations_notify_requested() from public, anon, authenticated;
grant execute on function public.reservations_notify_requested() to service_role;

create or replace trigger trg_reservations_requested
  after insert on public.reservations
  for each row execute function public.reservations_notify_requested();

-- ───────── 6. Recordatorios ─────────
-- 24 h: reserved_at entre now()+23h30 y now()+24h30 · 2 h: entre now()+1h30 y now()+2h30. Una vez por columna (se marca en la misma sentencia que inserta el aviso).
-- Solo pending / confirmed, con cuenta, fuera de la lista de espera, y no reservadas hace menos de 30 minutos (no se avisa al instante de reservar).
create or replace function public.reservation_reminders() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_n int := 0;
  v_k int;
begin
  with due as (
    update public.reservations r set reminder_24h_at = now()
     where r.id in (
       select x.id from public.reservations x
        where x.status in ('pending', 'confirmed') and x.user_id is not null and not x.is_waitlist
          and x.reminder_24h_at is null
          and x.reserved_at between now() + interval '23 hours 30 minutes' and now() + interval '24 hours 30 minutes'
          and x.created_at < now() - interval '30 minutes'
        for update skip locked)
    returning r.id, r.user_id, r.business_id, r.reserved_at, r.party_size
  )
  insert into public.notifications (user_id, type, payload)
  select d.user_id, 'reservation_reminder', jsonb_build_object(
           'business_id', d.business_id, 'business_name', b.name, 'reservation_id', d.id, 'reserved_at', d.reserved_at,
           'timezone', public.business_tz(d.business_id), 'party_size', d.party_size, 'hours_before', 24)
    from due d join public.businesses b on b.id = d.business_id;
  get diagnostics v_k = row_count;
  v_n := v_n + v_k;

  with due as (
    update public.reservations r set reminder_2h_at = now()
     where r.id in (
       select x.id from public.reservations x
        where x.status in ('pending', 'confirmed') and x.user_id is not null and not x.is_waitlist
          and x.reminder_2h_at is null
          and x.reserved_at between now() + interval '1 hour 30 minutes' and now() + interval '2 hours 30 minutes'
          and x.created_at < now() - interval '30 minutes'
        for update skip locked)
    returning r.id, r.user_id, r.business_id, r.reserved_at, r.party_size
  )
  insert into public.notifications (user_id, type, payload)
  select d.user_id, 'reservation_reminder', jsonb_build_object(
           'business_id', d.business_id, 'business_name', b.name, 'reservation_id', d.id, 'reserved_at', d.reserved_at,
           'timezone', public.business_tz(d.business_id), 'party_size', d.party_size, 'hours_before', 2)
    from due d join public.businesses b on b.id = d.business_id;
  get diagnostics v_k = row_count;
  v_n := v_n + v_k;
  return v_n;
end;
$$;
revoke all on function public.reservation_reminders() from public, anon, authenticated;
grant execute on function public.reservation_reminders() to service_role;

-- cron.schedule con un nombre existente actualiza ese job (pg_cron 1.6): idempotente sin cron.unschedule previo.
select cron.schedule('reservation-reminders', '*/10 * * * *', $$select public.reservation_reminders()$$);

-- ───────── 7. Push ─────────
create or replace trigger trg_push_on_notification_insert
  after insert on public.notifications
  for each row
  when (new.type = any (array['follower', 'like', 'comment', 'work_alert', 'match_like', 'match_super', 'match_match', 'match_new_people', 'order_status',
                              'gift_offer', 'gift_response', 'business_closed', 'reservation_cancelled', 'staff_added', 'staff_removed',
                              'reservation_confirmed', 'reservation_rejected', 'reservation_requested', 'reservation_reminder']))
  execute function public.push_on_notification_insert();
