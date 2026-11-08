-- 272: la cola de correos (public.outbound_emails, mig. 265/266) acepta correos de suscripción y a ventas@. NO APLICADA (la aplica Planning por MCP).
--
-- Qué cambia
--   1. outbound_emails_kind_chk admite 'subscription_started', 'trial_will_end' y 'business_plan_request' además de
--      'reservation_cancelled_business_closed'. (Cambiar un CHECK exige quitar el viejo: es la única operación de este tipo y va en un bloque DO que solo
--      actúa si la definición actual aún no incluye 'subscription_started'; el conjunto nuevo es superconjunto del viejo, así que ninguna fila queda inválida.)
--   2. Columnas nuevas: to_email (destinatario externo cuando user_id es null), reply_to y dedupe_key (un correo por evento).
--   3. Destinatario obligatorio al INSERTAR: un trigger BEFORE INSERT exige user_id o to_email. (Ver "Desviación" más abajo: no es un CHECK de tabla.)
--   4. Índice único outbound_emails_dedupe_key_uq sobre dedupe_key. (Ver "Desviación": no es parcial.)
--   5. submit_business_plan_request (mig. 269) encola en la MISMA transacción un correo kind='business_plan_request' a ventas@jchat.cloud con
--      Reply-To = el correo del solicitante, y pide su entrega inmediata (ver "Entrega inmediata"). El correo es best-effort: si falla el encolado o el
--      disparo, la solicitud NO se pierde (se captura la excepción, raise warning, y se devuelve {ok:true}); queda en business_plan_requests y Juan la ve por SQL.
--
-- Entrega inmediata (cómo dispara hoy la 265/266): owner_close_business() NO dispara nada; devuelve los ids de los correos y la Edge Function que la llama
--   (delete-account) invoca outbound-emails en línea con esos ids. El cron 'outbound-emails-retry' (266, cada 10 min) solo recoge filas creadas hace más
--   de 10 minutos. outbound_emails_retry() es SECURITY DEFINER (corre como el dueño de la función) y lee vault.decrypted_secrets 'push_webhook_secret' y llama
--   a net.http_post: esta RPC, también SECURITY DEFINER, replica ese mismo disparo con {ids:[<id del correo>]} justo tras encolar. net.http_post es asíncrono (se
--   envía al confirmarse la transacción), así que la Edge Function ya ve la fila. Si no hay secreto en el vault, o el disparo falla, queda para el cron (≤ 10-20 min).
--
-- Desviaciones de la instrucción del spec (mínimas; revisar):
--   · "Check: user_id is not null or to_email is not null" se implementa como TRIGGER BEFORE INSERT, no como CHECK de tabla. Motivo: user_id es
--     "references auth.users on delete set null" (265). Con un CHECK, borrar la cuenta de un cliente que tiene un correo en la cola (p. ej. el de reservas)
--     intentaría poner user_id = null con to_email = null y fallaría, rompiendo el borrado de cuenta. El trigger solo vigila las filas nuevas.
--   · El índice único de dedupe_key NO es parcial ("where dedupe_key is not null"): en Postgres los NULL son distintos en un índice único, así que el
--     comportamiento es el mismo, y sin predicado `on conflict (dedupe_key) do nothing` (y PostgREST .upsert({ onConflict: 'dedupe_key', ignoreDuplicates: true }),
--     que no puede escribir el WHERE) puede inferirlo. Con el índice parcial E3 tendría que hacer un select previo, con una ventana de carrera.
--
-- Idempotente: create/alter ... if not exists, create or replace, y el bloque DO del CHECK. Sin DELETE ni TRUNCATE.
-- Rollback (solo si hiciera falta; en el SQL Editor):
--   -- volver a la RPC de la 269 (create or replace con el cuerpo de 269_business_plan_requests.sql);
--   -- drop trigger if exists trg_outbound_emails_require_recipient on public.outbound_emails; drop function if exists public.outbound_emails_require_recipient();
--   -- drop index if exists public.outbound_emails_dedupe_key_uq;
--   -- (las columnas to_email, reply_to y dedupe_key pueden quedarse sin uso; el CHECK ampliado es compatible con los datos viejos)
-- Verificación: supabase/scripts/272_check.sql (solo lectura).

-- ───────── 1. CHECK de kind ─────────
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.outbound_emails'::regclass and conname = 'outbound_emails_kind_chk'
       and pg_get_constraintdef(oid) not like '%subscription_started%'
  ) then
    alter table public.outbound_emails drop constraint outbound_emails_kind_chk;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.outbound_emails'::regclass and conname = 'outbound_emails_kind_chk') then
    alter table public.outbound_emails
      add constraint outbound_emails_kind_chk
      check (kind in ('reservation_cancelled_business_closed', 'subscription_started', 'trial_will_end', 'business_plan_request'));
  end if;
end $$;

-- ───────── 2. Columnas ─────────
alter table public.outbound_emails add column if not exists to_email text;
alter table public.outbound_emails add column if not exists reply_to text;
alter table public.outbound_emails add column if not exists dedupe_key text;

-- ───────── 3. Destinatario obligatorio (solo al insertar) ─────────
create or replace function public.outbound_emails_require_recipient() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is null and new.to_email is null then
    raise exception 'outbound_emails: user_id or to_email is required' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace trigger trg_outbound_emails_require_recipient
  before insert on public.outbound_emails
  for each row execute function public.outbound_emails_require_recipient();

-- ───────── 4. Un correo por evento ─────────
create unique index if not exists outbound_emails_dedupe_key_uq on public.outbound_emails (dedupe_key);

-- ───────── 5. submit_business_plan_request: encola el correo a ventas@ ─────────
-- Mismo cuerpo y misma firma que en la 269 (validación, límite de 3 por hora, insert); se añade el encolado tras el insert.
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
set search_path = public, extensions
as $$
declare
  -- Destino de las solicitudes del plan Custom (decisión de Juan, 2026-11-07): alias de ImprovMX que reenvía a Juan. Cambiarlo aquí si cambia el alias.
  v_sales_email constant text := 'ventas@jchat.cloud';
  v_name    text := btrim(coalesce(p_business_name, ''));
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_phone   text := nullif(btrim(coalesce(p_phone, '')), '');
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_locale  text := case when p_locale in ('es', 'en') then p_locale else null end;
  v_ip_hash text := nullif(btrim(coalesce(p_ip_hash, '')), '');
  v_recent  integer;
  v_req_id  uuid;
  v_created timestamptz;
  v_mail_id uuid;
  v_secret  text;
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
  values (auth.uid(), v_name, p_locations_count, v_phone, v_email, v_message, v_locale, v_ip_hash)
  returning id, created_at into v_req_id, v_created;

  -- Correo a ventas@ (best-effort): en su propio subbloque, para que un fallo aquí no deshaga ni pierda la solicitud de arriba.
  begin
    insert into public.outbound_emails (kind, to_email, reply_to, payload)
    values ('business_plan_request', v_sales_email, v_email,
            jsonb_build_object('business_name', v_name, 'locations_count', p_locations_count, 'phone', v_phone, 'email', v_email,
                               'message', v_message, 'locale', v_locale, 'request_id', v_req_id, 'created_at', v_created))
    returning id into v_mail_id;
  exception when others then
    raise warning 'submit_business_plan_request: could not queue the sales email for request %: %', v_req_id, sqlerrm;
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
      raise warning 'submit_business_plan_request: immediate delivery trigger failed for email %: %', v_mail_id, sqlerrm;
    end;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_business_plan_request(text, integer, text, text, text, text, text) from public;
grant execute on function public.submit_business_plan_request(text, integer, text, text, text, text, text) to anon, authenticated;
