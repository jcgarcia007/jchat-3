-- 244: límite de rechazos de pago por usuario (contra probar tarjetas): como máximo 5 rechazos por hora entre todas las ofertas del usuario.
-- BORRADOR PARA REVISIÓN: NO está aplicada en Supabase. La aplica Juan Carlos (SQL Editor / MCP).
-- Reversión: supabase/rollbacks/244_gift_failure_rate_limit_rollback.sql (devuelve gift_offer_create a la versión de la 242) ·
-- Comprobación: supabase/scripts/244_check.sql
--
-- POR QUÉ: la 242 cuenta para el límite de 3 regalos por hora SOLO las ofertas que llegaron a retener la tarjeta (held_at), para que un
-- rechazo no bloquee a quien reintenta con otra tarjeta. Pero así una persona puede abrir una oferta nueva tras otra SIN llegar a pagar
-- y probar tarjetas (3 intentos por oferta; hoy solo lo frena Radar de Stripe). Esta migración añade, justo después del límite de 3 por
-- hora, un tope de 5 rechazos por hora sumando payment_failures de las ofertas del usuario creadas en la última hora.
--
-- QUÉ CAMBIA: SOLO gift_offer_create, y solo el bloque marcado "Máx. 5 rechazos de pago por hora". Todo lo demás es EXACTAMENTE la
-- definición de la 242 (límite de 3 por hora por held_at, pendiente = held/accepted, cancela las propias abiertas, caduca a los
-- 15 min, validación de ítems y precios). El código de error es el mismo que el del otro límite (gift_rate_limit, errcode 42501), así
-- que el cliente ya sabe mostrarlo. Los rechazos de las ofertas que esta propia llamada cancela (las abiertas) cuentan: se suman antes.
--
-- Idempotente: create or replace + grants repetibles. Sin tablas ni columnas nuevas (payment_failures lo creó la 242). Sin drop.

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
  -- máx. 3 regalos por hora, contando SOLO los que llegaron a retener la tarjeta (held_at), y uno pendiente a la vez hacia la
  -- misma persona (held o accepted: ya está en manos del destinatario). Un regalo sin pagar o cancelado no cuenta ni bloquea.
  if (select count(*) from public.gift_offers g where g.from_user_id = v_uid and g.held_at > now() - interval '1 hour') >= 3 then
    raise exception 'gift_rate_limit' using errcode = '42501';
  end if;
  -- Máx. 5 rechazos de pago por hora entre TODAS las ofertas del usuario (creadas en la última hora), tengan o no tarjeta retenida: sin
  -- esto, abrir ofertas nuevas sin pagar (que el límite de arriba no cuenta) sirve para probar tarjetas, 3 intentos por oferta.
  if (select coalesce(sum(g.payment_failures), 0) from public.gift_offers g where g.from_user_id = v_uid and g.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'gift_rate_limit' using errcode = '42501';
  end if;
  if exists (select 1 from public.gift_offers g where g.from_user_id = v_uid and g.to_user_id = p_to_user_id and g.status in ('held','accepted')) then
    raise exception 'gift_pending' using errcode = '42501';
  end if;
  select jsonb_agg(jsonb_build_object('menu_item_id', m.id, 'name', m.name, 'description', m.description, 'qty', q.qty,
                                      'price_cents', m.price_cents, 'id_required', coalesce(m.id_required,false))), count(*)
  into v_items, v_n
  from (select (i->>'menu_item_id')::uuid as mid, greatest(least(coalesce((i->>'qty')::int,1), 10), 1) as qty from jsonb_array_elements(p_items) i) q
  join public.menu_items m on m.id = q.mid and m.business_id = p_business_id and coalesce(m.is_available, true);
  if v_n is null or v_n <> jsonb_array_length(p_items) then raise exception 'invalid_items' using errcode = '22023'; end if;
  select sum((i->>'price_cents')::int * (i->>'qty')::int) into v_sub from jsonb_array_elements(v_items) i;
  -- Una sola oferta abierta por persona: las propias que sigan sin pagar (hoja cerrada sin "Volver", pestaña perdida...) se cancelan
  -- ahora; si ya tenían PaymentIntent, el trigger gift_offer_dispatch avisa a gift-worker para cancelarlo.
  update public.gift_offers set status = 'cancelled' where from_user_id = v_uid and status in ('draft', 'awaiting_payment');
  insert into public.gift_offers (business_id, from_user_id, to_user_id, conversation_id, items, note, subtotal_cents, status, expires_at)
  values (p_business_id, v_uid, p_to_user_id, p_conversation_id, v_items, nullif(left(trim(coalesce(p_note,'')),200),''), v_sub, 'draft', now() + interval '15 minutes')
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'subtotal_cents', v_sub, 'items', v_items);
end;
$$;

-- (create or replace conserva los grants de la 242: authenticated sí, anon no. Se repiten por si la función se recreó.)
revoke all on function public.gift_offer_create(uuid, uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.gift_offer_create(uuid, uuid, jsonb, text, uuid) to authenticated;
