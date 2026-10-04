-- 190: JChat Match — perfil: intereses, fotos con moderación, bucket privado, visibilidad entre presentes.
-- APLICADA EN PRODUCCIÓN POR PLANNING (2026-10-03). Este archivo solo la versiona.

-- 1) Intereses (catálogo es/en) y por usuario
create table if not exists public.interests (
  key text primary key,
  name_es text not null,
  name_en text not null,
  is_active boolean not null default true,
  sort integer not null default 0
);
alter table public.interests enable row level security;
drop policy if exists interests_read on public.interests;
create policy interests_read on public.interests for select to authenticated using (true);
insert into public.interests (key, name_es, name_en, sort) values
 ('travel','Viajes','Travel',1),('music','Música','Music',2),('gym','Gym','Gym',3),('movies','Cine','Movies',4),
 ('coffee','Café','Coffee',5),('sports','Deportes','Sports',6),('books','Libros','Books',7),('pets','Mascotas','Pets',8),
 ('cooking','Cocina','Cooking',9),('dancing','Baile','Dancing',10),('gaming','Videojuegos','Gaming',11),('art','Arte','Art',12),
 ('photography','Fotografía','Photography',13),('nature','Naturaleza','Nature',14),('tech','Tecnología','Tech',15),('fashion','Moda','Fashion',16),
 ('wine','Vino','Wine',17),('soccer','Fútbol','Soccer',18),('beach','Playa','Beach',19),('series','Series','TV shows',20),
 ('food','Comida','Food',21),('cars','Autos','Cars',22),('yoga','Yoga','Yoga',23),('karaoke','Karaoke','Karaoke',24)
on conflict (key) do nothing;

create table if not exists public.user_interests (
  user_id uuid not null references public.users(id) on delete cascade,
  interest_key text not null references public.interests(key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, interest_key)
);
alter table public.user_interests enable row level security;
drop policy if exists user_interests_read on public.user_interests;
create policy user_interests_read on public.user_interests for select to authenticated using (true);
drop policy if exists user_interests_own_write on public.user_interests;
create policy user_interests_own_write on public.user_interests for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 2) Visibilidad: ¿puede el viewer ver el perfil de Match del target? Devuelve el negocio común o null.
--    Ambos con presencia ACTIVA vigente en el mismo local, ambos con opt-in, Match activo en el local, ninguno expulsado, sin bloqueo.
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
  limit 1;
$$;
revoke all on function public.match_common_business(uuid, uuid) from public, anon;
grant execute on function public.match_common_business(uuid, uuid) to authenticated, service_role;

-- 3) Fotos de Match (galería propia, moderadas). Máximo 6. El estado solo lo cambia el servidor.
create table if not exists public.match_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  path text not null unique,                       -- ruta en el bucket match-photos: {uid}/{uuid}.webp
  sort integer not null default 0,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  rejection_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists match_photos_user_idx on public.match_photos (user_id, status, sort);
alter table public.match_photos enable row level security;
drop policy if exists match_photos_own on public.match_photos;
create policy match_photos_own on public.match_photos for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and status = 'pending' and path like auth.uid()::text || '/%');
drop policy if exists match_photos_visible on public.match_photos;
create policy match_photos_visible on public.match_photos for select to authenticated
  using (status = 'approved' and public.match_common_business(auth.uid(), user_id) is not null);

-- El cliente no puede cambiar el estado ni el dueño de la foto; solo service_role (moderación).
create or replace function public.match_photos_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and (new.status is distinct from old.status or new.reviewed_at is distinct from old.reviewed_at
     or new.rejection_reason is distinct from old.rejection_reason or new.user_id <> old.user_id or new.path <> old.path) then
    raise exception 'match_photo_fields_readonly' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_match_photos_guard on public.match_photos;
create trigger trg_match_photos_guard before update on public.match_photos for each row execute function public.match_photos_guard();

create or replace function public.match_photos_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.match_photos p where p.user_id = new.user_id) >= 6 then
    raise exception 'match_photos_limit_reached' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_match_photos_limit on public.match_photos;
create trigger trg_match_photos_limit before insert on public.match_photos for each row execute function public.match_photos_limit();

-- 4) Bucket privado match-photos (5 MB, solo imágenes)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('match-photos', 'match-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists match_photos_storage_insert on storage.objects;
create policy match_photos_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'match-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists match_photos_storage_own on storage.objects;
create policy match_photos_storage_own on storage.objects for select to authenticated
  using (bucket_id = 'match-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists match_photos_storage_delete on storage.objects;
create policy match_photos_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'match-photos' and (storage.foldername(name))[1] = auth.uid()::text);
-- Otros solo ven fotos APROBADAS de alguien presente en el mismo local
drop policy if exists match_photos_storage_visible on storage.objects;
create policy match_photos_storage_visible on storage.objects for select to authenticated
  using (
    bucket_id = 'match-photos'
    and exists (
      select 1 from public.match_photos p
      where p.path = objects.name and p.status = 'approved'
        and public.match_common_business(auth.uid(), p.user_id) is not null
    )
  );
