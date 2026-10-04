-- 188: registrar la aceptación de Términos y Privacidad (fecha + versión), junto con la confirmación de edad.

alter table public.users
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

comment on column public.users.terms_accepted_at is 'Momento en que el usuario aceptó Términos y Privacidad. Solo lo escribe confirm_age.';
comment on column public.users.terms_version is 'Versión de los Términos aceptada (p. ej. 2026-10). Solo lo escribe confirm_age.';

-- confirm_age ahora también registra la aceptación de términos (parámetro opcional: las llamadas viejas siguen funcionando).
drop function if exists public.confirm_age(date);
create or replace function public.confirm_age(p_birth_date date, p_terms_version text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_birth_date is null or p_birth_date > current_date or p_birth_date < date '1900-01-01' then
    raise exception 'invalid_birth_date' using errcode = '22023';
  end if;
  if p_birth_date > (current_date - interval '18 years')::date then
    return jsonb_build_object('ok', false, 'reason', 'underage');
  end if;

  update public.users
  set birth_year = extract(year from p_birth_date)::smallint,
      age_confirmed_at = now(),
      terms_accepted_at = now(),
      terms_version = coalesce(nullif(trim(p_terms_version), ''), 'unversioned')
  where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.confirm_age(date, text) from public, anon;
grant execute on function public.confirm_age(date, text) to authenticated;

-- Quienes ya confirmaron edad marcaron la casilla obligatoria de términos en esa misma pantalla.
update public.users
set terms_accepted_at = age_confirmed_at,
    terms_version = 'unversioned'
where age_confirmed_at is not null and terms_accepted_at is null;
