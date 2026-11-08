-- 269: business_plan_requests + submit_business_plan_request — solicitudes del plan Custom desde /pricing/business. NO APLICADA (la aplica Juan Carlos por MCP).
--
-- Qué hace
--   · Tabla public.business_plan_requests: una fila por solicitud (nombre del negocio, nº de locales, teléfono opcional, correo, mensaje opcional,
--     idioma, hash de IP, usuario si había sesión). RLS activada y SIN ninguna política para anon/authenticated: nadie lee ni escribe la tabla
--     directamente (ni SELECT ni INSERT); además se les revocan los privilegios de tabla. Solo service_role / el SQL Editor la leen.
--   · RPC public.submit_business_plan_request(...): security definer, search_path = public. Valida, rellena user_id = auth.uid() (null si es
--     invitado), aplica el límite y devuelve jsonb:  {"ok": true}  |  {"ok": false, "code": "INVALID" | "RATE_LIMIT"}.
--
-- Validación (cualquier fallo → INVALID, sin insertar): nombre 1–120 caracteres (tras recortar), correo con formato básico y ≤ 200, mensaje ≤ 2000
--   (vacío = null), nº de locales 1–999, teléfono ≤ 40 (vacío = null), idioma 'es' | 'en' (otro valor = null), hash de IP ≤ 128.
--
-- Límite: 3 solicitudes por hora. Se cuenta por correo (siempre) Y por ip_hash (si la web lo pasa): basta que una de las dos cuentas llegue a 3 para
--   devolver RATE_LIMIT. La web (route handler /api/business-plan-request) calcula ip_hash = HMAC-SHA256 del x-forwarded-for y se lo pasa; una
--   llamada directa a la RPC sin ip_hash queda limitada solo por correo (el correo no es de fiar, así que el límite por IP solo es tan fuerte como
--   lo sea el canal que lo pasa). Un bloqueo asesor por correo evita que dos solicitudes simultáneas se salten el límite.
--
-- TODO spec 4: encolar outbound_emails kind = 'business_plan_request' → SALES_EMAIL (ventas@jchat.cloud) desde aquí. En este spec NO se envía ningún correo.
--
-- Cómo leer las solicitudes mientras tanto (solo lectura, SQL Editor / service_role):
--   select created_at, business_name, locations_count, email, phone, message, locale, user_id
--     from public.business_plan_requests order by created_at desc limit 50;
--
-- Idempotente y no destructivo: create table if not exists, create index if not exists, create or replace function; sin DROP/DELETE/TRUNCATE.
-- Rollback (solo si hiciera falta; borra las solicitudes guardadas):
--   drop function if exists public.submit_business_plan_request(text, integer, text, text, text, text, text);
--   drop table if exists public.business_plan_requests;
-- Verificación: ver supabase/scripts/269_check.sql (solo lectura).

create table if not exists public.business_plan_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid null references auth.users (id) on delete set null,
  business_name   text not null,
  locations_count integer not null check (locations_count > 0),
  phone           text,
  email           text not null,
  message         text,
  locale          text,
  ip_hash         text,
  created_at      timestamptz not null default now()
);

alter table public.business_plan_requests enable row level security;
-- Sin políticas para anon/authenticated a propósito. Además, sin privilegios de tabla:
revoke all on table public.business_plan_requests from anon, authenticated;

create index if not exists business_plan_requests_email_created_idx on public.business_plan_requests (lower(email), created_at desc);
create index if not exists business_plan_requests_ip_created_idx on public.business_plan_requests (ip_hash, created_at desc) where ip_hash is not null;

create or replace function public.submit_business_plan_request(
  p_business_name   text,
  p_locations_count integer,
  p_phone           text,
  p_email           text,
  p_message         text,
  p_locale          text,
  p_ip_hash         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text := btrim(coalesce(p_business_name, ''));
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_phone   text := nullif(btrim(coalesce(p_phone, '')), '');
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_locale  text := case when p_locale in ('es', 'en') then p_locale else null end;
  v_ip_hash text := nullif(btrim(coalesce(p_ip_hash, '')), '');
  v_recent  integer;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 120
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 200
     or p_locations_count is null or p_locations_count < 1 or p_locations_count > 999
     or (v_phone is not null and char_length(v_phone) > 40)
     or (v_message is not null and char_length(v_message) > 2000)
     or (v_ip_hash is not null and char_length(v_ip_hash) > 128)
  then
    return jsonb_build_object('ok', false, 'code', 'INVALID');
  end if;

  -- Serializa las solicitudes del mismo correo: dos a la vez no se saltan el límite.
  perform pg_advisory_xact_lock(hashtext('business_plan_requests:' || v_email));

  select count(*) into v_recent
    from public.business_plan_requests r
   where r.created_at > now() - interval '1 hour'
     and (lower(r.email) = v_email or (v_ip_hash is not null and r.ip_hash = v_ip_hash));
  if v_recent >= 3 then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMIT');
  end if;

  insert into public.business_plan_requests (user_id, business_name, locations_count, phone, email, message, locale, ip_hash)
  values (auth.uid(), v_name, p_locations_count, v_phone, v_email, v_message, v_locale, v_ip_hash);

  -- TODO spec 4: encolar outbound_emails kind = 'business_plan_request' → SALES_EMAIL aquí.
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_business_plan_request(text, integer, text, text, text, text, text) from public;
grant execute on function public.submit_business_plan_request(text, integer, text, text, text, text, text) to anon, authenticated;
