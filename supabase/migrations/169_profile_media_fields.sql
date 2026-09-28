-- 169_profile_media_fields.sql
-- Profile cover/city support. Planning applies this migration; do not apply it
-- from an application-development task.

alter table public.users
  add column if not exists cover_url text,
  add column if not exists city text;

alter table public.users
  drop constraint if exists users_city_length_check;

alter table public.users
  add constraint users_city_length_check
  check (city is null or char_length(city) <= 80);

-- public_profiles is intentionally a controlled SECURITY DEFINER view: the
-- users table is own-row-only, while this view exposes the public subset used
-- by social profiles. City is user-entered text; it is never GPS-derived.
drop view if exists public.public_profiles;

create view public.public_profiles as
  select
    id,
    username,
    display_name,
    avatar_url,
    cover_url,
    bio,
    city,
    profile_theme_id,
    is_verified,
    is_private,
    created_at
  from public.users;

grant select on public.public_profiles to anon, authenticated;
revoke insert, update, delete on public.public_profiles from anon, authenticated;
revoke references, trigger, truncate on public.public_profiles from anon, authenticated;

-- Storage remove requires SELECT as well as DELETE. Keep profile-media
-- non-listable to the public, but let an authenticated owner select objects in
-- their own `{uid}/...` folder so deleting a post can remove its files.
drop policy if exists "storage: owner read own profile-media" on storage.objects;
create policy "storage: owner read own profile-media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
