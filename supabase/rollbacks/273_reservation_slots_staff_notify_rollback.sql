-- ROLLBACK de 273_reservation_slots_staff_notify (destructivo: borra reservation_slots, business_tz y el trigger de personal). Juan lo aplica a mano en el SQL Editor.
-- Restaura: reservation_slot_load (245, zona fija New York), owner_close_business (265), la lista del push (265). Las notificaciones staff_added / staff_removed ya creadas se quedan.
drop trigger if exists trg_employees_notify on public.employees;
drop function if exists public.employees_notify();
drop function if exists public.reservation_slots(uuid, date);

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

create or replace trigger trg_push_on_notification_insert
  after insert on public.notifications
  for each row
  when (new.type = any (array['follower', 'like', 'comment', 'work_alert', 'match_like', 'match_super', 'match_match', 'match_new_people',
                               'order_status', 'gift_offer', 'gift_response', 'business_closed', 'reservation_cancelled']))
  execute function public.push_on_notification_insert();

create or replace function public.reservation_slot_load(p_business_id uuid, p_reserved_at timestamptz) returns table(reserved integer, capacity integer)
language sql stable security definer set search_path to 'public'
as $$
  select (count(*) filter (where r.status in ('pending', 'confirmed', 'arrived') and not r.is_waitlist))::int,
         (select b.reservation_capacity from public.businesses b where b.id = p_business_id)
  from public.reservations r
  where r.business_id = p_business_id
    and (r.reserved_at at time zone 'America/New_York')::date = (p_reserved_at at time zone 'America/New_York')::date
$$;

drop function if exists public.business_tz(uuid);
