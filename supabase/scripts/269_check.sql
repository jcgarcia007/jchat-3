-- 269_check.sql — comprobación de SOLO LECTURA tras aplicar 269 (business_plan_requests + submit_business_plan_request). Sin efectos.
-- Esperado: tabla con RLS y 0 políticas; anon/authenticated sin privilegios de tabla; RPC security definer con search_path=public, ejecutable por anon y authenticated.
select c.relname, c.relrowsecurity as rls_activada, (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as politicas
  from pg_class c where c.oid = 'public.business_plan_requests'::regclass;                                   -- t / 0
select has_table_privilege('anon', 'public.business_plan_requests', 'select') as anon_select,
       has_table_privilege('anon', 'public.business_plan_requests', 'insert') as anon_insert,
       has_table_privilege('authenticated', 'public.business_plan_requests', 'select') as auth_select,
       has_table_privilege('authenticated', 'public.business_plan_requests', 'insert') as auth_insert;      -- todo false
select p.proname, p.prosecdef as security_definer, p.proconfig as config,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
  from pg_proc p where p.proname = 'submit_business_plan_request';                                          -- t / {search_path=public} / t / t
select indexname from pg_indexes where tablename = 'business_plan_requests' order by 1;                     -- pkey + 2 índices
select count(*) as solicitudes from public.business_plan_requests;                                          -- 0 antes de usar la web
