-- 240: pedir asistencia SIN cuenta con el QR general: el invitado escribe el número de mesa.
-- BORRADOR PARA REVISIÓN: NO está aplicada en Supabase. La aplica Juan Carlos cuando dé el OK (SQL Editor / MCP).
-- Reversión: supabase/rollbacks/240_guest_service_by_label_rollback.sql (fuera de migrations/ a propósito: el CLI aplicaría
-- cualquier archivo de esta carpeta, también uno de reversión).
-- Comprobación (sin escribir nada): supabase/scripts/240_check.sql
-- Orden de despliegue: 1) aplicar esta migración · 2) desplegar la Edge Function guest-tab (acepta business_id + table_label).
--     Si la función se despliega antes, solo falla la rama nueva (la de QR de mesa no cambia).
--
-- POR QUÉ ASÍ (y no una RPC pública que devuelva el token de la mesa):
--   El token de la mesa (tables.qr_token) es lo que prueba que se escaneó el QR de ESA mesa: abre pedidos, cuenta y llamada.
--   Una RPC pública "dame el token de la mesa 7" lo regalaría a cualquiera. Aquí el token nunca sale del servidor: la
--   función nueva solo la puede ejecutar service_role (la Edge Function guest-tab, que ya exige hCaptcha) y busca la mesa
--   dentro de la base de datos.
--
-- QUÉ HACE: busca la mesa ACTIVA del negocio por su número y delega en guest_request_service (198) con el token de esa
-- mesa. Todo lo demás es lo de siempre y no se duplica: ubicación dentro del local (venue_inside, radio + 25 m), bloqueo
-- de dispositivo 24 h, una sola llamada abierta por mesa, aviso de abuso al dueño.
--
-- Número de mesa: se NORMALIZA lo que teclea el invitado y también la etiqueta de cada mesa, quitando un prefijo
-- 'mesa', 'table' o 't' (con o sin espacio): "7", "T7", "t 7", "mesa 7", "Mesa7" y "table 7" encuentran la mesa cuya
-- etiqueta sea 'T7' (y 'T7' se normaliza a '7'). Se prefiere la coincidencia exacta si existieran '7' y 'T7'.
-- (Versión corregida: la primera añadía los prefijos a la ETIQUETA y "mesa 1" no encontraba 'T1'.)
--
-- Errores nuevos: 'invalid_table' (no hay una mesa activa con ese número). Los demás ya existían: device_required,
-- blocked_24h, outside_venue, call_already_open.
--
-- Antiabuso (no se puede probar números de mesa desde fuera):
--   · Una persona FUERA del local recibe 'outside_venue' aunque el número no exista: no sabe si la mesa existe.
--   · Dentro del local, un número inexistente se registra en guest_service_attempts (reason 'invalid_table'); 6 en 10 minutos
--     desde el mismo dispositivo bloquean ese dispositivo 24 h (mismo mecanismo y mismo mensaje que 'outside_venue').
--
-- Idempotente: create or replace + grants repetibles.

create or replace function public.guest_request_service_by_label(
  p_business_id uuid,
  p_label       text,
  p_lat         float8,
  p_lng         float8,
  p_device_id   text,
  p_notes       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label   text;
  v_token   text;
  v_invalid int;
begin
  -- Lo que teclea el invitado: minúsculas, sin espacios en los bordes y sin el prefijo mesa / table / t.
  v_label := lower(btrim(coalesce(p_label, '')));
  v_label := regexp_replace(v_label, '^(mesa|table|t)\s*', '');   -- "mesa 7", "table 7", "T7", "t 7" → "7"

  if p_device_id is null or length(p_device_id) < 8 then
    return jsonb_build_object('ok', false, 'error', 'device_required');
  end if;

  -- Negocio inexistente / inactivo o número vacío o absurdo: no es una mesa.
  if p_business_id is null or v_label = '' or length(v_label) > 20
     or not exists (select 1 from public.businesses b where b.id = p_business_id and b.is_active) then
    return jsonb_build_object('ok', false, 'error', 'invalid_table');
  end if;

  if exists (select 1 from public.guest_device_blocks g
             where g.business_id = p_business_id and g.device_id = p_device_id
               and g.blocked_until > now() and g.unblocked_at is null) then
    return jsonb_build_object('ok', false, 'error', 'blocked_24h');
  end if;

  -- La mesa activa de ESE negocio con ese número: la etiqueta se normaliza igual que lo tecleado; la coincidencia exacta primero.
  select t.qr_token into v_token
  from public.tables t
  where t.business_id = p_business_id
    and t.is_active
    and regexp_replace(lower(btrim(t.label)), '^(mesa|table|t)\s*', '') = v_label
  order by (lower(btrim(t.label)) = v_label) desc, t.label
  limit 1;

  if v_token is null then
    -- Quien está fuera del local recibe lo mismo que recibiría con una mesa que sí existe: no puede averiguar números.
    if not public.venue_inside(p_business_id, p_lat, p_lng) then
      return jsonb_build_object('ok', false, 'error', 'outside_venue');
    end if;
    insert into public.guest_service_attempts (business_id, device_id, reason)
    values (p_business_id, p_device_id, 'invalid_table');
    select count(*) into v_invalid
    from public.guest_service_attempts a
    where a.business_id = p_business_id and a.device_id = p_device_id and a.reason = 'invalid_table'
      and a.created_at > now() - interval '10 minutes';
    if v_invalid >= 6 then
      -- Hay un índice único de bloqueos activos por (negocio, dispositivo): si ya existe uno, se renueva.
      insert into public.guest_device_blocks (business_id, device_id, reason, blocked_until)
      values (p_business_id, p_device_id, 'service_invalid_table', now() + interval '24 hours')
      on conflict (business_id, device_id) where unblocked_at is null
      do update set blocked_until = excluded.blocked_until, reason = excluded.reason;
    end if;
    return jsonb_build_object('ok', false, 'error', 'invalid_table');
  end if;

  -- Mesa encontrada: el resto (ubicación, bloqueo, una llamada abierta por mesa, abuso) es guest_request_service.
  return public.guest_request_service(v_token, p_lat, p_lng, p_device_id, p_notes);
end;
$$;

comment on function public.guest_request_service_by_label(uuid, text, float8, float8, text, text) is
  'Llamar al servicio sin cuenta con el QR general: busca la mesa activa del negocio por su número y delega en '
  'guest_request_service. Solo service_role (la Edge Function guest-tab, con hCaptcha); el token de la mesa no sale del servidor.';

-- Solo la Edge Function guest-tab (service_role) la llama: nadie más, igual que guest_request_service.
revoke all on function public.guest_request_service_by_label(uuid, text, float8, float8, text, text) from public, anon, authenticated;
grant execute on function public.guest_request_service_by_label(uuid, text, float8, float8, text, text) to service_role;
