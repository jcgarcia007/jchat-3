-- Reversión de 242_gift_server_rules.sql. Se ejecuta a mano en el SQL Editor SOLO si hay que deshacer la 242. Es seguro ejecutarla dos veces.
-- Devuelve gift_offer_create y gift_offers_expire a su definición anterior (la de producción antes de la 242, que es la de la 202) y
-- quita la función nueva. Las dos columnas nuevas (last_payment_error, payment_failures) se DEJAN: son datos y no estorban; si se
-- quisieran quitar, sería un archivo aparte (destructivo) que aplica Juan.
-- Si la Edge Function stripe-webhook ya se desplegó con la 242, despliega antes la versión anterior (llama a gift_offer_mark_failed,
-- que sigue existiendo): si no, su rama de rechazos fallaría al no existir gift_offer_register_payment_failure.

drop function if exists public.gift_offer_register_payment_failure(text, text);

create or replace function public.gift_offer_create(p_business_id uuid, p_to_user_id uuid, p_items jsonb, p_note text default null, p_conversation_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_items jsonb; v_sub int; v_id uuid; v_n int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.gift_available(p_business_id, p_to_user_id) then raise exception 'gift_unavailable' using errcode = '42501'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 10 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;
  -- máx. 3 regalos enviados por hora, y uno pendiente a la vez hacia la misma persona
  if (select count(*) from public.gift_offers g where g.from_user_id = v_uid and g.created_at > now() - interval '1 hour') >= 3 then
    raise exception 'gift_rate_limit' using errcode = '42501';
  end if;
  if exists (select 1 from public.gift_offers g where g.from_user_id = v_uid and g.to_user_id = p_to_user_id and g.status in ('awaiting_payment','held','accepted')) then
    raise exception 'gift_pending' using errcode = '42501';
  end if;
  select jsonb_agg(jsonb_build_object('menu_item_id', m.id, 'name', m.name, 'description', m.description, 'qty', q.qty,
                                      'price_cents', m.price_cents, 'id_required', coalesce(m.id_required,false))), count(*)
  into v_items, v_n
  from (select (i->>'menu_item_id')::uuid as mid, greatest(least(coalesce((i->>'qty')::int,1), 10), 1) as qty from jsonb_array_elements(p_items) i) q
  join public.menu_items m on m.id = q.mid and m.business_id = p_business_id and coalesce(m.is_available, true);
  if v_n is null or v_n <> jsonb_array_length(p_items) then raise exception 'invalid_items' using errcode = '22023'; end if;
  select sum((i->>'price_cents')::int * (i->>'qty')::int) into v_sub from jsonb_array_elements(v_items) i;
  insert into public.gift_offers (business_id, from_user_id, to_user_id, conversation_id, items, note, subtotal_cents, status)
  values (p_business_id, v_uid, p_to_user_id, p_conversation_id, v_items, nullif(left(trim(coalesce(p_note,'')),200),''), v_sub, 'draft')
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'subtotal_cents', v_sub, 'items', v_items);
end;
$$;
revoke all on function public.gift_offer_create(uuid, uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.gift_offer_create(uuid, uuid, jsonb, text, uuid) to authenticated;

create or replace function public.gift_offers_expire()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  with u as (update public.gift_offers set status = 'expired' where status = 'held' and expires_at < now() returning 1)
  select count(*) into n from u;
  -- borradores/retenciones nunca confirmadas se cancelan a los 30 min
  update public.gift_offers set status = 'cancelled' where status in ('draft','awaiting_payment') and created_at < now() - interval '30 minutes';
  return n;
end;
$$;
revoke all on function public.gift_offers_expire() from public, anon, authenticated;
