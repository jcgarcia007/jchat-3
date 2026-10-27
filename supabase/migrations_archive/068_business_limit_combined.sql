-- 068: enforce_business_limit cuenta COMBINADO (negocios + eventos juntos) contra un
-- límite único por plan. Antes contaba is_temporary por separado (daba business=1+1).
-- Modelo (Juan): business = 1 total (negocio O evento), pro = 10 total, regular = 0.
-- Conserva: límites por plan, bypass de super_admin, mensajes de error, SECURITY DEFINER.

begin;

create or replace function public.enforce_business_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan  text;
  v_role  text;
  v_limit int;
  v_count int;
begin
  if new.owner_id is null then
    return new;
  end if;

  select plan, role into v_plan, v_role
  from public.users
  where id = new.owner_id;

  -- super_admin bypasses limits entirely.
  if v_role = 'super_admin' then
    return new;
  end if;

  v_limit := case coalesce(v_plan, 'regular')
    when 'pro' then 10
    when 'business' then 1
    else 0
  end;

  -- COMBINED count: businesses AND events together (NO is_temporary filter).
  select count(*) into v_count
  from public.businesses
  where owner_id = new.owner_id;

  if v_count >= v_limit then
    raise exception
      'PLAN_LIMIT_COMBINED: plan % allows % business(es)+event(s) total, already have %',
      coalesce(v_plan,'regular'), v_limit, v_count
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

commit;
