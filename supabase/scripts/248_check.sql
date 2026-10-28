-- 248 — comprobación DESPUÉS de aplicar supabase/migrations/248_security_hardening.sql. NO ESCRIBE NADA: todo es select.

-- (a) venue_presence_ok.   Esperado: authenticated = false · anon = false
select has_function_privilege('authenticated', 'public.venue_presence_ok(uuid, uuid)', 'execute') as authenticated_puede,
       has_function_privilege('anon',          'public.venue_presence_ok(uuid, uuid)', 'execute') as anon_puede;

-- (b) Las cuatro políticas ya no son `true`.   Esperado: ninguna fila con using_ = 'true'
select tablename, policyname, regexp_replace(coalesce(qual, '-'), '\s+', ' ', 'g') as using_
from pg_policies
where schemaname = 'public' and (tablename, policyname) in (('stories', 'stories_read'), ('story_views', 'story_views_read_own_story'), ('map_reactions', 'map_reactions_read'), ('reviews', 'reviews: author update'))
order by tablename;

-- (c) TRUNCATE / REFERENCES / TRIGGER ya no están concedidos a la API.   Esperado: 0 filas
select table_name, grantee, privilege_type from information_schema.table_privileges
where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
limit 20;

-- (d) Tampoco para las tablas que se creen después.   Esperado: 0 filas con anon / authenticated y esos privilegios
select defaclrole::regrole as role, defaclacl::text from pg_default_acl where defaclnamespace = 'public'::regnamespace and defaclobjtype = 'r';
