-- 200: Aviso al local sobre un pedido YA PAGADO (recoger o mesa), sin depender de la ubicación.
-- Solo el dueño del pedido. Tipos: on_my_way | arrived | question (con nota). Límites anti-abuso.
-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-04). Este archivo solo la versiona.

alter table public.service_calls add column if not exists order_id uuid references public.orders(id) on delete cascade;
create index if not exists service_calls_order_idx on public.service_calls (order_id) where order_id is not null;

-- La regla de oro del mesero NO aplica a avisos de pedido, pero estos SOLO pueden crearse por la función (no insert directo).
create or replace function public.enforce_service_call_golden_rule()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'order' then
    if coalesce(current_setting('app.order_notify', true), '') <> 'on' then
      raise exception 'order_notice_via_rpc_only' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.user_id is not null and not public.venue_presence_ok(new.business_id, new.user_id) and not public.is_venue_staff(new.business_id, new.user_id) then
    raise exception 'outside_venue' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.order_notify_staff(p_order_id uuid, p_kind text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_o record; v_room uuid; v_id uuid; v_note text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_kind not in ('on_my_way','arrived','question') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  select o.id, o.business_id, o.user_id, o.room_id, o.status, o.order_type, o.table_label, o.order_number, o.created_at
    into v_o from public.orders o where o.id = p_order_id;
  if v_o.id is null or v_o.user_id is distinct from v_uid then raise exception 'not_your_order' using errcode = '42501'; end if;
  if v_o.status in ('cancelled') or v_o.created_at < now() - interval '12 hours' then
    raise exception 'order_closed' using errcode = '22023';
  end if;
  if exists (select 1 from public.service_calls sc where sc.order_id = p_order_id and sc.created_at > now() - interval '2 minutes') then
    raise exception 'notice_cooldown' using errcode = '42501';
  end if;
  if (select count(*) from public.service_calls sc where sc.order_id = p_order_id) >= 6 then
    raise exception 'notice_limit' using errcode = '42501';
  end if;
  v_room := coalesce(v_o.room_id, (select r.id from public.rooms r where r.business_id = v_o.business_id and r.parent_room_id is null and r.is_active order by r.created_at limit 1));
  if v_room is null then raise exception 'no_room' using errcode = '22023'; end if;
  v_note := nullif(left(trim(coalesce(p_note,'')), 200), '');
  if p_kind = 'question' and v_note is null then raise exception 'note_required' using errcode = '22023'; end if;
  perform set_config('app.order_notify', 'on', true);
  insert into public.service_calls (room_id, business_id, user_id, status, type, notes, table_label, order_id)
  values (v_room, v_o.business_id, v_uid, 'pending', 'order',
          '#' || v_o.order_number || ' · ' || p_kind || coalesce(' · ' || v_note, ''), v_o.table_label, p_order_id)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'order_number', v_o.order_number, 'kind', p_kind);
end;
$$;
revoke all on function public.order_notify_staff(uuid, text, text) from public, anon;
grant execute on function public.order_notify_staff(uuid, text, text) to authenticated;

create or replace function public.enforce_service_call_cooldown()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'order' then return new; end if;
  if exists (select 1 from public.service_calls sc where sc.user_id = new.user_id and sc.room_id = new.room_id and sc.type <> 'order'
             and sc.created_at > now() - interval '5 minutes') then
    raise exception 'service_call_cooldown' using hint = 'Ya llamaste hace poco, espera unos minutos antes de volver a llamar.';
  end if;
  return new;
end;
$$;
