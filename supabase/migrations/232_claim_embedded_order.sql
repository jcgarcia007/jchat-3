-- 232 — claim_embedded_order: the web app's menu sheet (iframe of jchat.cloud/m/<slug>?embed=1) places orders as a
-- guest (the iframe has no app session). After 'order_placed', the signed-in app claims the order with the guest
-- tracking code it just received (possession proof), so the order shows in My Orders / tracking and status
-- notifications reach the user. Only unclaimed orders, only within 30 minutes, only with the exact code.
-- (Applied in production by Planning on 2026-10-13; order_number returned as integer.)

create or replace function public.claim_embedded_order(p_order_id uuid, p_tracking_code text, p_room_id uuid default null)
 returns table (order_id uuid, order_number integer, status text, business_id uuid)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_row public.orders%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_order_id is null or p_tracking_code is null or length(p_tracking_code) < 16 then
    raise exception 'invalid_claim' using errcode = '22023';
  end if;

  update public.orders o
     set user_id = v_uid,
         room_id = coalesce(o.room_id, (select r.id from public.rooms r where r.id = p_room_id and r.business_id = o.business_id))
   where o.id = p_order_id
     and o.user_id is null
     and o.guest_tracking_code = p_tracking_code
     and o.created_at > now() - interval '30 minutes'
  returning o.* into v_row;

  if v_row.id is null then
    raise exception 'claim_not_allowed' using errcode = '42501';
  end if;

  insert into public.notifications (user_id, type, payload)
  values (v_uid, 'order_status', jsonb_build_object(
    'order_id', v_row.id,
    'order_number', v_row.order_number,
    'business_id', v_row.business_id,
    'business_name', (select b.name from public.businesses b where b.id = v_row.business_id),
    'status', v_row.status,
    'order_type', v_row.order_type,
    'table_label', v_row.table_label));

  return query select v_row.id, v_row.order_number::integer, v_row.status, v_row.business_id;
end;
$function$;

revoke all on function public.claim_embedded_order(uuid, text, uuid) from public, anon;
grant execute on function public.claim_embedded_order(uuid, text, uuid) to authenticated;
