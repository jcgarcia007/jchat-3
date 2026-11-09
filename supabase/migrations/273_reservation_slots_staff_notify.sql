-- JChat 3.0 — M1 + M2 (2026-11-08): franjas de reserva por servidor y aviso al personal. NO APLICADA (la aplica Juan Carlos / el asistente por MCP; nunca `supabase db push`).
-- Spec aprobada: docs/handoff/SPEC_M1_M2_reservas_y_personal.md · Reversión: supabase/rollbacks/273_reservation_slots_staff_notify_rollback.sql · Pruebas: supabase/scripts/test_273_local.sh
-- Idempotente y no destructiva (CREATE OR REPLACE).
--
-- Qué hace:
--   M1. business_tz(p_business_id) (la zona del local, con 'America/New_York' si falta o no es válida) · reservation_slots(p_business_id, p_date) → (slot_at, status)
--       open | full: franjas cada 30 min desde `open` hasta `close` − 30 min en la zona del local (horario nocturno: close <= open cruza la medianoche; mismo valor = sin
--       horario), sin horas pasadas ni de los próximos 30 min, hasta hoy + 60 días; día cerrado o sin horario → sin filas; `full` cuando el día ya alcanzó
--       reservation_capacity (la regla de hoy, por DÍA). Local cerrado/inexistente → sin filas. Solo lectura, ejecutable por authenticated.
--       reservation_slot_load: misma firma y salida, pero cuenta el día con la zona del local (antes fija en New York).
--   M2. Trigger trg_employees_notify en employees → notifications:
--         staff_added   INSERT con status accepted/pending, o UPDATE a accepted (no si ya venía de pending: ese aviso salió al invitarlo)
--         staff_removed UPDATE a 'removed' desde accepted/active
--       payload {business_id, business_name, role_label} (role_label = nombre del rol personalizado, si no `role`) + room_id (la sala principal activa del
--       local, solo si existe: es lo que abre el toque en la app). Nunca para el dueño del local.
--       El cierre del local (D4) no manda staff_removed: owner_close_business enciende jchat.silent_staff_notify mientras quita al personal y sigue mandando
--       solo business_closed (único cambio a esa función: el cuerpo de producción + 2 líneas).
--       trg_push_on_notification_insert: la lista actual + staff_added, staff_removed (send-push los renderiza).

-- ───────── M1. Zona del local ─────────
create or replace function public.business_tz(p_business_id uuid) returns text
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(
    (select n.name from public.businesses b join pg_catalog.pg_timezone_names n on n.name = btrim(b.timezone) where b.id = p_business_id),
    'America/New_York');
$$;

revoke all on function public.business_tz(uuid) from public, anon, authenticated;
grant execute on function public.business_tz(uuid) to service_role;

-- reservation_slot_load: igual que 245 + la zona del local en lugar de 'America/New_York'
create or replace function public.reservation_slot_load(p_business_id uuid, p_reserved_at timestamptz) returns table(reserved integer, capacity integer)
language sql stable security definer set search_path to 'public'
as $$
  select (count(*) filter (where r.status in ('pending', 'confirmed', 'arrived') and not r.is_waitlist))::int,
         (select b.reservation_capacity from public.businesses b where b.id = p_business_id)
  from public.reservations r
  where r.business_id = p_business_id
    and (r.reserved_at at time zone public.business_tz(p_business_id))::date = (p_reserved_at at time zone public.business_tz(p_business_id))::date
$$;

-- ───────── M1. Franjas ─────────
create or replace function public.reservation_slots(p_business_id uuid, p_date date) returns table(slot_at timestamptz, status text)
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  -- extract(dow): 0 = domingo … 6 = sábado  →  índice + 1
  c_keys   constant text[] := array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  c_step   constant interval := interval '30 minutes';
  v_hours  jsonb;
  v_cap    integer;
  v_status text;
  v_tz     text;
  v_day    jsonb;
  v_open   time;
  v_close  time;
  v_start  timestamptz;
  v_last   timestamptz;
  v_t      timestamptz;
  v_min    timestamptz := now() + c_step;
  v_taken  integer;
  v_full   boolean;
begin
  if p_date is null then return; end if;
  select b.hours, b.reservation_capacity, b.status into v_hours, v_cap, v_status from public.businesses b where b.id = p_business_id;
  if not found or v_status = 'closed' then return; end if;
  v_tz := public.business_tz(p_business_id);

  -- hoy (en la zona del local) + 60 días como máximo
  if p_date > (now() at time zone v_tz)::date + 60 then return; end if;

  v_day := v_hours -> c_keys[extract(dow from p_date)::int + 1];
  if v_day is null
     or coalesce((v_day ->> 'closed') = 'true', false)
     or coalesce(v_day ->> 'open', '') !~ '^\d{1,2}:\d{2}' or coalesce(v_day ->> 'close', '') !~ '^\d{1,2}:\d{2}' then
    return;   -- cerrado o sin horario: sin filas
  end if;
  v_open := (v_day ->> 'open')::time;
  v_close := (v_day ->> 'close')::time;
  if v_close = v_open then return; end if;

  v_start := (p_date + v_open) at time zone v_tz;
  -- horario nocturno (close < open): el cierre es al día siguiente
  v_last := (case when v_close < v_open then p_date + 1 + v_close else p_date + v_close end) at time zone v_tz;
  v_last := v_last - c_step;

  -- ¿el día ya alcanzó la capacidad? (misma regla que reservation_slot_load: el día del mediodía de p_date en la zona del local)
  select r.reserved into v_taken from public.reservation_slot_load(p_business_id, (p_date + time '12:00') at time zone v_tz) r;
  v_full := v_cap is not null and v_cap > 0 and coalesce(v_taken, 0) >= v_cap;

  v_t := v_start;
  while v_t <= v_last loop
    if v_t >= v_min then
      slot_at := v_t;
      status := case when v_full then 'full' else 'open' end;
      return next;
    end if;
    v_t := v_t + c_step;
  end loop;
end;
$$;

revoke all on function public.reservation_slots(uuid, date) from public, anon;
grant execute on function public.reservation_slots(uuid, date) to authenticated, service_role;

comment on function public.reservation_slots(uuid, date) is
  'M1: franjas reservables de un local en un día (zona y horario del local, paso 30 min, sin pasadas ni < 30 min, hasta hoy + 60 días). status open | full (capacidad diaria); día cerrado = sin filas.';

-- ───────── M2. Aviso al personal ─────────
create or replace function public.employees_notify() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name   text;
  v_owner  uuid;
  v_label  text;
  v_type   text;
  v_room   uuid;
begin
  if coalesce(current_setting('jchat.silent_staff_notify', true), '') = 'on' then return new; end if;

  if tg_op = 'INSERT' and new.status in ('accepted', 'pending') then
    v_type := 'staff_added';
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status is distinct from 'accepted' and old.status is distinct from 'pending' then
    v_type := 'staff_added';   -- desde 'pending' el aviso ya salió al invitarlo
  elsif tg_op = 'UPDATE' and new.status = 'removed' and old.status in ('accepted', 'active') then
    v_type := 'staff_removed';
  else
    return new;
  end if;

  select b.name, b.owner_id into v_name, v_owner from public.businesses b where b.id = new.business_id;
  if not found then return new; end if;
  if new.user_id is not distinct from v_owner then return new; end if;   -- nunca para el propio dueño

  v_label := coalesce((select cr.name from public.custom_roles cr where cr.id = new.custom_role_id), new.role);
  select ro.id into v_room from public.rooms ro where ro.business_id = new.business_id and ro.is_main and ro.is_active order by ro.created_at limit 1;
  insert into public.notifications (user_id, type, payload)
  values (new.user_id, v_type, jsonb_strip_nulls(jsonb_build_object('business_id', new.business_id, 'business_name', v_name, 'role_label', v_label, 'room_id', v_room)));
  return new;
end;
$$;

revoke all on function public.employees_notify() from public, anon, authenticated;
grant execute on function public.employees_notify() to service_role;

create or replace trigger trg_employees_notify
  after insert or update of status on public.employees
  for each row execute function public.employees_notify();

-- owner_close_business: el cuerpo de 265 (= producción) + silenciar staff_removed mientras quita al personal
create or replace function public.owner_close_business(p_business_id uuid, p_owner uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  b           public.businesses%rowtype;
  v_emp       int := 0;
  v_res       int := 0;
  v_email_ids uuid[] := '{}';
  r           record;
  v_email_id  uuid;
begin
  select * into b from public.businesses where id = p_business_id for update;
  if not found then
    raise exception 'business_not_found' using errcode = 'P0002';
  end if;
  if b.status = 'closed' and b.owner_id is null then
    return jsonb_build_object('already', true, 'business_id', p_business_id, 'email_ids', '[]'::jsonb);
  end if;
  if b.owner_id is distinct from p_owner then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if exists (select 1 from public.orders o where o.business_id = p_business_id and o.status in ('pending', 'confirmed', 'preparing', 'ready'))
     or exists (select 1 from public.table_tabs t where t.business_id = p_business_id and t.status = 'open') then
    raise exception 'owner_open_orders' using errcode = 'P0001';
  end if;

  -- El local: cerrado, inactivo, sin dueño, sin cobros. (El trigger fuerza is_active=false y prohíbe reabrir.)
  update public.businesses
     set status = 'closed', is_active = false, owner_id = null,
         menu_enabled = false, tips_enabled = false, pickup_enabled = false,
         stripe_charges_enabled = false, stripe_payouts_enabled = false, stripe_details_submitted = false,
         updated_at = now()
   where id = p_business_id;

  -- Menú, mesas, salas y ofertas desactivados (no borrados).
  update public.rooms set is_active = false where business_id = p_business_id and is_active;
  update public.tables set is_active = false where business_id = p_business_id and is_active;
  update public.menu_items set is_available = false where business_id = p_business_id and is_available;
  update public.offers set is_active = false where business_id = p_business_id and is_active;

  -- Reseñas, publicaciones, comentarios y chat: OCULTOS y conservados.
  update public.reviews set status = 'hidden' where business_id = p_business_id and status = 'visible';
  update public.posts set hidden_at = now() where business_id = p_business_id and hidden_at is null;
  update public.comments set hidden_at = now()
   where hidden_at is null and post_id in (select p.id from public.posts p where p.business_id = p_business_id);
  update public.messages set hidden_at = now()
   where hidden_at is null and room_id in (select ro.id from public.rooms ro where ro.business_id = p_business_id);

  -- Presencias y opt-ins de juegos del local (Match, Verdad o Reto): fuera.
  delete from public.match_presence where business_id = p_business_id;
  delete from public.game_optins where business_id = p_business_id;

  -- Empleados: pierden el acceso (sus cuentas no se tocan) y reciben el aviso.
  -- M2: el trigger de personal no manda staff_removed aquí (solo business_closed).
  perform set_config('jchat.silent_staff_notify', 'on', true);
  for r in
    select e.id, e.user_id, e.status from public.employees e
     where e.business_id = p_business_id and e.status <> 'removed' and e.user_id is distinct from p_owner
  loop
    update public.employees set status = 'removed' where id = r.id;
    if r.status in ('accepted', 'active') then
      insert into public.notifications (user_id, type, payload)
      values (r.user_id, 'business_closed', jsonb_build_object('business_id', p_business_id, 'business_name', b.name));
      v_emp := v_emp + 1;
    end if;
  end loop;
  perform set_config('jchat.silent_staff_notify', 'off', true);

  -- Reservas futuras: canceladas; el cliente (si tiene cuenta) recibe notificación y se encola su correo. Sin datos del dueño.
  for r in
    select rs.id, rs.user_id, rs.reserved_at from public.reservations rs
     where rs.business_id = p_business_id and rs.reserved_at > now()
       and rs.status not in ('cancelled', 'no_show', 'arrived', 'completed')
  loop
    update public.reservations set status = 'cancelled' where id = r.id;
    v_res := v_res + 1;
    if r.user_id is not null then
      insert into public.notifications (user_id, type, payload)
      values (r.user_id, 'reservation_cancelled',
              jsonb_build_object('business_id', p_business_id, 'business_name', b.name, 'reservation_id', r.id, 'reserved_at', r.reserved_at, 'timezone', b.timezone));
      insert into public.outbound_emails (kind, user_id, payload)
      values ('reservation_cancelled_business_closed', r.user_id,
              jsonb_build_object('business_name', b.name, 'reserved_at', r.reserved_at, 'reservation_id', r.id, 'timezone', b.timezone))
      returning id into v_email_id;
      v_email_ids := v_email_ids || v_email_id;
    end if;
  end loop;

  insert into public.security_logs (actor_id, action, target_type, target_id, detail)
  values (null, 'owner_closed_business', 'business', p_business_id,
          format('Owner account deletion: venue closed (employees notified: %s, reservations cancelled: %s)', v_emp, v_res));

  return jsonb_build_object('already', false, 'business_id', p_business_id, 'business_name', b.name,
                            'employees_notified', v_emp, 'reservations_cancelled', v_res, 'email_ids', to_jsonb(v_email_ids));
end;
$$;

revoke all on function public.owner_close_business(uuid, uuid) from public, anon, authenticated;
grant execute on function public.owner_close_business(uuid, uuid) to service_role;

-- Push: la lista de 265 + staff_added, staff_removed (CREATE OR REPLACE: idempotente)
create or replace trigger trg_push_on_notification_insert
  after insert on public.notifications
  for each row
  when (new.type = any (array['follower', 'like', 'comment', 'work_alert', 'match_like', 'match_super', 'match_match', 'match_new_people',
                               'order_status', 'gift_offer', 'gift_response', 'business_closed', 'reservation_cancelled',
                               'staff_added', 'staff_removed']))
  execute function public.push_on_notification_insert();
