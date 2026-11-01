-- 254: Match v2 — sexo e interés para la coincidencia, reintentos de moderación sin corte, alerta de fotos atascadas y aviso al usuario.
-- BORRADOR. NO APLICADA. La aplica Juan Carlos por MCP (nunca db push). Comprobación después: supabase/scripts/254_check.sql (solo select).
-- Antes de aplicar: 251, 252 y 253 deben estar aplicadas, y hay que comparar las definiciones de producción de match_common_business,
-- match_photo_retry_moderation y dm_photo_retry_moderation con las del baseline 245 (este archivo las vuelve a crear con CREATE OR REPLACE a partir del baseline).
--
-- Qué hace
--  1. match_profiles (tabla aparte): sexo ('woman'|'man'|'nonbinary') e interés ('women'|'men'|'all') de cada persona. RLS: solo la propia fila.
--     NO están en public.users ni en ninguna vista (public_profiles tiene una lista explícita de columnas), ni en match_card: ningún otro usuario puede leerlos.
--     Al ser una tabla nueva no toca la allowlist de UPDATE de users. Se borra en cascada con la cuenta.
--  2. Coincidencia MUTUA: match_orientation_ok(a, b) y match_common_business (la puerta que usan el deck, el swipe, los perfiles, "los que pasé" y la
--     política match_photos_visible) la exigen. match_get_deck NO se reescribe: ya llama a match_common_business.
--     Reglas: "Todos" acepta a cualquiera; "No binario" solo encaja con quien eligió "Todos"; sin sexo o sin interés = perfil incompleto.
--  3. Transición: match_v2_flags.enforce_profile_from. Mientras sea NULL (estado al aplicar) quien no tiene datos es compatible con todos (nadie
--     desaparece del deck de golpe) y un desacuerdo CONOCIDO sí filtra. Cuando Juan ponga una fecha (update public.match_v2_flags set
--     enforce_profile_from = '…') y llegue, "sin datos" pasa a "no aparece".
--  4. photo_moderation_log: intentos, última vez, alerta y aviso por foto (kind 'match'|'dm'). Sin acceso para clientes.
--  5. Reintentos de Match y de DM sin límite de edad (antes: 2 días) con backoff: primer intento a los 5 min de subir la foto; después se espera
--     10 min × 2^(intentos hechos): 20, 40, 80, 160, 320 min, con tope de 6 h (el cron corre cada 10 min).
--  6. photo_moderation_alert() cada 5 min: foto sin moderar >10 min → fila en security_logs ('photo_moderation_stuck', se ve en /super-admin/alerts)
--     y UN push por administrador y pasada. Una sola alerta por foto (alerted_at). El push exige que send-push conozca el tipo 'admin_alert'.
--  7. match_photo_verdict_notify: al aprobar/rechazar una foto de Match, aviso al usuario (fila en notifications + push_dispatch). Una vez por foto; la
--     aprobación solo avisa si es la PRIMERA foto aprobada, el rechazo solo si no le queda ninguna aprobada. Exige que send-push conozca
--     'match_photo_approved' y 'match_photo_rejected'. No toca el trigger trg_push_on_notification_insert (llama a push_dispatch directamente).
--
-- No borra nada. Idempotente (create if not exists / create or replace / bloques DO).
--
-- REVERSIÓN (la aplica Juan Carlos solo si hay que deshacer; no pierde datos):
--   a) restaurar match_common_business, match_photo_retry_moderation y dm_photo_retry_moderation con sus cuerpos de 245_baseline.sql
--      (líneas 2786-2804, 3076-3098 y 1074-1095); con eso la coincidencia vuelve a ser la anterior y los reintentos vuelven al corte de 2 días;
--   b) drop trigger if exists trg_match_photo_verdict_notify on public.match_photos;  (destructivo: en un NNN_destructive.sql aparte)
--   c) select cron.unschedule('photo-moderation-alert');                              (idem)
--   d) las tablas match_profiles, match_v2_flags y photo_moderation_log y las funciones nuevas pueden quedarse sin uso.

-- ── 1. Sexo e interés (privados) ──────────────────────────────────────────────────────────────────────────────

create table if not exists public.match_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  gender text,
  seeking text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'match_profiles_gender_check' and conrelid = 'public.match_profiles'::regclass) then
    alter table public.match_profiles add constraint match_profiles_gender_check
      check (gender is null or gender in ('woman', 'man', 'nonbinary'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'match_profiles_seeking_check' and conrelid = 'public.match_profiles'::regclass) then
    alter table public.match_profiles add constraint match_profiles_seeking_check
      check (seeking is null or seeking in ('women', 'men', 'all'));
  end if;
end $$;

alter table public.match_profiles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'match_profiles' and policyname = 'match_profiles_own_select') then
    create policy match_profiles_own_select on public.match_profiles for select to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'match_profiles' and policyname = 'match_profiles_own_insert') then
    create policy match_profiles_own_insert on public.match_profiles for insert to authenticated with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'match_profiles' and policyname = 'match_profiles_own_update') then
    create policy match_profiles_own_update on public.match_profiles for update to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'match_profiles' and policyname = 'match_profiles_own_delete') then
    create policy match_profiles_own_delete on public.match_profiles for delete to authenticated using (user_id = (select auth.uid()));
  end if;
end $$;

revoke all on table public.match_profiles from anon, authenticated;
grant select, insert, update, delete on table public.match_profiles to authenticated;
grant all on table public.match_profiles to service_role;

create or replace trigger trg_match_profiles_updated_at before update on public.match_profiles
  for each row execute function public.set_updated_at();

comment on table public.match_profiles is 'Sexo e interés para la coincidencia de Match. PRIVADO: solo la propia fila (RLS); nunca en vistas ni tarjetas.';

-- ── 2. Transición: cuándo "sin datos" deja de ser compatible ─────────────────────────────────────────────────────

create table if not exists public.match_v2_flags (
  id boolean primary key default true check (id),
  enforce_profile_from timestamptz
);
insert into public.match_v2_flags (id) values (true) on conflict do nothing;
alter table public.match_v2_flags enable row level security;
revoke all on table public.match_v2_flags from anon, authenticated;
grant all on table public.match_v2_flags to service_role;

create or replace function public.match_profile_enforced()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select f.enforce_profile_from <= now() from public.match_v2_flags f where f.id), false);
$$;

-- ── 3. Coincidencia mutua ────────────────────────────────────────────────────────────────────────────────────────

-- true / false / null (null = no se puede saber: falta el dato de alguno de los dos).
create or replace function public.match_fits(p_seeking text, p_gender text)
returns boolean language sql immutable as $$
  select case
    when p_seeking is null or p_gender is null then null
    when p_seeking = 'all' then true
    when p_seeking = 'women' then p_gender = 'woman'
    when p_seeking = 'men' then p_gender = 'man'
    else false
  end;
$$;

create or replace function public.match_orientation_ok(p_a uuid, p_b uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  a public.match_profiles;
  b public.match_profiles;
  ab boolean;
  ba boolean;
begin
  select * into a from public.match_profiles where user_id = p_a;
  select * into b from public.match_profiles where user_id = p_b;
  ab := public.match_fits(a.seeking, b.gender);
  ba := public.match_fits(b.seeking, a.gender);
  if ab is false or ba is false then return false; end if;      -- un desacuerdo conocido siempre filtra
  if ab is true and ba is true then return true; end if;
  return not public.match_profile_enforced();                     -- falta algún dato: compatible solo mientras dure la transición
end;
$$;

-- Igual que el baseline 245 (2786-2804) más la última condición.
create or replace function public.match_common_business(p_viewer uuid, p_target uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select v.business_id
  from public.match_presence v
  join public.match_presence t on t.business_id = v.business_id and t.user_id = p_target
  where v.user_id = p_viewer and p_viewer <> p_target
    and v.active_since is not null and v.expires_at > now()
    and t.active_since is not null and t.expires_at > now()
    and exists (select 1 from public.game_optins o where o.user_id = p_viewer and o.business_id = v.business_id and o.game_key = 'match')
    and exists (select 1 from public.game_optins o where o.user_id = p_target and o.business_id = v.business_id and o.game_key = 'match')
    and public.match_enabled_for_business(v.business_id)
    and not exists (select 1 from public.match_kicks k where k.business_id = v.business_id and k.user_id in (p_viewer, p_target))
    and not public.is_blocked(p_viewer, p_target)
    and coalesce((select (u.settings->>'gamesEnabled')::boolean from public.users u where u.id = p_target), true)
    and public.match_orientation_ok(p_viewer, p_target)
  limit 1;
$$;

revoke all on function public.match_fits(text, text) from public;
revoke all on function public.match_orientation_ok(uuid, uuid) from public;
revoke all on function public.match_profile_enforced() from public;
grant execute on function public.match_fits(text, text) to authenticated, service_role;
grant execute on function public.match_orientation_ok(uuid, uuid) to authenticated, service_role;
grant execute on function public.match_profile_enforced() to authenticated, service_role;

-- ── 4. Registro de moderación (intentos, alerta, aviso) ──────────────────────────────────────────────────────────

create table if not exists public.photo_moderation_log (
  kind text not null check (kind in ('match', 'dm')),
  ref_id uuid not null,
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  alerted_at timestamptz,
  notified_at timestamptz,
  primary key (kind, ref_id)
);
alter table public.photo_moderation_log enable row level security;
revoke all on table public.photo_moderation_log from anon, authenticated;
grant all on table public.photo_moderation_log to service_role;

-- ── 5. Reintentos sin corte de edad, con backoff ─────────────────────────────────────────────────────────────────
-- Antes: solo fotos de entre 5 minutos y 2 días. Ahora: toda foto sin moderar a partir de los 5 minutos; tras N intentos hechos la espera es
-- 10 min × 2^N (20, 40, 80, 160, 320 min), con tope de 6 h. El cron sigue siendo cada 10 min (246_baseline_extras.sql).

create or replace function public.match_photo_retry_moderation()
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare r record; n int := 0; v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_secret is null then return 0; end if;
  for r in
    select p.id, p.path, p.user_id
      from public.match_photos p
      left join public.photo_moderation_log l on l.kind = 'match' and l.ref_id = p.id
     where p.status = 'pending' and p.moderated_at is null and not p.needs_review
       and p.created_at < now() - interval '5 minutes'
       and (l.last_attempt_at is null
            or l.last_attempt_at <= now() - least(interval '6 hours', interval '10 minutes' * power(2, least(coalesce(l.attempts, 0), 6))))
     order by p.created_at
     limit 50
  loop
    perform net.http_post(
      url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/moderate-match-photo',
      body := jsonb_build_object('photo_id', r.id, 'path', r.path, 'user_id', r.user_id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      timeout_milliseconds := 20000);
    insert into public.photo_moderation_log (kind, ref_id, attempts, last_attempt_at)
    values ('match', r.id, 1, now())
    on conflict (kind, ref_id) do update set attempts = public.photo_moderation_log.attempts + 1, last_attempt_at = now();
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.dm_photo_retry_moderation()
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare r record; n int := 0; v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_secret is null then return 0; end if;
  for r in
    select m.id
      from public.dm_messages m
      left join public.photo_moderation_log l on l.kind = 'dm' and l.ref_id = m.id
     where m.media_moderation = 'pending'
       and m.created_at < now() - interval '5 minutes'
       and (l.last_attempt_at is null
            or l.last_attempt_at <= now() - least(interval '6 hours', interval '10 minutes' * power(2, least(coalesce(l.attempts, 0), 6))))
     order by m.created_at
     limit 50
  loop
    perform net.http_post(
      url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/moderate-dm-photo',
      body := jsonb_build_object('message_id', r.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      timeout_milliseconds := 20000);
    insert into public.photo_moderation_log (kind, ref_id, attempts, last_attempt_at)
    values ('dm', r.id, 1, now())
    on conflict (kind, ref_id) do update set attempts = public.photo_moderation_log.attempts + 1, last_attempt_at = now();
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ── 6. Alerta al administrador: foto sin moderar más de 10 minutos ───────────────────────────────────────────────

create or replace function public.photo_moderation_alert()
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare r record; n int := 0; v_admin record;
begin
  for r in
    select 'match'::text as kind, p.id as ref_id, p.created_at, coalesce(l.attempts, 0) as attempts
      from public.match_photos p
      left join public.photo_moderation_log l on l.kind = 'match' and l.ref_id = p.id
     where p.status = 'pending' and p.moderated_at is null
       and p.created_at < now() - interval '10 minutes' and l.alerted_at is null
    union all
    select 'dm'::text, m.id, m.created_at, coalesce(l.attempts, 0)
      from public.dm_messages m
      left join public.photo_moderation_log l on l.kind = 'dm' and l.ref_id = m.id
     where m.media_moderation = 'pending' and m.media_url is not null
       and m.created_at < now() - interval '10 minutes' and l.alerted_at is null
    order by 3
    limit 200
  loop
    insert into public.photo_moderation_log (kind, ref_id, alerted_at) values (r.kind, r.ref_id, now())
    on conflict (kind, ref_id) do update set alerted_at = now() where public.photo_moderation_log.alerted_at is null;
    insert into public.security_logs (actor_id, action, target_type, target_id, detail)
    values (null, 'photo_moderation_stuck', case r.kind when 'match' then 'match_photo' else 'dm_message' end, r.ref_id,
            format('Photo pending moderation for more than 10 minutes (attempts: %s)', r.attempts));
    n := n + 1;
  end loop;

  -- Un solo push por administrador y pasada (no por foto). No crea fila en notifications: no ensucia la lista de la app.
  if n > 0 then
    for v_admin in
      select u.id from public.users u
       where u.role = 'super_admin' or exists (select 1 from public.admin_roles ar where ar.user_id = u.id)
    loop
      perform public.push_dispatch('notification', jsonb_build_object(
        'id', gen_random_uuid(), 'user_id', v_admin.id, 'type', 'admin_alert',
        'payload', jsonb_build_object('kind', 'photo_moderation', 'count', n), 'created_at', now()));
    end loop;
  end if;
  return n;
exception when others then
  raise warning 'photo_moderation_alert failed: %', sqlerrm;
  return 0;
end;
$$;

revoke all on function public.photo_moderation_alert() from public;
grant execute on function public.photo_moderation_alert() to service_role;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'photo-moderation-alert') then
    perform cron.schedule('photo-moderation-alert', '*/5 * * * *', 'select public.photo_moderation_alert()');
  end if;
end $$;

-- ── 7. Aviso al usuario cuando su foto de Match se aprueba o se rechaza ─────────────────────────────────────────

create or replace function public.match_photo_verdict_notify()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_first uuid; v_type text; v_biz uuid; v_name text; v_nid uuid; v_payload jsonb;
begin
  if old.status <> 'pending' or new.status not in ('approved', 'rejected') then return new; end if;

  -- Una sola vez por foto.
  insert into public.photo_moderation_log (kind, ref_id, notified_at) values ('match', new.id, now())
  on conflict (kind, ref_id) do update set notified_at = now() where public.photo_moderation_log.notified_at is null
  returning ref_id into v_first;
  if v_first is null then return new; end if;

  -- Aprobada: solo la primera (las siguientes no cambian nada). Rechazada: solo si no le queda ninguna aprobada.
  if exists (select 1 from public.match_photos p where p.user_id = new.user_id and p.status = 'approved' and p.id <> new.id) then
    return new;
  end if;
  v_type := case new.status when 'approved' then 'match_photo_approved' else 'match_photo_rejected' end;

  select mp.business_id, b.name into v_biz, v_name
    from public.match_presence mp join public.businesses b on b.id = mp.business_id
   where mp.user_id = new.user_id and mp.active_since is not null and mp.expires_at > now()
   order by mp.last_seen_at desc limit 1;

  v_payload := jsonb_build_object('photo_id', new.id, 'business_id', v_biz, 'business_name', v_name, 'present', v_biz is not null);
  insert into public.notifications (user_id, type, payload) values (new.user_id, v_type, v_payload) returning id into v_nid;
  perform public.push_dispatch('notification', jsonb_build_object(
    'id', v_nid, 'user_id', new.user_id, 'type', v_type, 'payload', v_payload, 'created_at', now()));
  return new;
exception when others then
  raise warning 'match_photo_verdict_notify failed: %', sqlerrm;   -- nunca bloquea la moderación
  return new;
end;
$$;

create or replace trigger trg_match_photo_verdict_notify
  after update of status on public.match_photos
  for each row when (old.status = 'pending' and new.status in ('approved', 'rejected'))
  execute function public.match_photo_verdict_notify();
