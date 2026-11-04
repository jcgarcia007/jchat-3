-- 257: ¿el local está abierto ahora? NO APLICADA (la aplica Juan Carlos por MCP, cuando diga "aplica 257").
-- Reversión: supabase/rollbacks/257_business_open_now_rollback.sql · Comprobación: supabase/scripts/257_check.sql
--
-- Problema (prueba de tiendas, B9-3 / B9-7 / B7-4): la app calcula "Abierto/Cerrado" con el reloj del teléfono y el servidor no sabe nada del
-- horario: un pedido a un local cerrado se cobraba igual. Decisión de Juan: a un local cerrado SE ENTRA (etiqueta "Cerrado ahora") pero los
-- PEDIDOS se rechazan en el servidor con el error `venue_closed`.
--
-- Qué hace:
--   1. business_is_open_now(p_business_id, p_at) → boolean. Es el port a SQL de mobile/utils/hours.ts (getOpenStatus): cierre nocturno
--      (22:00–02:00 sigue abierto a la 01:00 del día siguiente), "todo el día" (00:00–23:59), día cerrado, y la hora se lee en la ZONA DEL LOCAL
--      (businesses.timezone). Si timezone es NULL o vacía se usa 'America/New_York' (lo único que hay hoy: los 7 locales están en esa zona).
--      Devuelve NULL cuando el horario es DESCONOCIDO (sin horario, forma rara, hora mal escrita, zona inexistente, local inexistente): en ese
--      caso NO se bloquea nada (no confirmado abierto, pero tampoco se afirma cerrado).
--   2. assert_venue_order_allowed rechaza con `venue_closed` (P0001) cuando business_is_open_now es false. Los pedidos del personal (taken_by,
--      source 'pos…') y el personal del local siguen sin pasar por la regla (pos_create_order no se toca).
--   3. create_paid_order rechaza con `venue_closed` SOLO un pedido que no trae pago (sin stripe_pi_id) ni lo toma el personal. Un pedido ya
--      cobrado NUNCA se rechaza (migración 198c: dejaría al cliente cobrado y sin pedido); lo que impide cobrar a un local cerrado es la Edge Function
--      payments (quote_order / create_payment_intent responden 409 venue_closed antes de crear nada en Stripe).
--
-- Seguridad: business_is_open_now solo devuelve un booleano calculado con datos públicos del local; la pueden ejecutar authenticated y
-- service_role (no anon, no PUBLIC). Los dos ayudantes de lectura de horas son internos (solo los usa esta función, que es security definer).
--
-- Idempotente y no destructivo: "create or replace" y revoke/grant. No toca datos.

-- "HH:MM" → minutos desde medianoche, o NULL si no es una hora válida ("24:00" = 1440). Mismo criterio que parseTimeToMinutes (hours.ts).
create or replace function public.business_hours_minutes(p_time text)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare m text[]; h int; mi int;
begin
  if p_time is null then return null; end if;
  m := regexp_match(btrim(p_time, E' \t\r\n'), '^([0-9]{1,2}):([0-9]{2})$');
  if m is null then return null; end if;
  h := m[1]::int;
  mi := m[2]::int;
  if mi > 59 then return null; end if;
  if h = 24 and mi = 0 then return 1440; end if;
  if h > 23 then return null; end if;
  return h * 60 + mi;
end;
$$;

-- Una entrada de día de businesses.hours → {tipo, abre, cierra}: tipo 0 = ilegible, 1 = cerrado, 2 = tramo. Mismo criterio que parseDay (hours.ts).
create or replace function public.business_hours_day(p_entry jsonb)
returns integer[]
language plpgsql
immutable
set search_path = public
as $$
declare v_open int; v_close int;
begin
  if p_entry is null or jsonb_typeof(p_entry) <> 'object' then return array[0, 0, 0]; end if;
  if p_entry -> 'closed' = 'true'::jsonb then return array[1, 0, 0]; end if;
  if jsonb_typeof(p_entry -> 'open') = 'string' then v_open := public.business_hours_minutes(p_entry ->> 'open'); end if;
  if jsonb_typeof(p_entry -> 'close') = 'string' then v_close := public.business_hours_minutes(p_entry ->> 'close'); end if;
  if v_open is null or v_close is null or v_open = v_close then return array[0, 0, 0]; end if;
  return array[2, v_open, v_close];
end;
$$;

create or replace function public.business_is_open_now(p_business_id uuid, p_at timestamptz default now())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- extract(dow): 0 = domingo … 6 = sábado  →  índice + 1
  c_keys constant text[] := array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  v_hours jsonb;
  v_tz    text;
  v_local timestamp;
  v_dow   int;
  v_min   int;
  v_today int[];
  v_yday  int[];
begin
  select b.hours, b.timezone into v_hours, v_tz from public.businesses b where b.id = p_business_id;
  if not found or v_hours is null or jsonb_typeof(v_hours) <> 'object' then return null; end if;

  begin
    v_tz    := coalesce(nullif(btrim(v_tz), ''), 'America/New_York');
    v_local := p_at at time zone v_tz;                       -- la hora de pared EN LA ZONA DEL LOCAL
    v_dow   := extract(dow from v_local)::int;
    v_min   := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
    v_today := public.business_hours_day(v_hours -> c_keys[v_dow + 1]);
    v_yday  := public.business_hours_day(v_hours -> c_keys[((v_dow + 6) % 7) + 1]);
  exception when others then
    return null;                                             -- zona desconocida, fecha rara…: horario desconocido, no se bloquea
  end;

  -- La jornada de ayer que cruza la medianoche (p. ej. vie 22:00–02:00) todavía cubre las primeras horas de hoy.
  if v_yday[1] = 2 and v_yday[3] < v_yday[2] and v_min < v_yday[3] then return true; end if;

  if v_today[1] = 0 then return null; end if;              -- hoy ilegible → desconocido
  if v_today[1] = 1 then return false; end if;             -- hoy cerrado
  if v_today[2] = 0 and v_today[3] >= 1439 then return true; end if;   -- 00:00–23:59 = abierto todo el día
  if v_today[3] > v_today[2] then
    return v_min >= v_today[2] and v_min < v_today[3];
  end if;
  return v_min >= v_today[2];                              -- jornada que empieza hoy y cierra pasada la medianoche
end;
$$;

comment on function public.business_is_open_now(uuid, timestamptz) is
  'true/false si el local está abierto en ese instante según businesses.hours leído en businesses.timezone (America/New_York si falta); NULL si el horario es desconocido (en ese caso no se bloquea). Port de mobile/utils/hours.ts.';

revoke all on function public.business_hours_minutes(text) from public, anon, authenticated;
revoke all on function public.business_hours_day(jsonb) from public, anon, authenticated;
revoke all on function public.business_is_open_now(uuid, timestamptz) from public, anon;
grant execute on function public.business_is_open_now(uuid, timestamptz) to authenticated, service_role;

-- assert_venue_order_allowed: igual que antes + rechazo `venue_closed`. El personal y el POS siguen saltándose la regla (primeras líneas).
create or replace function public.assert_venue_order_allowed(
  p_business_id uuid, p_user_id uuid, p_order_type text, p_lat double precision, p_lng double precision, p_source text, p_taken_by uuid
) returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_inside boolean; v_pickup boolean;
begin
  -- Pedidos tomados por el personal (POS) no pasan por la regla
  if p_taken_by is not null or coalesce(p_source,'') like 'pos%' then return; end if;
  if p_user_id is not null and public.is_venue_staff(p_business_id, p_user_id) then return; end if;
  -- Local cerrado: se puede entrar al chat, pero no se piden pedidos (NULL = horario desconocido: no se bloquea)
  if public.business_is_open_now(p_business_id) is false then
    raise exception 'venue_closed' using errcode = 'P0001';
  end if;
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

-- create_paid_order: igual que antes + rechazo `venue_closed` solo para un pedido SIN pago y que no toma el personal.
create or replace function public.create_paid_order(p_order jsonb, p_items jsonb)
returns table (id uuid, order_number bigint)
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid; v_number bigint;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'order_without_items' using errcode = '22023';
  end if;
  -- Un pedido ya cobrado (stripe_pi_id) NUNCA se rechaza (198c). Uno sin pago, de un local cerrado, sí.
  if nullif(p_order->>'stripe_pi_id', '') is null
     and nullif(p_order->>'taken_by', '') is null
     and coalesce(p_order->>'source', 'customer_stripe') not like 'pos%'
     and public.business_is_open_now(nullif(p_order->>'business_id', '')::uuid) is false then
    raise exception 'venue_closed' using errcode = 'P0001';
  end if;
  insert into public.orders (business_id, user_id, room_id, status, order_type, gift_recipient_id, subtotal_cents, tax_cents, tip_cents, discount_cents,
    total_cents, promo_code, special_instructions, table_label, table_id, taken_by, contact_email, contact_phone, contact_name, stripe_pi_id, source,
    status_updated_at, paid_at, guest_device_id, guest_tracking_code)
  values ((p_order->>'business_id')::uuid, nullif(p_order->>'user_id','')::uuid, nullif(p_order->>'room_id','')::uuid, coalesce(p_order->>'status','confirmed'),
    coalesce(p_order->>'order_type','counter'), nullif(p_order->>'gift_recipient_id','')::uuid, coalesce((p_order->>'subtotal_cents')::integer,0),
    coalesce((p_order->>'tax_cents')::integer,0), coalesce((p_order->>'tip_cents')::integer,0), coalesce((p_order->>'discount_cents')::integer,0),
    coalesce((p_order->>'total_cents')::integer,0), p_order->>'promo_code', p_order->>'special_instructions', p_order->>'table_label',
    nullif(p_order->>'table_id','')::uuid, nullif(p_order->>'taken_by','')::uuid, p_order->>'contact_email', p_order->>'contact_phone', p_order->>'contact_name',
    p_order->>'stripe_pi_id', coalesce(p_order->>'source','customer_stripe'), now(), coalesce((p_order->>'paid_at')::timestamptz, now()), p_order->>'guest_device_id',
    nullif(p_order->>'guest_tracking_code',''))
  returning orders.id, orders.order_number into v_id, v_number;
  insert into public.order_items (order_id, menu_item_id, qty, price_cents, options, special_instructions, item_status)
  select v_id, (i->>'menu_item_id')::uuid, greatest(coalesce((i->>'qty')::integer,1),1), coalesce((i->>'price_cents')::integer,0),
         coalesce(i->'options','{}'::jsonb), i->>'special_instructions', 'pending'
  from jsonb_array_elements(p_items) i;
  return query select v_id, v_number;
end;
$$;

-- Los permisos de estas dos funciones no cambian ("create or replace" los conserva); se repiten para que la migración sea autosuficiente.
revoke all on function public.assert_venue_order_allowed(uuid, uuid, text, double precision, double precision, text, uuid) from public, anon, authenticated;
grant execute on function public.assert_venue_order_allowed(uuid, uuid, text, double precision, double precision, text, uuid) to service_role;
revoke all on function public.create_paid_order(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_paid_order(jsonb, jsonb) to service_role;
