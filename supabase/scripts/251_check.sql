-- 251 — comprobación DESPUÉS de aplicar supabase/migrations/251_default_privileges.sql. NO ESCRIBE NADA: todo es select.

-- (a) El event trigger existe y está activo.   Esperado: 1 fila, evtenabled = 'O' (enabled)
select evtname, evtevent, evttags, evtenabled from pg_event_trigger where evtname = 'revoke_dangerous_table_grants';

-- (b) Ninguna tabla de public concede TRUNCATE / REFERENCES / TRIGGER a la API.   Esperado: 0 filas
select table_name, grantee, privilege_type from information_schema.table_privileges
where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
limit 20;

-- (c) Quién es el dueño de las tablas de public.   Esperado: solo postgres (si aparece otro rol, el event trigger lo cubre igualmente)
select c.relowner::regrole as dueno, count(*) as tablas from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' group by 1;

-- (d) Qué roles tienen permisos por defecto en public (información: el de supabase_admin sigue dando arwdDxtm; el event trigger lo compensa).
select defaclrole::regrole as rol, defaclacl::text from pg_default_acl where defaclnamespace = 'public'::regnamespace and defaclobjtype = 'r';
