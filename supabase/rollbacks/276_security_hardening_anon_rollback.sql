-- ROLLBACK de 276_security_hardening_anon. Juan lo aplica a mano en el SQL Editor (borra la función submit_business_plan_request_server: DESTRUCTIVO, por eso va aparte).
-- Devuelve los privilegios al estado de la 245 + defaults de Supabase. ANTES de aplicar la 276 en producción guarda el estado real para poder compararlo:
--   select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' order by 1, 2, 3;
--   select p.proname, p.proacl from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('submit_business_plan_request', 'auth_user_ban_check', 'auth_user_ban_fingerprint', 'match_fits');
-- OJO: el paso 4 vuelve a dar INSERT/UPDATE/DELETE a anon en TODAS las tablas (así estaba por defecto); si en producción algunas ya los tenían revocados, ajusta tras comparar.
-- La web de ese momento debe llamar a submit_business_plan_request (ruta anterior): revierte también el despliegue de /api/business-plan-request.

-- 1 · S-01
grant select on public.public_profiles to anon;

-- 2 · S-02
grant execute on function public.submit_business_plan_request(text, integer, text, text, text, text, text) to public, anon, authenticated;
drop function if exists public.submit_business_plan_request_server(text, integer, text, text, text, text, text, uuid);

-- 3 · H-108
alter default privileges for role postgres in schema public grant execute on functions to anon;
alter default privileges for role postgres grant execute on functions to public;

-- 4 · S-06
grant execute on function public.auth_user_ban_check() to public, anon, authenticated;
grant execute on function public.auth_user_ban_fingerprint() to public, anon, authenticated;
alter function public.match_fits(text, text) reset search_path;
grant insert, update, delete on all tables in schema public to anon;
alter default privileges for role postgres in schema public grant insert, update, delete on tables to anon;

-- 5 · S-03
grant delete on public.businesses to authenticated;

-- 6 · S-04
grant insert on public.trials to authenticated;
