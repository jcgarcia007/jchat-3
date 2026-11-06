-- 262 — comprobación DESPUÉS de aplicar supabase/migrations/262_review_mode.sql. NO ESCRIBE NADA: todo es select.
-- Lo esperado: TODAS las filas con ok = true (las últimas, informativas, no llevan ok).

-- (a) Las cuatro tablas existen, con RLS activo
select t.nombre as comprobacion, coalesce(c.relrowsecurity, false) as ok
from (values ('review_mode'), ('review_group_members'), ('review_group_businesses'), ('review_bypass_log')) as t(nombre)
left join pg_class c on c.oid = to_regclass('public.' || t.nombre);

-- (b) Una sola fila en review_mode
select 'review_mode una fila' as comprobacion, (select count(*) from public.review_mode) = 1 as ok;

-- (c) authenticated/anon NO escriben en ninguna tabla; authenticated solo lee (la política limita a is_platform_admin)
select r.rol || ' escribe en ' || t.nombre as comprobacion,
       not (has_table_privilege(r.rol, 'public.' || t.nombre, 'insert') or has_table_privilege(r.rol, 'public.' || t.nombre, 'update') or has_table_privilege(r.rol, 'public.' || t.nombre, 'delete')) as ok
from (values ('authenticated'), ('anon')) as r(rol),
     (values ('review_mode'), ('review_group_members'), ('review_group_businesses'), ('review_bypass_log')) as t(nombre);

select 'anon lee ' || t.nombre as comprobacion, not has_table_privilege('anon', 'public.' || t.nombre, 'select') as ok
from (values ('review_mode'), ('review_group_members'), ('review_group_businesses'), ('review_bypass_log')) as t(nombre);

select 'política de lectura de ' || t.nombre as comprobacion,
       exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.nombre and p.cmd = 'SELECT' and p.qual ilike '%is_platform_admin%') as ok
from (values ('review_mode'), ('review_group_members'), ('review_group_businesses'), ('review_bypass_log')) as t(nombre);

select 'sin políticas de escritura en ' || t.nombre as comprobacion,
       not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.nombre and p.cmd <> 'SELECT') as ok
from (values ('review_mode'), ('review_group_members'), ('review_group_businesses'), ('review_bypass_log')) as t(nombre);

-- (d) Permisos de las funciones: review_bypass solo service_role; administración authenticated sí / anon no
select r.firma || ' / ' || r.rol as comprobacion,
       has_function_privilege(r.rol, to_regprocedure(r.firma), 'execute') = r.esperado as ok
from (values
  ('public.review_bypass(uuid,uuid,text)', 'authenticated', false), ('public.review_bypass(uuid,uuid,text)', 'anon', false),
  ('public.review_is_group_business(uuid)', 'authenticated', false), ('public.review_mode_active()', 'authenticated', false),
  ('public.business_visible_to(uuid)', 'anon', true), ('public.business_visible_to(uuid)', 'authenticated', true),
  ('public.review_member_sees(uuid)', 'authenticated', true),
  ('public.review_mode_set(int)', 'authenticated', true), ('public.review_mode_set(int)', 'anon', false),
  ('public.review_mode_off()', 'authenticated', true), ('public.review_mode_off()', 'anon', false),
  ('public.review_group_add_member(text,text)', 'authenticated', true), ('public.review_group_add_member(text,text)', 'anon', false),
  ('public.review_group_add_business(text)', 'authenticated', true), ('public.review_group_add_business(text)', 'anon', false),
  ('public.review_group_set_status(text,text,text)', 'authenticated', true), ('public.review_group_set_status(text,text,text)', 'anon', false),
  ('public.review_group_overview()', 'authenticated', true), ('public.review_group_overview()', 'anon', false),
  ('public.review_join_room(uuid)', 'authenticated', true), ('public.review_join_room(uuid)', 'anon', false),
  ('public.review_bypass_businesses()', 'authenticated', true), ('public.review_bypass_businesses()', 'anon', false)
) as r(firma, rol, esperado);

-- (e) Todas security definer con search_path fijo
select p.proname || ' security definer + search_path' as comprobacion, p.prosecdef and p.proconfig is not null as ok
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and (p.proname like 'review\_%' or p.proname = 'business_visible_to');

-- (f) Las funciones enganchadas llaman al bypass / a la visibilidad
select r.nombre || ' menciona ' || r.pieza as comprobacion, position(r.pieza in pg_get_functiondef(to_regprocedure(r.firma))) > 0 as ok
from (values
  ('venue_inside', 'public.venue_inside(uuid,double precision,double precision)', 'review_bypass'),
  ('check_geofence_and_join_room', 'public.check_geofence_and_join_room(uuid,double precision,double precision)', 'review_bypass'),
  ('match_get_deck', 'public.match_get_deck(uuid,integer)', 'review_is_member'),
  ('venue_people_counts', 'public.venue_people_counts(uuid[])', 'review_is_member'),
  ('venue_present_users', 'public.venue_present_users(uuid,uuid[])', 'review_is_member'),
  ('resolve_venue_entry', 'public.resolve_venue_entry(text,text,text,text)', 'business_visible_to'),
  ('megaphone_feed', 'public.megaphone_feed(double precision,double precision,integer,timestamp with time zone,integer)', 'review_member_sees')
) as r(nombre, firma, pieza);

-- (g) La política de businesses usa business_visible_to
select 'businesses: public read usa business_visible_to' as comprobacion,
       exists (select 1 from pg_policies p where p.tablename = 'businesses' and p.policyname = 'businesses: public read' and p.qual ilike '%business_visible_to%') as ok;

-- (h) check_in (fidelidad) y match_presence_core / assert_venue_order_allowed NO se tocaron
select 'check_in sin cambios' as comprobacion, position('review_' in pg_get_functiondef('public.check_in(uuid)'::regprocedure)) = 0 as ok;

-- (i) INFORMATIVO (sin ok): estado del modo, miembros y locales
select enabled_until, enabled_until > now() as activo from public.review_mode;
select m.kind, m.status, count(*) from public.review_group_members m group by 1, 2 order by 1, 2;
select g.status, count(*) from public.review_group_businesses g group by 1;
