-- 062: límite de empleados por plan, aplicado en el SERVIDOR (D-42, hallazgo #5)
-- Antes: el límite solo existía en el cliente → un INSERT directo a PostgREST lo saltaba.
-- Trigger (no RPC): dispara en CUALQUIER vía de inserción, incluida service_role.
-- Límites: business = 10, pro = 50 empleados por negocio.

begin;

create or replace function public.enforce_employee_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_plan   text;
  v_limit        int;
  v_current      int;
begin
  -- Los platform admins no se topan con el límite (seeds/soporte).
  if is_platform_admin() then
    return new;
  end if;

  select u.plan
    into v_owner_plan
    from businesses b
    join users u on u.id = b.owner_id
   where b.id = new.business_id;

  v_limit := case v_owner_plan
               when 'pro'      then 50
               when 'business' then 10
               else 0          -- sin plan de dashboard → no puede tener empleados
             end;

  select count(*) into v_current
    from employees
   where business_id = new.business_id;

  if v_current >= v_limit then
    raise exception
      'Employee limit reached for this plan (% of % used). Upgrade the plan to add more employees.',
      v_current, v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_employee_plan_limit() from public, anon;

drop trigger if exists trg_employees_plan_limit on public.employees;

create trigger trg_employees_plan_limit
  before insert on public.employees
  for each row execute function public.enforce_employee_plan_limit();

comment on function public.enforce_employee_plan_limit() is
  'D-42: server-side enforcement of the per-plan employee limit (business=10, pro=50). Fires on every INSERT path, service_role included; platform admins exempt.';

commit;
