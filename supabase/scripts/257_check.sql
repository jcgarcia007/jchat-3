-- 257 — comprobación DESPUÉS de aplicar supabase/migrations/257_business_open_now.sql. NO ESCRIBE NADA: todo es select.
-- Cada fila trae ok = true/false; lo esperado es que TODAS salgan con ok = true (la última, informativa, no lleva ok).

-- (a) Las funciones existen con la firma esperada
select r.nombre as comprobacion, to_regprocedure(r.firma) is not null as ok
from (values
  ('business_is_open_now',  'public.business_is_open_now(uuid,timestamptz)'),
  ('business_hours_minutes', 'public.business_hours_minutes(text)'),
  ('business_hours_day',     'public.business_hours_day(jsonb)'),
  ('assert_venue_order_allowed', 'public.assert_venue_order_allowed(uuid,uuid,text,double precision,double precision,text,uuid)'),
  ('create_paid_order',      'public.create_paid_order(jsonb,jsonb)')
) as r(nombre, firma);

-- (b) business_is_open_now: security definer, stable, search_path = public
select 'open_now_definer_stable_search_path' as comprobacion,
       coalesce(p.prosecdef, false) and coalesce(p.provolatile = 's', false) and coalesce('search_path=public' = any (p.proconfig), false) as ok
from (select 1) x
left join pg_proc p on p.oid = to_regprocedure('public.business_is_open_now(uuid,timestamptz)');

-- (c) Permisos: business_is_open_now → authenticated y service_role sí; anon no. Los dos ayudantes: nadie salvo el dueño.
select r.rol || ' / ' || r.funcion as comprobacion,
       has_function_privilege(r.rol, to_regprocedure(r.firma), 'execute') = r.esperado as ok
from (values
  ('authenticated', 'business_is_open_now', 'public.business_is_open_now(uuid,timestamptz)', true),
  ('service_role',  'business_is_open_now', 'public.business_is_open_now(uuid,timestamptz)', true),
  ('anon',          'business_is_open_now', 'public.business_is_open_now(uuid,timestamptz)', false),
  ('authenticated', 'business_hours_minutes', 'public.business_hours_minutes(text)', false),
  ('anon',          'business_hours_day', 'public.business_hours_day(jsonb)', false),
  ('service_role',  'create_paid_order', 'public.create_paid_order(jsonb,jsonb)', true),
  ('authenticated', 'create_paid_order', 'public.create_paid_order(jsonb,jsonb)', false),
  ('service_role',  'assert_venue_order_allowed', 'public.assert_venue_order_allowed(uuid,uuid,text,double precision,double precision,text,uuid)', true),
  ('authenticated', 'assert_venue_order_allowed', 'public.assert_venue_order_allowed(uuid,uuid,text,double precision,double precision,text,uuid)', false)
) as r(rol, funcion, firma, esperado);

-- (d) Las dos funciones de pedidos mencionan venue_closed y business_is_open_now
select 'assert_menciona_venue_closed' as comprobacion,
       position('venue_closed' in pg_get_functiondef(to_regprocedure('public.assert_venue_order_allowed(uuid,uuid,text,double precision,double precision,text,uuid)'))) > 0
       and position('business_is_open_now' in pg_get_functiondef(to_regprocedure('public.assert_venue_order_allowed(uuid,uuid,text,double precision,double precision,text,uuid)'))) > 0 as ok;
select 'create_paid_order_menciona_venue_closed' as comprobacion,
       position('venue_closed' in pg_get_functiondef(to_regprocedure('public.create_paid_order(jsonb,jsonb)'))) > 0 as ok;

-- (e) Local inexistente o sin horario → NULL (no bloquea)
select 'local_inexistente_null' as comprobacion,
       public.business_is_open_now('00000000-0000-0000-0000-000000000000'::uuid) is null as ok;

-- (f) Parseo de horas: igual que hours.ts
select 'parseo_horas' as comprobacion,
       public.business_hours_minutes('09:30') = 570 and public.business_hours_minutes('24:00') = 1440
       and public.business_hours_minutes('25:00') is null and public.business_hours_minutes('9:60') is null
       and public.business_hours_minutes('abc') is null and public.business_hours_minutes(null) is null as ok;

-- (g) INFORMATIVO: el veredicto de hoy para cada local (true = abierto, false = cerrado, null = horario desconocido)
select b.id, b.name, b.timezone, public.business_is_open_now(b.id) as abierto_ahora
from public.businesses b
order by b.name;
