-- Versionada tal cual está en producción (supabase_migrations.schema_migrations, versión 20261011000135). APLICADA 2026-10-11.
-- 220: is_venue_staff reconoce a los empleados con status 'accepted' (el valor real que guarda la app; is_employee_of_business ya lo usa).
-- Antes exigía 'active' y ningún empleado real pasaba: afectaba staff_set_order_status, venue_order_access,
-- assert_venue_order_allowed y enforce_service_call_golden_rule. Invitaciones pendientes siguen fuera.
create or replace function public.is_venue_staff(p_business_id uuid, p_user_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = p_user_id)
      or exists (select 1 from public.employees e where e.business_id = p_business_id and e.user_id = p_user_id
                 and coalesce(e.status,'active') in ('active','accepted'));
$function$;
