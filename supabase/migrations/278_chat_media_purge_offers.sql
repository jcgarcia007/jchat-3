-- JChat 3.0 — Lote G (2026-11-28): borrado REAL de las fotos y notas de voz del chat, ofertas pausadas y cuentas de Stripe falsas.
-- NO aplicada: la aplica Juan por MCP («aplica 278»; nunca `supabase db push`). Reversión: supabase/rollbacks/278_chat_media_purge_offers_rollback.sql
-- Pruebas locales: supabase/scripts/test_278_local.sh · Función edge nueva: chat-media-purge (se despliega ANTES que esta migración).
-- Idempotente y no destructiva (CREATE OR REPLACE, IF NOT EXISTS, ON CONFLICT DO NOTHING); lo único que escribe datos es la parte C (final, señalada).
--
-- Problema (visto en producción el 2026-11-27):
--   · purge_expired_messages() (cron cada 15 min) borra las FILAS de messages de más de 24 h (salvo fijados y retenidos) pero su paso de Storage hace
--     `delete from storage.objects`, que Supabase bloquea: queda dentro de un bloque que captura el error y se salta siempre. Los archivos de las fotos
--     (bucket PÚBLICO post-media) y de las notas de voz (bucket privado voice-notes; la función ni los mira) se quedan para siempre.
--   · offers: `authenticated` solo puede hacer UPDATE de la columna `status`; el feed (megaphone_feed) filtra por `is_active`. «Pausar» no oculta la oferta.
--   · Dos locales tienen stripe_account_id = 'acct_STUB_…' (del alta antigua): el botón de conectar Stripe les falla.
--
-- Qué guarda la app (leído en el código el 2026-11-28; ver el informe del Lote G, A1.1):
--   · foto de sala:  messages.type = 'photo', messages.media_url = URL PÚBLICA …/storage/v1/object/public/post-media/{uid}/{ts}[-aleatorio].{jpg|jpeg|png}
--   · nota de voz:   messages.type = 'voice', messages.media_url = la RUTA   room/{room_id}/{uid}/{archivo}.m4a   en el bucket privado voice-notes
--   · post-media NO es solo del chat: las publicaciones del negocio del dashboard (web) viven en él con la ruta {uid}/business/{business_id}/{archivo}
--     (4 segmentos; referenciadas desde posts.media_urls). Las del chat tienen exactamente 2 segmentos. Solo se tocan las de 2 segmentos.
--
-- Qué hace:
--   A. Cola chat_media_purge_queue + purge_expired_messages() (cuerpo de producción SIN el paso de Storage que no funciona): en UNA sola sentencia borra las
--      filas y encola el archivo de cada fila borrada (mismas excepciones: fijados y retenidos ni se borran ni se encolan). Si el encolado falla, no se
--      borra nada. chat_media_purge_retry() (cron `chat-media-purge` cada 15 min; patrón de evidence_purge_retry de la 272: vault push_webhook_secret, 50 por
--      lote, backoff 10 min × 2^intentos con tope 6 h, 6 intentos) llama a la edge function chat-media-purge SOLO si hay filas que tocar.
--      chat_media_paths_in_use(): la edge function la consulta antes de borrar: nunca se borra un archivo que un mensaje, una publicación o un reporte en
--      hold siga referenciando.
--   A5. Lo acumulado: chat_media_backlog_preview() (solo cuenta) y chat_media_backlog_enqueue() (solo encola) para las fotos y voces de sala de más de 24 h
--      sin ninguna referencia. Planning la ejecuta a mano tras revisar la vista previa.
--   B. Ofertas: trigger BEFORE INSERT OR UPDATE OF status que mantiene is_active coherente con status. No se amplían los permisos de columna.
--   C. (datos) Las cuentas de Stripe falsas de los locales pasan a NULL.

-- ───────── A. Cola de borrado de archivos del chat ─────────
create table if not exists public.chat_media_purge_queue (
  id              uuid primary key default gen_random_uuid(),
  bucket          text not null,
  path            text not null,
  created_at      timestamptz not null default now(),
  attempts        integer not null default 0,
  last_attempt_at timestamptz,
  last_error      text,
  unique (bucket, path)
);
create index if not exists chat_media_purge_queue_attempt_idx on public.chat_media_purge_queue (attempts, last_attempt_at);
alter table public.chat_media_purge_queue enable row level security;  -- sin políticas: solo service_role
revoke all on public.chat_media_purge_queue from anon, authenticated;
grant select, insert, update, delete on public.chat_media_purge_queue to service_role;

-- El archivo de un mensaje de sala: (bucket, ruta) o ninguna fila. Solo las formas que sube la app: una foto con la URL pública de post-media y 2 segmentos
-- {uid}/{archivo}; una nota de voz con la ruta room/{room}/{uid}/{archivo}. Cualquier otra cosa (URL de otro bucket o de otro proyecto, ruta rara) no se encola.
create or replace function public.chat_message_media_object(p_type text, p_media_url text)
returns table (bucket text, path text)
language sql immutable set search_path = ''
as $$
  select 'post-media'::text, (regexp_match(p_media_url, '/storage/v1/object/public/post-media/([0-9a-fA-F-]{36}/[^/?#]+)$'))[1]
   where p_type = 'photo' and p_media_url ~ '/storage/v1/object/public/post-media/[0-9a-fA-F-]{36}/[^/?#]+$'
  union all
  select 'voice-notes'::text, p_media_url
   where p_type = 'voice' and p_media_url ~ '^room/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[^/?#]+$';
$$;
revoke all on function public.chat_message_media_object(text, text) from public, anon, authenticated;
grant execute on function public.chat_message_media_object(text, text) to service_role;

-- Rutas de `p_paths` que SIGUEN en uso y no deben borrarse: un mensaje (fijado o retenido) o una publicación que las referencia, o un reporte en hold
-- cuyo snapshot las contiene. La usa la edge function justo antes de borrar y el barrido de lo acumulado.
create or replace function public.chat_media_paths_in_use(p_bucket text, p_paths text[])
returns setof text
language sql stable security definer set search_path = public
as $$
  select distinct u.p
  from (
    select substring(m.media_url from '/post-media/(.+)$') as p
      from public.messages m where p_bucket = 'post-media' and m.media_url like '%/post-media/%'
    union all
    select substring(x from '/post-media/(.+)$')
      from public.posts po cross join lateral unnest(po.media_urls) x where p_bucket = 'post-media' and x like '%/post-media/%'
    union all
    select m.media_url from public.messages m where p_bucket = 'voice-notes' and m.media_url = any (p_paths)
    union all
    select p from unnest(p_paths) p
     where exists (select 1 from public.reports r
                    where r.snapshot is not null
                      and public.report_in_hold(r.status, r.reason, r.resolution, r.resolved_at, r.created_at)
                      and strpos(r.snapshot::text, p) > 0)
  ) u
  where u.p = any (p_paths);
$$;
revoke all on function public.chat_media_paths_in_use(text, text[]) from public, anon, authenticated;
grant execute on function public.chat_media_paths_in_use(text, text[]) to service_role;

-- purge_expired_messages: el cuerpo de producción (27-nov-2026) sin el paso 1 (delete from storage.objects, bloqueado por Supabase). El paso 2 sigue igual
-- (filas de más de 24 h, salvo fijados y retenidos; reply_to → SET NULL) y ahora, en la MISMA sentencia, encola el archivo de cada fila que borra.
create or replace function public.purge_expired_messages() returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_msg_count   int;
  v_media_count int;
begin
  -- Evidence hold: a message with a pending report, or a child-safety / sexual-content / NCMEC-escalated report younger than 365 days, is neither
  -- deleted nor queued (message_under_retention_hold). The files of the deleted rows go to chat_media_purge_queue; the edge function chat-media-purge
  -- removes them through the Storage API (cron chat-media-purge → chat_media_purge_retry()).
  with doomed as (
    delete from public.messages
     where created_at < now() - interval '24 hours'
       and id not in (select message_id from public.pinned_messages)
       and not public.message_under_retention_hold(id)
    returning type, media_url
  ), queued as (
    insert into public.chat_media_purge_queue (bucket, path)
    select o.bucket, o.path
      from doomed d cross join lateral public.chat_message_media_object(d.type, d.media_url) o
    on conflict (bucket, path) do nothing
    returning 1
  )
  select (select count(*) from doomed), (select count(*) from queued) into v_msg_count, v_media_count;

  raise log '[purge_expired_messages] deleted % messages, queued % media objects', v_msg_count, v_media_count;
end;
$$;

-- Reintento del borrado de archivos (patrón de evidence_purge_retry, 272): 50 por lote, backoff 10 min × 2^attempts (tope 6 h), 6 intentos.
-- La edge function chat-media-purge borra el objeto (API de Storage) y la fila de la cola; si falla deja last_error genérico. Sin filas que tocar no llama a nada.
create or replace function public.chat_media_purge_retry() returns integer
language plpgsql security definer set search_path = public, extensions
as $$
declare v_secret text; v_ids uuid[]; v_gave_up record;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_secret is null then return 0; end if;

  -- 6 intentos y sigue sin borrarse: queda en la cola (terminal) y se registra UNA vez
  for v_gave_up in
    select q.id, q.bucket from public.chat_media_purge_queue q
     where q.attempts >= 6
       and coalesce(q.last_attempt_at, q.created_at) < now() - interval '10 minutes'
       and not exists (select 1 from public.security_logs l where l.action = 'chat_media_purge_gave_up' and l.target_id = q.id)
  loop
    insert into public.security_logs (actor_id, action, target_type, target_id, detail)
    values (null, 'chat_media_purge_gave_up', 'chat_media_purge_queue', v_gave_up.id, v_gave_up.bucket);
  end loop;

  with picked as (
    select id from public.chat_media_purge_queue
     where attempts < 6
       and (last_attempt_at is null
            or last_attempt_at <= now() - least(interval '6 hours', interval '10 minutes' * power(2, attempts)))
     order by created_at
     limit 50
     for update skip locked
  ), bumped as (
    update public.chat_media_purge_queue q
       set attempts = q.attempts + 1, last_attempt_at = now()
      from picked where q.id = picked.id
    returning q.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from bumped;

  if cardinality(v_ids) = 0 then return 0; end if;
  perform net.http_post(
    url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/chat-media-purge',
    body := jsonb_build_object('ids', to_jsonb(v_ids)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 20000);
  return cardinality(v_ids);
end;
$$;
revoke all on function public.chat_media_purge_retry() from public, anon, authenticated;
grant execute on function public.chat_media_purge_retry() to service_role;

-- cron.schedule con un nombre existente actualiza ese job (pg_cron 1.6): idempotente sin cron.unschedule previo.
select cron.schedule('chat-media-purge', '*/15 * * * *', $$select public.chat_media_purge_retry()$$);

-- ───────── A5. Lo acumulado (barrido único; Planning lo ejecuta a mano) ─────────
-- Candidatos: objetos de voice-notes con la forma room/{room}/{uid}/{archivo} y de post-media con la forma {uid}/{archivo} (2 segmentos: lo del chat; las
-- publicaciones del negocio tienen 4) de más de 24 h y que NINGÚN mensaje, publicación o reporte en hold referencia. Lo que no encaje (otros buckets, otras
-- formas de ruta) no entra. Nada de esto borra: la vista previa cuenta y el barrido solo ENCOLA (la edge function borra por la API de Storage).
create or replace function public.chat_media_backlog_candidates()
returns table (bucket text, path text, created_at timestamptz, size_bytes bigint)
language sql stable security definer set search_path = public, storage
as $$
  with objs as (
    select o.bucket_id as b, o.name as n, o.created_at as c, coalesce((o.metadata ->> 'size')::bigint, 0) as s
      from storage.objects o
     where o.created_at < now() - interval '24 hours'
       and ((o.bucket_id = 'voice-notes' and o.name ~ '^room/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[^/]+$')
         or (o.bucket_id = 'post-media'  and o.name ~ '^[0-9a-fA-F-]{36}/[^/]+$'))
  ), used as (
    select 'voice-notes'::text as b, u as n
      from public.chat_media_paths_in_use('voice-notes', coalesce((select array_agg(n) from objs where b = 'voice-notes'), '{}')) u
    union all
    select 'post-media'::text, u
      from public.chat_media_paths_in_use('post-media', coalesce((select array_agg(n) from objs where b = 'post-media'), '{}')) u
  )
  select objs.b, objs.n, objs.c, objs.s
    from objs
   where not exists (select 1 from used where used.b = objs.b and used.n = objs.n);
$$;

-- Vista previa: SOLO cuenta (por bucket: objetos, el más antiguo, el más nuevo y el peso).
create or replace function public.chat_media_backlog_preview()
returns table (bucket text, objects bigint, oldest timestamptz, newest timestamptz, total_bytes bigint)
language sql stable security definer set search_path = public, storage
as $$
  select c.bucket, count(*), min(c.created_at), max(c.created_at), sum(c.size_bytes)::bigint
    from public.chat_media_backlog_candidates() c
   group by c.bucket
   order by c.bucket;
$$;

-- Barrido: ENCOLA los candidatos (la edge function los borra por tandas); devuelve cuántos se encolaron ahora.
create or replace function public.chat_media_backlog_enqueue() returns integer
language plpgsql security definer set search_path = public, storage
as $$
declare n integer;
begin
  insert into public.chat_media_purge_queue (bucket, path)
    select c.bucket, c.path from public.chat_media_backlog_candidates() c
  on conflict (bucket, path) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.chat_media_backlog_candidates() from public, anon, authenticated;
revoke all on function public.chat_media_backlog_preview() from public, anon, authenticated;
revoke all on function public.chat_media_backlog_enqueue() from public, anon, authenticated;
grant execute on function public.chat_media_backlog_candidates() to service_role;
grant execute on function public.chat_media_backlog_preview() to service_role;
grant execute on function public.chat_media_backlog_enqueue() to service_role;

-- ───────── B. Ofertas: is_active sigue a status ─────────
-- Valores de status que existen (web/app/dashboard/offers/page.tsx, OfferStatus): 'scheduled', 'active', 'paused', 'ended'.
--   active / scheduled → is_active = true  (una programada se queda en el feed porque el feed también filtra por start_at <= now(); si se dejara en false,
--                                            nadie la volvería a activar al llegar su hora)
--   paused / ended     → is_active = false (el feed deja de devolverla)
-- Cualquier otro valor no toca is_active. El trigger NO exige permiso sobre is_active: las columnas que el dueño puede escribir siguen siendo solo `status`.
create or replace function public.offers_sync_is_active() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status in ('paused', 'ended') then
    new.is_active := false;
  elsif new.status in ('active', 'scheduled') then
    new.is_active := true;
  end if;
  return new;
end;
$$;

create or replace trigger offers_sync_is_active
  before insert or update of status on public.offers
  for each row execute function public.offers_sync_is_active();

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- C. DATOS (única sentencia que escribe datos; Juan la autoriza al decir «aplica 278») — cuentas de Stripe falsas del alta antigua.
--    Hoy afecta a 2 filas. Esta parte NO se revierte con el rollback (el valor falso no se guarda en ningún sitio útil).
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
update public.businesses set stripe_account_id = null where stripe_account_id like 'acct\_STUB\_%';
