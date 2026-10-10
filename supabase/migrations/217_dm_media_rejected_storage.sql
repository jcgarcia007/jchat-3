-- Versionada tal cual está en producción (supabase_migrations.schema_migrations, versión 20261010005126). APLICADA 2026-10-10.
-- 217: una foto de DM 'rejected' u oculta por moderación no se puede descargar ni firmar desde el cliente.
-- Excepciones: quien la subió (carpeta [2] = su uid), admins de plataforma y service_role (Edge Functions; RLS no aplica).
-- La función es security definer para no depender de las políticas de dm_messages (la fila oculta es invisible al receptor).
-- Rollback (SQL Editor): drop policy "dm_media: block rejected" on storage.objects; drop function public.dm_media_is_blocked(text);
--   drop index public.dm_messages_media_url_idx;

create index if not exists dm_messages_media_url_idx on public.dm_messages (media_url) where media_url is not null;

create or replace function public.dm_media_is_blocked(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.dm_messages d
     where d.media_url = p_name
       and (d.media_moderation = 'rejected' or d.hidden_at is not null)
  );
$$;
revoke all on function public.dm_media_is_blocked(text) from public, anon;
grant execute on function public.dm_media_is_blocked(text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'dm_media: block rejected') then
    create policy "dm_media: block rejected" on storage.objects as restrictive for select to authenticated
      using (
        bucket_id <> 'dm-media'
        or (storage.foldername(name))[2] = (select auth.uid())::text
        or public.is_platform_admin()
        or not public.dm_media_is_blocked(name)
      );
  end if;
end $$;
