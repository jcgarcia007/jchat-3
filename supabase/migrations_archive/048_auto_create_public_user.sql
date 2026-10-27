-- 048_auto_create_public_user.sql
-- Auto-crea public.users cuando se inserta en auth.users (cubre OAuth + email).
-- Deriva un username único del email/nombre. El email signup del cliente sigue
-- funcionando (ON CONFLICT DO NOTHING evita choque con su upsert).

-- Función que deriva un username base sanitizado desde email o metadata
create or replace function public.derive_username(_email text, _meta jsonb)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  base text;
begin
  -- 1) intentar local-part del email
  base := lower(split_part(coalesce(_email, ''), '@', 1));
  -- sanitizar a [a-z0-9_]
  base := regexp_replace(base, '[^a-z0-9_]', '', 'g');

  -- 2) fallback: nombre de la metadata
  if length(base) < 3 then
    base := lower(coalesce(_meta->>'full_name', _meta->>'name', ''));
    base := regexp_replace(base, '[^a-z0-9_]', '', 'g');
  end if;

  -- 3) fallback final
  if length(base) < 3 then
    base := 'user';
  end if;

  -- recortar a 30
  base := left(base, 30);
  return base;
end;
$$;

-- Función del trigger
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  base_username text;
  final_username text;
  suffix int := 0;
  candidate text;
begin
  base_username := public.derive_username(new.email, new.raw_user_meta_data);

  -- dedupe case-insensitive contra public.users.username
  candidate := base_username;
  loop
    exit when not exists (
      select 1 from public.users where lower(username) = lower(candidate)
    );
    suffix := suffix + 1;
    -- asegurar que base+suffix no exceda 30
    candidate := left(base_username, 30 - length(suffix::text)) || suffix::text;
  end loop;
  final_username := candidate;

  insert into public.users (id, username, display_name, language, profile_theme_id)
  values (
    new.id,
    final_username,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    'en',
    1
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ── BACKFILL: crear filas para usuarios OAuth existentes sin public.users ──
insert into public.users (id, username, display_name, language, profile_theme_id)
select
  au.id,
  -- derivar + dedupe inline para cada huérfano
  (
    with base as (
      select left(
        coalesce(
          nullif(regexp_replace(lower(split_part(au.email,'@',1)), '[^a-z0-9_]', '', 'g'), ''),
          nullif(regexp_replace(lower(coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name','')), '[^a-z0-9_]', '', 'g'), ''),
          'user'
        ), 30) as b
    )
    select case
      when not exists (select 1 from public.users u where lower(u.username) = (select b from base))
        then (select b from base)
      else (select b from base) || floor(random()*10000)::text
    end
  ),
  coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name'),
  'en',
  1
from auth.users au
left join public.users pu on pu.id = au.id
where pu.id is null
on conflict (id) do nothing;
