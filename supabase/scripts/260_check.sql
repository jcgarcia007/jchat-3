-- 260 — comprobación DESPUÉS de aplicar supabase/migrations/260_pos_owner_access.sql. NO ESCRIBE NADA: todo es select.
-- Cada fila trae ok = true/false; lo esperado es que TODAS salgan con ok = true (la última, informativa, no lleva ok).

-- (a) Las tres funciones existen, siguen siendo security definer y conservan sus permisos (solo "authenticated"/"service_role"; anon no)
select r.nombre as comprobacion, to_regprocedure(r.firma) is not null as ok
from (values
  ('pos_can_access',     'public.pos_can_access(uuid)'),
  ('pos_my_businesses',  'public.pos_my_businesses()'),
  ('pos_create_order',   'public.pos_create_order(uuid,uuid,jsonb,text)')
) as r(nombre, firma);

select r.nombre || ' security definer' as comprobacion, coalesce(p.prosecdef, false) as ok
from (values ('pos_can_access', 'public.pos_can_access(uuid)'), ('pos_my_businesses', 'public.pos_my_businesses()'), ('pos_create_order', 'public.pos_create_order(uuid,uuid,jsonb,text)')) as r(nombre, firma)
left join pg_proc p on p.oid = to_regprocedure(r.firma);

select r.rol || ' / ' || r.nombre as comprobacion,
       has_function_privilege(r.rol, to_regprocedure(r.firma), 'execute') = r.esperado as ok
from (values
  ('authenticated', 'pos_can_access', 'public.pos_can_access(uuid)', true),
  ('anon',          'pos_can_access', 'public.pos_can_access(uuid)', false),
  ('authenticated', 'pos_my_businesses', 'public.pos_my_businesses()', true),
  ('anon',          'pos_my_businesses', 'public.pos_my_businesses()', false),
  ('authenticated', 'pos_create_order', 'public.pos_create_order(uuid,uuid,jsonb,text)', true),
  ('anon',          'pos_create_order', 'public.pos_create_order(uuid,uuid,jsonb,text)', false)
) as r(rol, nombre, firma, esperado);

-- (b) Las definiciones mencionan al dueño (businesses.owner_id)
select r.nombre || ' mira owner_id' as comprobacion,
       position('owner_id' in pg_get_functiondef(to_regprocedure(r.firma))) > 0 as ok
from (values ('pos_can_access', 'public.pos_can_access(uuid)'), ('pos_my_businesses', 'public.pos_my_businesses()'), ('pos_create_order', 'public.pos_create_order(uuid,uuid,jsonb,text)')) as r(nombre, firma);

-- (c) pos_my_businesses devuelve las mismas columnas y tipos de siempre
select 'pos_my_businesses_columnas' as comprobacion,
       pg_get_function_result(to_regprocedure('public.pos_my_businesses()')) = 'TABLE(business_id uuid, business_name text, employee_id uuid, role text, has_pin boolean, plan text)' as ok;

-- (d) INFORMATIVO (sin ok): los locales con dueño y cuántos empleados con pos_access tienen. Los que tienen 0 son los que esta migración abre al dueño.
select b.id, b.name, (select count(*) from public.employees e join public.custom_roles cr on cr.id = e.custom_role_id
                        where e.business_id = b.id and e.status = 'accepted' and coalesce((cr.permissions->>'pos_access')::boolean, false)) as empleados_con_pos_access
from public.businesses b order by b.name;
