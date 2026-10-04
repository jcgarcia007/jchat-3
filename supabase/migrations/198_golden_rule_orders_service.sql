-- 198: REGLA DE ORO (2/3) — pedidos y llamar al mesero.
-- Fuera del área: solo recoger (counter) y solo si businesses.pickup_enabled. Mesa/regalo/mesero: solo dentro.
-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-04, incluye el ajuste 198b). Este archivo solo la versiona.

create or replace function public.is_venue_staff(p_business_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = p_user_id)
      or exists (select 1 from public.employees e where e.business_id = p_business_id and e.user_id = p_user_id and coalesce(e.status,'active') = 'active');
$$;
revoke all on function public.is_venue_staff(uuid, uuid) from public, anon;
grant execute on function public.is_venue_staff(uuid, uuid) to authenticated, service_role;

create or replace function public.venue_order_access(p_business_id uuid, p_lat float8 default null, p_lng float8 default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_inside boolean; v_pickup boolean;
begin
  select pickup_enabled into v_pickup from public.businesses where id = p_business_id;
  v_inside := (v_uid is not null and (public.venue_presence_ok(p_business_id, v_uid) or public.is_venue_staff(p_business_id, v_uid)))
              or public.venue_inside(p_business_id, p_lat, p_lng);
  return jsonb_build_object('inside', v_inside, 'pickup_enabled', coalesce(v_pickup,false),
    'allowed_types', case when v_inside then jsonb_build_array('table','counter','gift')
                          when coalesce(v_pickup,false) then jsonb_build_array('counter') else '[]'::jsonb end);
end;
$$;
revoke all on function public.venue_order_access(uuid, float8, float8) from public;
grant execute on function public.venue_order_access(uuid, float8, float8) to anon, authenticated, service_role;

create or replace function public.assert_venue_order_allowed(p_business_id uuid, p_user_id uuid, p_order_type text, p_lat float8, p_lng float8, p_source text, p_taken_by uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_inside boolean; v_pickup boolean;
begin
  if p_taken_by is not null or coalesce(p_source,'') like 'pos%' then return; end if;
  if p_user_id is not null and public.is_venue_staff(p_business_id, p_user_id) then return; end if;
  v_inside := (p_user_id is not null and public.venue_presence_ok(p_business_id, p_user_id)) or public.venue_inside(p_business_id, p_lat, p_lng);
  if v_inside then return; end if;
  if coalesce(p_order_type,'counter') = 'counter' then
    select pickup_enabled into v_pickup from public.businesses where id = p_business_id;
    if coalesce(v_pickup,false) then return; end if;
    raise exception 'pickup_disabled' using errcode = '42501';
  end if;
  raise exception 'outside_venue' using errcode = '42501';
end;
$$;

create or replace function public.create_paid_order(p_order jsonb, p_items jsonb)
returns table (id uuid, order_number bigint) language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_number bigint;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'order_without_items' using errcode = '22023';
  end if;
  perform public.assert_venue_order_allowed((p_order->>'business_id')::uuid, nullif(p_order->>'user_id','')::uuid,
    coalesce(p_order->>'order_type','counter'), (p_order->>'lat')::float8, (p_order->>'lng')::float8,
    p_order->>'source', nullif(p_order->>'taken_by','')::uuid);
  insert into public.orders (business_id, user_id, room_id, status, order_type, gift_recipient_id, subtotal_cents, tax_cents, tip_cents, discount_cents,
    total_cents, promo_code, special_instructions, table_label, table_id, taken_by, contact_email, contact_phone, contact_name, stripe_pi_id, source,
    status_updated_at, paid_at, guest_device_id)
  values ((p_order->>'business_id')::uuid, nullif(p_order->>'user_id','')::uuid, nullif(p_order->>'room_id','')::uuid, coalesce(p_order->>'status','confirmed'),
    coalesce(p_order->>'order_type','counter'), nullif(p_order->>'gift_recipient_id','')::uuid, coalesce((p_order->>'subtotal_cents')::integer,0),
    coalesce((p_order->>'tax_cents')::integer,0), coalesce((p_order->>'tip_cents')::integer,0), coalesce((p_order->>'discount_cents')::integer,0),
    coalesce((p_order->>'total_cents')::integer,0), p_order->>'promo_code', p_order->>'special_instructions', p_order->>'table_label',
    nullif(p_order->>'table_id','')::uuid, nullif(p_order->>'taken_by','')::uuid, p_order->>'contact_email', p_order->>'contact_phone', p_order->>'contact_name',
    p_order->>'stripe_pi_id', coalesce(p_order->>'source','customer_stripe'), now(), coalesce((p_order->>'paid_at')::timestamptz, now()), p_order->>'guest_device_id')
  returning orders.id, orders.order_number into v_id, v_number;
  insert into public.order_items (order_id, menu_item_id, qty, price_cents, options, special_instructions, item_status)
  select v_id, (i->>'menu_item_id')::uuid, greatest(coalesce((i->>'qty')::integer,1),1), coalesce((i->>'price_cents')::integer,0),
         coalesce(i->'options','{}'::jsonb), i->>'special_instructions', 'pending'
  from jsonb_array_elements(p_items) i;
  return query select v_id, v_number;
end;
$$;

alter table public.service_calls add column if not exists guest_device_id text;
create or replace function public.enforce_service_call_golden_rule()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and not public.venue_presence_ok(new.business_id, new.user_id) and not public.is_venue_staff(new.business_id, new.user_id) then
    raise exception 'outside_venue' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_service_call_golden_rule on public.service_calls;
create trigger trg_service_call_golden_rule before insert on public.service_calls for each row execute function public.enforce_service_call_golden_rule();

create table if not exists public.guest_service_attempts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  device_id text not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists guest_service_attempts_idx on public.guest_service_attempts (business_id, device_id, created_at desc);
alter table public.guest_service_attempts enable row level security;

-- Devuelve {ok:false, error} en vez de lanzar, para que los intentos y bloqueos SÍ se guarden.
create or replace function public.guest_request_service(p_table_token text, p_lat float8, p_lng float8, p_device_id text, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t record; v_room uuid; v_id uuid; v_owner uuid; v_rejected int;
begin
  if p_device_id is null or length(p_device_id) < 8 then return jsonb_build_object('ok', false, 'error', 'device_required'); end if;
  select t.id, t.business_id, t.label, t.room_id into v_t from public.tables t where t.qr_token = p_table_token and t.is_active;
  if v_t.id is null then return jsonb_build_object('ok', false, 'error', 'invalid_qr'); end if;
  if exists (select 1 from public.guest_device_blocks b where b.business_id = v_t.business_id and b.device_id = p_device_id and b.blocked_until > now() and b.unblocked_at is null) then
    return jsonb_build_object('ok', false, 'error', 'blocked_24h');
  end if;
  if not public.venue_inside(v_t.business_id, p_lat, p_lng) then
    insert into public.guest_service_attempts (business_id, device_id, reason) values (v_t.business_id, p_device_id, 'outside_venue');
    if (select count(*) from public.guest_service_attempts a where a.business_id = v_t.business_id and a.device_id = p_device_id and a.created_at > now() - interval '10 minutes') >= 3 then
      insert into public.guest_device_blocks (business_id, device_id, reason, blocked_until) values (v_t.business_id, p_device_id, 'service_outside_venue', now() + interval '24 hours');
    end if;
    select count(*) into v_rejected from public.guest_service_attempts a where a.business_id = v_t.business_id and a.created_at > now() - interval '15 minutes';
    select owner_id into v_owner from public.businesses where id = v_t.business_id;
    if v_rejected >= 10 and v_owner is not null and not exists (
      select 1 from public.notifications n where n.user_id = v_owner and n.type = 'work_alert' and n.payload->>'kind' = 'service_abuse'
        and n.payload->>'business_id' = v_t.business_id::text and n.created_at > now() - interval '1 hour') then
      insert into public.notifications (user_id, type, payload) values (v_owner, 'work_alert',
        jsonb_build_object('kind','service_abuse','business_id', v_t.business_id, 'rejected_15m', v_rejected));
    end if;
    return jsonb_build_object('ok', false, 'error', 'outside_venue');
  end if;
  if exists (select 1 from public.service_calls sc where sc.business_id = v_t.business_id and sc.table_label = v_t.label and sc.status not in ('resolved','cancelled')) then
    return jsonb_build_object('ok', false, 'error', 'call_already_open');
  end if;
  v_room := coalesce(v_t.room_id, (select r.id from public.rooms r where r.business_id = v_t.business_id and r.parent_room_id is null and r.is_active limit 1));
  insert into public.service_calls (room_id, business_id, user_id, status, type, notes, table_label, guest_device_id)
  values (v_room, v_t.business_id, null, 'pending', 'waiter', left(p_notes, 200), v_t.label, p_device_id) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'table_label', v_t.label);
end;
$$;
revoke all on function public.guest_request_service(text, float8, float8, text, text) from public, anon, authenticated;
grant execute on function public.guest_request_service(text, float8, float8, text, text) to service_role;
