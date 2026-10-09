-- 214 (PROPUESTA — NO APLICADA): moderación de fotos de DM — se difuminan, no se bloquea el envío (Lote D2-D).
-- Implementa docs/proposals/dm-photo-blur.md. Requiere la 212 aplicada (usa reports.priority / snapshot).
--
-- Qué hace
--   1. dm_messages.media_moderation ('pending'|'clear'|'blurred'|'rejected'; NULL = mensaje sin foto) y media_moderated_at.
--   2. BEFORE INSERT: si hay media_url nace 'pending' (el cliente no decide su propio estado).
--   3. BEFORE UPDATE (patrón 193): un cliente no puede cambiar media_moderation / media_moderated_at / media_url;
--      solo service_role (la Edge Function moderate-dm-photo) o el RPC de abajo.
--   4. AFTER INSERT con foto → pg_net → Edge Function moderate-dm-photo (mismo secreto x-push-secret que moderate-match-photo).
--   5. Reintento: pendientes de más de 5 min (y menos de 2 días) se reenvían cada 10 min (pg_cron).
--   6. RPC dm_photo_set_verdict(message_id, status, scores) — solo service_role: fija el veredicto una sola vez y, si es
--      'rejected', crea un reporte URGENTE (content_type 'dm_message', reason 'sexual_content', reporter NULL = sistema,
--      snapshot SIN ninguna URL) y deja registro en security_logs. El reporte urgente dispara el correo de safety-alert (212).
--   7. reports.reporter_id pasa a admitir NULL (reportes automáticos del sistema). Planning: revisar este cambio de esquema.
--
-- Veredicto (supabase/functions/_shared/safesearch.ts → decideDmPhoto):
--   adult VERY_LIKELY → rejected · adult LIKELY/POSSIBLE, racy LIKELY+, violence LIKELY+ → blurred · resto → clear.
--
-- Como probarlo (después de aplicar y desplegar moderate-dm-photo, con dos cuentas de prueba y una conversación entre ellas):
--   1) La cuenta A envía una foto normal por DM → select media_moderation from dm_messages order by created_at desc limit 1;
--      empieza 'pending' y en segundos pasa a 'clear'.
--   2) update dm_messages set media_moderation = 'clear' where id = '<id>';  como usuario autenticado → ERROR dm_media_fields_readonly.
--   3) Con service_role: select public.dm_photo_set_verdict('<id de un mensaje con foto en pending>', 'rejected', '{"adult":"VERY_LIKELY"}');
--      → crea 1 reporte urgente (select * from reports where content_type='dm_message' order by created_at desc limit 1)
--      y 1 fila en security_logs ('dm_photo_rejected'). Llamarlo otra vez no duplica nada.
--   4) select public.dm_photo_retry_moderation();  → devuelve cuántas pendientes antiguas reenvió.
-- Limite conocido: el cliente oculta lo 'rejected', pero un cliente modificado que pida la URL firmada de dm-media aún
--   podría verla (las políticas de storage de dm-media no miran media_moderation). Endurecerlo es un paso aparte.
--
-- Rollback:
--   select cron.unschedule('dm-photo-retry-moderation');
--   drop function public.dm_photo_retry_moderation(); drop function public.dm_photo_set_verdict(uuid, text, jsonb);
--   drop trigger trg_dm_photo_moderation on public.dm_messages; drop function public.dm_photo_dispatch_moderation();
--   drop trigger trg_dm_media_guard on public.dm_messages; drop function public.dm_messages_media_guard();
--   drop trigger trg_dm_media_init on public.dm_messages; drop function public.dm_messages_media_init();
--   alter table public.dm_messages drop column media_moderated_at, drop column media_moderation;
--   (opcional) alter table public.reports alter column reporter_id set not null;  -- solo si no quedan reportes del sistema

-- 1. Columnas
alter table public.dm_messages
  add column if not exists media_moderation text,
  add column if not exists media_moderated_at timestamptz;
alter table public.dm_messages drop constraint if exists dm_messages_media_moderation_chk;
alter table public.dm_messages add constraint dm_messages_media_moderation_chk
  check (media_moderation is null or media_moderation in ('pending', 'clear', 'blurred', 'rejected'));
create index if not exists dm_messages_media_pending_idx on public.dm_messages (created_at) where media_moderation = 'pending';

-- 7. Reportes automáticos del sistema (sin persona que reporta)
alter table public.reports alter column reporter_id drop not null;

-- 2. Estado inicial decidido por el servidor
create or replace function public.dm_messages_media_init()
returns trigger language plpgsql set search_path = public as $$
begin
  new.media_moderation := case when new.media_url is not null then 'pending' else null end;
  new.media_moderated_at := null;
  return new;
end;
$$;
drop trigger if exists trg_dm_media_init on public.dm_messages;
create trigger trg_dm_media_init before insert on public.dm_messages
  for each row execute function public.dm_messages_media_init();

-- 3. El cliente no toca los campos de moderación (auth.uid() es NULL para service_role / funciones del servidor)
create or replace function public.dm_messages_media_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null
     and (new.media_moderation is distinct from old.media_moderation
          or new.media_moderated_at is distinct from old.media_moderated_at
          or new.media_url is distinct from old.media_url) then
    raise exception 'dm_media_fields_readonly' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_dm_media_guard on public.dm_messages;
create trigger trg_dm_media_guard before update on public.dm_messages
  for each row execute function public.dm_messages_media_guard();

-- 4. Al insertar una foto → Edge Function de moderación (mismo patrón y secreto que 193)
create or replace function public.dm_photo_dispatch_moderation()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_secret is null then return new; end if;
  perform net.http_post(
    url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/moderate-dm-photo',
    body := jsonb_build_object('message_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 20000);
  return new;
exception when others then
  raise warning 'dm_photo_dispatch_moderation failed: %', sqlerrm;  -- la foto queda 'pending'; el cron la reenvía
  return new;
end;
$$;
drop trigger if exists trg_dm_photo_moderation on public.dm_messages;
create trigger trg_dm_photo_moderation after insert on public.dm_messages
  for each row when (new.media_url is not null) execute function public.dm_photo_dispatch_moderation();

-- 5. Reintento de pendientes (cada 10 min)
create or replace function public.dm_photo_retry_moderation()
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare r record; n int := 0; v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_secret is null then return 0; end if;
  for r in select id from public.dm_messages
           where media_moderation = 'pending' and created_at < now() - interval '5 minutes' and created_at > now() - interval '2 days'
           limit 50 loop
    perform net.http_post(
      url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/moderate-dm-photo',
      body := jsonb_build_object('message_id', r.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      timeout_milliseconds := 20000);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.dm_photo_retry_moderation() from public, anon, authenticated;
select cron.unschedule('dm-photo-retry-moderation') where exists (select 1 from cron.job where jobname = 'dm-photo-retry-moderation');
select cron.schedule('dm-photo-retry-moderation', '*/10 * * * *', $$select public.dm_photo_retry_moderation()$$);

-- 6. Veredicto (solo service_role). Idempotente: solo actúa sobre un mensaje todavía 'pending'.
create or replace function public.dm_photo_set_verdict(p_message_id uuid, p_status text, p_scores jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_sender uuid; v_conv uuid; v_created timestamptz;
begin
  if p_status not in ('clear', 'blurred', 'rejected') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.dm_messages
     set media_moderation = p_status, media_moderated_at = now()
   where id = p_message_id and media_moderation = 'pending'
   returning sender_id, conversation_id, created_at into v_sender, v_conv, v_created;
  if not found then return; end if;

  if p_status = 'rejected' then
    insert into public.reports (reporter_id, reported_user_id, content_type, content_id, reason, details, snapshot, priority, status)
    values (null, v_sender, 'dm_message', p_message_id, 'sexual_content',
            'Automatic report: explicit photo detected in a direct message.',
            jsonb_build_object('conversation_id', v_conv, 'created_at', v_created,
                               'media', 'dm-media (private bucket; no public URL is stored here)', 'scores', p_scores),
            'urgent', 'pending');
    insert into public.security_logs (actor_id, action, target_type, target_id, detail)
    values (null, 'dm_photo_rejected', 'dm_message', p_message_id, 'SafeSearch: explicit adult content');
  end if;
end;
$$;
revoke all on function public.dm_photo_set_verdict(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.dm_photo_set_verdict(uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
