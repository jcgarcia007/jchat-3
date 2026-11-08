-- Prueba de 269 (business_plan_requests + submit_business_plan_request). LOCAL ÚNICAMENTE; todo dentro de una transacción que termina en ROLLBACK.
-- Es autónoma (no usa los helpers de _helpers.sql): sirve en cualquier Postgres local que tenga auth.users, auth.uid() y los roles anon/authenticated.
--   docker exec -i <contenedor> psql -U supabase_admin -d postgres -f - < supabase/tests/269_business_plan_requests_local.sql   (con 269 ya aplicada)
-- Cada bloque imprime el resultado de la llamada; los "ERROR: permission denied" son LO ESPERADO.
begin;
\set ON_ERROR_STOP off
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000a1');

\echo '--- 1. invitado (anon): 3 solicitudes del mismo correo -> ok, ok, ok; la 4.ª -> RATE_LIMIT'
set local role anon;
select public.submit_business_plan_request('Bar Uno', 2, null, 'dueno@example.com', null, 'es', null) as r1;
select public.submit_business_plan_request('Bar Uno', 2, '555-1234', 'dueno@example.com', 'hola', 'es', null) as r2;
select public.submit_business_plan_request('Bar Uno', 3, null, 'DUENO@example.com', null, 'en', null) as r3_mismo_correo_en_mayusculas;
select public.submit_business_plan_request('Bar Uno', 2, null, 'dueno@example.com', null, 'es', null) as r4_debe_ser_RATE_LIMIT;

\echo '--- 2. mismo ip_hash con correos distintos: 3 ok, la 4.ª -> RATE_LIMIT (límite por IP)'
select public.submit_business_plan_request('Local A', 1, null, 'a@example.com', null, 'es', 'iphash-1') as ip1;
select public.submit_business_plan_request('Local B', 1, null, 'b@example.com', null, 'es', 'iphash-1') as ip2;
select public.submit_business_plan_request('Local C', 1, null, 'c@example.com', null, 'es', 'iphash-1') as ip3;
select public.submit_business_plan_request('Local D', 1, null, 'd@example.com', null, 'es', 'iphash-1') as ip4_debe_ser_RATE_LIMIT;
select public.submit_business_plan_request('Local E', 1, null, 'e@example.com', null, 'es', 'iphash-2') as otro_ip_ok;

\echo '--- 3. INVALID (nombre vacío, nombre de 121, correo mal, locales 0 y 1000, mensaje de 2001, teléfono de 41, hash de 129)'
select public.submit_business_plan_request('   ', 1, null, 'ok@example.com', null, 'es', null) as nombre_vacio;
select public.submit_business_plan_request(repeat('x', 121), 1, null, 'ok@example.com', null, 'es', null) as nombre_121;
select public.submit_business_plan_request('N', 1, null, 'no-es-correo', null, 'es', null) as correo_malo;
select public.submit_business_plan_request('N', 0, null, 'ok@example.com', null, 'es', null) as locales_0;
select public.submit_business_plan_request('N', 1000, null, 'ok@example.com', null, 'es', null) as locales_1000;
select public.submit_business_plan_request('N', 1, null, 'ok@example.com', repeat('m', 2001), 'es', null) as mensaje_2001;
select public.submit_business_plan_request('N', 1, repeat('9', 41), 'ok@example.com', null, 'es', null) as telefono_41;
select public.submit_business_plan_request('N', 1, null, 'ok@example.com', null, 'es', repeat('h', 129)) as hash_129;
select public.submit_business_plan_request('N', 1, null, 'ok@example.com', repeat('m', 2000), 'fr', null) as limites_exactos_y_locale_raro_ok;

\echo '--- 4. anon NO puede leer ni escribir la tabla directamente (esperado: permission denied)'
savepoint sp;
select count(*) from public.business_plan_requests;
rollback to savepoint sp;
insert into public.business_plan_requests (business_name, locations_count, email) values ('x', 1, 'x@example.com');
rollback to savepoint sp;

\echo '--- 5. con sesión (authenticated): user_id se rellena'
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
set local role authenticated;
select public.submit_business_plan_request('Bar Con Sesion', 5, null, 'sesion@example.com', null, 'es', null) as sesion_ok;
savepoint sp2;
select count(*) from public.business_plan_requests;   -- authenticated tampoco lee la tabla (esperado: permission denied)
rollback to savepoint sp2;

\echo '--- 6. verificación como superusuario'
reset role;
select email, user_id is not null as con_user_id, locale, ip_hash, business_name from public.business_plan_requests where email in ('sesion@example.com', 'dueno@example.com') order by created_at;
select count(*) filter (where email = 'dueno@example.com') as solicitudes_de_dueno_guardadas, count(*) as total from public.business_plan_requests;
select has_function_privilege('anon', 'public.submit_business_plan_request(text,integer,text,text,text,text,text)', 'execute') as anon_exec,
       has_function_privilege('authenticated', 'public.submit_business_plan_request(text,integer,text,text,text,text,text)', 'execute') as auth_exec,
       has_table_privilege('anon', 'public.business_plan_requests', 'select') as anon_select_tabla,
       has_table_privilege('authenticated', 'public.business_plan_requests', 'insert') as auth_insert_tabla;
select relrowsecurity as rls_activada, (select count(*) from pg_policies where tablename = 'business_plan_requests') as politicas from pg_class where oid = 'public.business_plan_requests'::regclass;
rollback;
