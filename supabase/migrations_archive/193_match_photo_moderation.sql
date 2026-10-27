-- 193: JChat Match — moderación automática de fotos (Google Cloud Vision vía Edge Function) + revisión manual del superadmin.
-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-03). Este archivo solo la versiona.

-- 1) Resultado de la moderación
alter table public.match_photos
  add column if not exists needs_review boolean not null default false,
  add column if not exists moderation jsonb,
  add column if not exists moderated_at timestamptz;
create index if not exists match_photos_review_idx on public.match_photos (created_at) where status = 'pending';

-- 2) El cliente no puede tocar los campos de moderación (solo service_role / superadmin vía RPC)
create or replace function public.match_photos_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not coalesce(current_setting('app.match_admin_review', true), '') = 'on'
     and (new.status is distinct from old.status or new.reviewed_at is distinct from old.reviewed_at
          or new.rejection_reason is distinct from old.rejection_reason or new.user_id <> old.user_id or new.path <> old.path
          or new.needs_review is distinct from old.needs_review or new.moderation is distinct from old.moderation
          or new.moderated_at is distinct from old.moderated_at) then
    raise exception 'match_photo_fields_readonly' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 3) Al insertar una foto → llamar a la Edge Function de moderación (mismo patrón y secreto que push_dispatch)
create or replace function public.match_photo_dispatch_moderation()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_secret is null then return new; end if;
  perform net.http_post(
    url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/moderate-match-photo',
    body := jsonb_build_object('photo_id', new.id, 'path', new.path, 'user_id', new.user_id),
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', v_secret),
    timeout_milliseconds := 20000
  );
  return new;
exception when others then
  raise warning 'match_photo_dispatch_moderation failed: %', sqlerrm;  -- la foto queda pendiente; el reintento lo hace el cron
  return new;
end;
$$;
drop trigger if exists trg_match_photo_moderation on public.match_photos;
create trigger trg_match_photo_moderation after insert on public.match_photos for each row execute function public.match_photo_dispatch_moderation();

-- 4) Reintento: fotos pendientes sin resultado tras 5 min (p. ej. falló la llamada) → se vuelven a enviar (cron cada 10 min)
create or replace function public.match_photo_retry_moderation()
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare r record; n int := 0; v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret' limit 1;
  if v_secret is null then return 0; end if;
  for r in select id, path, user_id from public.match_photos
           where status = 'pending' and moderated_at is null and not needs_review
             and created_at < now() - interval '5 minutes' and created_at > now() - interval '2 days'
           limit 50 loop
    perform net.http_post(
      url := 'https://klfsgcfoahdtkojyqspd.supabase.co/functions/v1/moderate-match-photo',
      body := jsonb_build_object('photo_id', r.id, 'path', r.path, 'user_id', r.user_id),
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', v_secret),
      timeout_milliseconds := 20000);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.match_photo_retry_moderation() from public, anon, authenticated;
select cron.unschedule('match-photo-retry-moderation') where exists (select 1 from cron.job where jobname = 'match-photo-retry-moderation');
select cron.schedule('match-photo-retry-moderation', '*/10 * * * *', $$select public.match_photo_retry_moderation()$$);

-- 5) Revisión manual del superadmin (cola: status pending con needs_review = true)
create or replace function public.admin_list_match_photos_for_review(p_limit integer default 50)
returns table (id uuid, user_id uuid, path text, moderation jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return query select p.id, p.user_id, p.path, p.moderation, p.created_at
  from public.match_photos p where p.status = 'pending' and p.needs_review
  order by p.created_at limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;
create or replace function public.admin_review_match_photo(p_photo_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  perform set_config('app.match_admin_review', 'on', true);
  update public.match_photos
  set status = case when p_approve then 'approved' else 'rejected' end,
      needs_review = false,
      rejection_reason = case when p_approve then null else coalesce(left(p_reason, 200), 'admin_rejected') end,
      reviewed_at = now()
  where id = p_photo_id;
end;
$$;
revoke all on function public.admin_list_match_photos_for_review(integer) from public, anon;
revoke all on function public.admin_review_match_photo(uuid, boolean, text) from public, anon;
grant execute on function public.admin_list_match_photos_for_review(integer), public.admin_review_match_photo(uuid, boolean, text) to authenticated;

-- El superadmin necesita ver la imagen pendiente para revisarla
drop policy if exists match_photos_storage_admin on storage.objects;
create policy match_photos_storage_admin on storage.objects for select to authenticated
  using (bucket_id = 'match-photos' and public.is_platform_admin());
