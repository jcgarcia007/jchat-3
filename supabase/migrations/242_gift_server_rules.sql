-- 242: reglas de servidor de los regalos: un rechazo NO mata la oferta, las ofertas abandonadas caducan a los 15 min y los límites
--      cuentan solo lo que llegó a retener.
-- BORRADOR PARA REVISIÓN: NO está aplicada en Supabase. La aplica Juan Carlos cuando dé el OK (SQL Editor / MCP).
-- Reversión: supabase/rollbacks/242_gift_server_rules_rollback.sql (fuera de migrations/ a propósito: el CLI aplicaría
-- cualquier archivo de esta carpeta, también uno de reversión).
-- Comprobación: supabase/scripts/242_check.sql
-- Orden de despliegue: 1) aplicar esta migración (es aditiva: el webhook actual sigue funcionando con gift_offer_mark_failed, que NO
--     se toca) · 2) desplegar la Edge Function stripe-webhook (usa la función nueva y cancela retenciones sin dueño) · 3) publicar el
--     cliente. Si el webhook se desplegara ANTES que esta migración, su llamada a la función nueva fallaría y Stripe reintentaría.
--
-- QUÉ ARREGLA (ver el informe del PASO 0):
--   A) Hoy payment_intent.payment_failed pone la oferta en 'failed'. Si la persona reintenta con otra tarjeta en el MISMO
--      PaymentIntent y queda en requires_capture, gift_offer_mark_held ve 'failed' y no marca nada: la retención queda viva y
--      nadie la cancela. Ahora un rechazo se REGISTRA (motivo + contador) y la oferta sigue en 'awaiting_payment'; al tercer
--      rechazo pasa a 'cancelled' y el trigger de siempre (gift_offer_dispatch) hace que gift-worker cancele el PaymentIntent.
--   C) Una oferta sin pagar caducaba a los 30 min desde su creación; ahora a los 15 (expires_at se fija al crear). Pasa a
--      'cancelled', NO a 'expired': 'expired' avisa a quien regala de que "no respondió a tiempo" y aquí el destinatario nunca
--      vio la oferta. mark_held sigue fijando expires_at = held_at + 15 min cuando la tarjeta queda retenida.
--   D) El límite de 3 por hora cuenta SOLO ofertas que llegaron a retener (held_at). "Una pendiente a la vez hacia la misma
--      persona" cuenta held y accepted (la oferta ya está en manos del destinatario, o capturándose); una sin pagar no bloquea.
--      Para que eso no abra la puerta a acumular ofertas sin pagar, crear una oferta nueva CANCELA las propias que sigan abiertas
--      (draft / awaiting_payment): queda una sola abierta por persona y su PaymentIntent se cancela por el trigger de siempre.
--   E) No cambia importes, metadata, captura ni la creación de órdenes: solo estados, contadores y caducidad.
--
-- Idempotente: add column if not exists + create or replace + grants repetibles. Sin drop.

-- ── A) Motivo y contador de rechazos ────────────────────────────────────────────────────────────────────────────
alter table public.gift_offers add column if not exists last_payment_error text;
alter table public.gift_offers add column if not exists payment_failures integer not null default 0;

comment on column public.gift_offers.last_payment_error is
  'Último rechazo de pago del PaymentIntent de la oferta (código y mensaje de Stripe, máx. 200 caracteres). Nunca datos de tarjeta.';
comment on column public.gift_offers.payment_failures is
  'Cuántos rechazos de pago lleva la oferta (payment_intent.payment_failed). Al tercero la oferta se cancela.';

-- Solo el webhook (service_role). Devuelve { ok, status, failures }.
--   · awaiting_payment: suma 1 y guarda el motivo; si llega a 3 → 'cancelled' (el trigger avisa a gift-worker: cancela el PaymentIntent).
--   · accepted: igual que siempre → 'failed' (la captura tras aceptar no pudo cobrarse).
--   · cualquier otro estado: no cambia nada.
create or replace function public.gift_offer_register_payment_failure(p_stripe_pi_id text, p_error text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g          public.gift_offers%rowtype;
  v_failures int;
  v_error    text := nullif(left(trim(coalesce(p_error, '')), 200), '');
begin
  select * into g from public.gift_offers where stripe_pi_id = p_stripe_pi_id for update;
  if g.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  if g.status = 'accepted' then
    update public.gift_offers set status = 'failed', last_payment_error = v_error where id = g.id;
    return jsonb_build_object('ok', true, 'status', 'failed', 'failures', g.payment_failures);
  end if;

  if g.status <> 'awaiting_payment' then
    return jsonb_build_object('ok', true, 'status', g.status, 'failures', g.payment_failures);
  end if;

  v_failures := g.payment_failures + 1;
  if v_failures >= 3 then
    update public.gift_offers set payment_failures = v_failures, last_payment_error = v_error, status = 'cancelled' where id = g.id;
    return jsonb_build_object('ok', true, 'status', 'cancelled', 'failures', v_failures);
  end if;

  update public.gift_offers set payment_failures = v_failures, last_payment_error = v_error where id = g.id;
  return jsonb_build_object('ok', true, 'status', 'awaiting_payment', 'failures', v_failures);
end;
$$;

comment on function public.gift_offer_register_payment_failure(text, text) is
  'Webhook payment_failed de un regalo: registra el rechazo y deja la oferta en awaiting_payment para reintentar en el mismo PaymentIntent; '
  'al tercero la cancela (gift-worker cancela el PaymentIntent). accepted → failed como siempre.';

revoke all on function public.gift_offer_register_payment_failure(text, text) from public, anon, authenticated;
grant execute on function public.gift_offer_register_payment_failure(text, text) to service_role;

-- ── C + D) Crear la oferta: caducidad a los 15 min, límites que cuentan lo retenido, una sola abierta por persona ──
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

-- (create or replace conserva los grants de la 202: authenticated sí, anon no. Se repiten por si la función se recreó.)
revoke all on function public.gift_offer_create(uuid, uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.gift_offer_create(uuid, uuid, jsonb, text, uuid) to authenticated;

-- ── C) Caducidad: held a su hora (como siempre); sin pagar a los 15 min de crearse (antes 30) ───────────────────────
-- Las filas anteriores a esta migración no tienen expires_at: para ellas vale created_at + 15 min.
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
  -- borradores/ofertas sin pagar: 'cancelled' (NO 'expired': el destinatario nunca la vio). El trigger avisa a gift-worker, que
  -- cancela su PaymentIntent si existe.
  update public.gift_offers set status = 'cancelled'
  where status in ('draft', 'awaiting_payment') and coalesce(expires_at, created_at + interval '15 minutes') < now();
  return n;
end;
$$;
revoke all on function public.gift_offers_expire() from public, anon, authenticated;
