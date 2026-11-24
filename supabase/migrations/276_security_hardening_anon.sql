-- 276: endurecimiento de privilegios del rol anon y de las tablas que el cliente no debe tocar (S-01, S-02, S-03, S-04, S-06, H-108). NO APLICADA (la aplica Planning/Juan Carlos por MCP).
-- Reversión: supabase/rollbacks/276_security_hardening_anon_rollback.sql · Prueba local: bash supabase/scripts/test_276_local.sh
--
-- Idempotente y no destructiva: solo REVOKE, ALTER DEFAULT PRIVILEGES, ALTER FUNCTION y CREATE OR REPLACE. No borra nada.
-- ORDEN DE DESPLIEGUE: esta migración y el despliegue de la web (ruta /api/business-plan-request, que ahora llama a submit_business_plan_request_server)
-- van juntos. Entre una y otra, solo falla el formulario del plan Custom de /pricing/business (responde error; no se pierde nada más).
--
-- 1. S-01  public_profiles: anon ya no la lee. Las lecturas de la web (MenuPageClient:1884) y de la app van con sesión (auth.getUser() / authenticated).
-- 2. S-02  submit_business_plan_request aceptaba cualquier p_ip_hash que mandara el llamador (quien llama directo a la RPC se salta el límite por IP
--          cambiando el valor) y cualquiera con la clave anon podía llamarla. Ahora la única llamante legítima es la ruta de servidor de la web
--          (/api/business-plan-request: verifica el CAPTCHA en servidor, calcula el hash con la IP que pone Vercel y usa service_role):
--            · nueva public.submit_business_plan_request_server(…, p_ip_hash, p_user_id): igual que la 269 pero el usuario viene por parámetro (service_role
--              no tiene auth.uid()) y con un tope GLOBAL de 30 solicitudes por hora (RATE_LIMIT) además de 3/h por correo y por ip_hash;
--            · la RPC original (misma firma, por si algo la nombra) queda solo para service_role: se le quita el EXECUTE a PUBLIC, anon y authenticated.
-- 3. H-108 Los privilegios por defecto daban EXECUTE a anon (y a PUBLIC, implícito) en TODA función nueva del esquema public. Desde ahora una función nueva
--          de postgres no es ejecutable por anon ni por PUBLIC: cada función que deba llamarse sin sesión necesita su `grant execute … to anon` explícito
--          en la misma migración. authenticated y service_role conservan su privilegio por defecto. LÍMITE: solo cubre funciones creadas por el rol
--          postgres (las migraciones por MCP / SQL Editor); las que cree supabase_admin (extensiones) tienen sus propios privilegios por defecto.
-- 4. S-06  · auth_user_ban_check() y auth_user_ban_fingerprint() son funciones de disparador (triggers sobre auth.users): nadie tiene que llamarlas por
--            API. Postgres no comprueba EXECUTE al disparar un trigger, así que el alta/baja de cuentas no cambia.
--          · match_fits: su cuerpo no nombra ningún objeto (solo CASE y comparaciones de texto) → search_path = '' es seguro.
--          · anon ya no tiene INSERT / UPDATE / DELETE / TRUNCATE en ninguna tabla de public (RLS solo deja a anon las políticas deny_all; las demás exigen auth.uid()),
--            y las tablas futuras tampoco se los dan.
-- 5. S-03  authenticated ya no puede DELETE en businesses (la política "businesses: owner delete" existía): el cierre de un negocio va por la Edge Function
--          delete-account / ownerClose con service_role. Ningún cliente (web, móvil, funciones) borra negocios con la sesión del usuario.
-- 6. S-04  authenticated y anon ya no pueden INSERT en trials (la política "trials: owner insert" dejaba a un dueño fabricarse una prueba gratuita). Nada del
--          cliente inserta ahí; la tabla sigue existiendo y se sigue leyendo.
--
--          · también MAINTAIN (PG17) sobre las tablas y por defecto (la base de producción y la local son PG17: el baseline ya lo concede).
-- La función _server conserva lo que hace la de producción tras el insert (correo a ventas@ + entrega inmediata), ver el comentario dentro.

-- 1 · S-01
revoke select on public.public_profiles from anon;

-- 2 · S-02
create or replace function public.submit_business_plan_request_server(
  p_business_name   text,
  p_locations_count integer,
  p_phone           text,
  p_email           text,
  p_message         text,
  p_locale          text,
  p_ip_hash         text default null,
  p_user_id         uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name    text := btrim(coalesce(p_business_name, ''));
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_phone   text := nullif(btrim(coalesce(p_phone, '')), '');
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_locale  text := case when p_locale in ('es', 'en') then p_locale else null end;
  v_ip_hash text := nullif(btrim(coalesce(p_ip_hash, '')), '');
  v_recent  integer;
  v_total   integer;
  v_req_id  uuid;
  v_created timestamptz;
  v_mail_id uuid;
  v_secret  text;
  -- Destino de las solicitudes del plan Custom (alias de ImprovMX → Juan). Igual que en producción (272 de la web): cambiarlo en los dos sitios.
  v_sales_email constant text := 'ventas@jchat.cloud';
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

  -- Serializa TODAS las solicitudes (son pocas): ni dos del mismo correo ni dos cualesquiera a la vez se saltan los límites.
  perform pg_advisory_xact_lock(hashtext('business_plan_requests'));

  select count(*) into v_total from public.business_plan_requests r where r.created_at > now() - interval '1 hour';
  if v_total >= 30 then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMIT');
  end if;

  select count(*) into v_recent
    from public.business_plan_requests r
   where r.created_at > now() - interval '1 hour'
     and (lower(r.email) = v_email or (v_ip_hash is not null and r.ip_hash = v_ip_hash));
  if v_recent >= 3 then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMIT');
  end if;

  insert into public.business_plan_requests (user_id, business_name, locations_count, phone, email, message, locale, ip_hash)
  values (p_user_id, v_name, p_locations_count, v_phone, v_email, v_message, v_locale, v_ip_hash)
  returning id, created_at into v_req_id, v_created;

  -- Correo a ventas@ (best-effort): en su propio subbloque, para que un fallo aquí no deshaga ni pierda la solicitud de arriba.
  -- (Tramo copiado tal cual del cuerpo de submit_business_plan_request de la 272 de la web; solo cambian los nombres, ahora calificados por search_path = '').
  begin
    insert into public.outbound_emails (kind, to_email, reply_to, payload)
    values ('business_plan_request', v_sales_email, v_email,
            jsonb_build_object('business_name', v_name, 'locations_count', p_locations_count, 'phone', v_phone, 'email', v_email,
                               'message', v_message, 'locale', v_locale, 'request_id', v_req_id, 'created_at', v_created))
    returning id into v_mail_id;
  exception when others then
    raise warning 'submit_business_plan_request_server: could not queue the sales email for request %: %', v_req_id, sqlerrm;
    v_mail_id := null;
  end;

  -- Entrega inmediata: el mismo disparo que outbound_emails_retry() (266), pero solo con este id. Si falla o no hay secreto, lo recoge el cron.
  if v_mail_id is not null then
    begin
      select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
      if v_secret is not null then
        perform net.http_post(
          url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/outbound-emails',
          body := jsonb_build_object('ids', jsonb_build_array(v_mail_id)),
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
          timeout_milliseconds := 20000);
      end if;
    exception when others then
      raise warning 'submit_business_plan_request_server: immediate delivery trigger failed for email %: %', v_mail_id, sqlerrm;
    end;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_business_plan_request_server(text, integer, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.submit_business_plan_request_server(text, integer, text, text, text, text, text, uuid) to service_role;

revoke all on function public.submit_business_plan_request(text, integer, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_business_plan_request(text, integer, text, text, text, text, text) to service_role;

-- 3 · H-108 (desde ahora toda función nueva necesita su `grant execute` explícito; sin él, solo authenticated y service_role la ejecutan)
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres revoke execute on functions from public;

-- 4 · S-06
revoke execute on function public.auth_user_ban_check() from public, anon, authenticated;
revoke execute on function public.auth_user_ban_fingerprint() from public, anon, authenticated;

alter function public.match_fits(text, text) set search_path = '';

revoke insert, update, delete, truncate on all tables in schema public from anon;
alter default privileges for role postgres in schema public revoke insert, update, delete, truncate on tables from anon;

-- MAINTAIN (PG17: VACUUM, ANALYZE, REINDEX, LOCK TABLE…) tampoco lo necesita anon
revoke maintain on all tables in schema public from anon;
alter default privileges for role postgres in schema public revoke maintain on tables from anon;

-- 5 · S-03
revoke delete on public.businesses from authenticated;

-- 6 · S-04
revoke insert on public.trials from authenticated, anon;
