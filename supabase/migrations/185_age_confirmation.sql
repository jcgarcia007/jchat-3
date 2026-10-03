-- 185: confirmación de edad 18+ en el servidor. Se guarda solo el año y la fecha de confirmación (nunca la fecha completa).

alter table public.users
  add column if not exists birth_year smallint,
  add column if not exists age_confirmed_at timestamptz;

comment on column public.users.birth_year is 'Año de nacimiento (minimización: no se guarda la fecha completa). Solo lo escribe confirm_age.';
comment on column public.users.age_confirmed_at is 'Momento en que el servidor verificó 18+. NULL = la app debe pedir la confirmación. Solo lo escribe confirm_age.';

-- Verifica 18+ con la fecha completa y guarda solo año + confirmación.
create or replace function public.confirm_age(p_birth_date date)
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
      age_confirmed_at = now()
  where id = v_uid;

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.confirm_age(date) from public, anon;
grant execute on function public.confirm_age(date) to authenticated;
