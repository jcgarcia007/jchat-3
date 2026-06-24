-- ============================================================
-- JChat 3.0 — Enforce 50m business geofence radius cap (server-side)
--
-- Decisión de diseño 2026-06-24 (ver DECISIONS.md D-13): el radio máximo de
-- geofence de un negocio es 50 m. Radios mayores solo con un
-- radius_increase_requests APROBADO que cubra el valor, o si lo escribe un
-- platform admin. La regla de oro de geo: el servidor decide, nunca el cliente.
--
-- No se usa un CHECK simple porque rompería negocios con aumento aprobado.
-- ============================================================

alter table public.businesses
  alter column geofence_radius_m set default 50;

create or replace function public.enforce_business_radius_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap constant integer := 50;
  has_grant boolean;
begin
  if new.geofence_radius_m is null or new.geofence_radius_m <= cap then
    return new;
  end if;
  if public.is_platform_admin() then
    return new;
  end if;
  select exists (
    select 1 from public.radius_increase_requests r
    where r.business_id = new.id
      and r.status = 'approved'
      and r.requested_radius_m >= new.geofence_radius_m
  ) into has_grant;
  if has_grant then
    return new;
  end if;
  raise exception
    'geofence_radius_m % exceeds the % m cap without an approved radius increase request',
    new.geofence_radius_m, cap
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_enforce_business_radius_cap on public.businesses;
create trigger trg_enforce_business_radius_cap
  before insert or update of geofence_radius_m on public.businesses
  for each row execute function public.enforce_business_radius_cap();
