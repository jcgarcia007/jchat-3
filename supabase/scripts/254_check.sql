-- 254 — comprobación DESPUÉS de aplicar supabase/migrations/254_match_profile_v2.sql. NO ESCRIBE NADA: todo es select.

-- (a) Tablas nuevas, todas con RLS activada.   Esperado: 3 filas, rls = true
select c.relname as tabla, c.relrowsecurity as rls
from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('match_profiles', 'match_v2_flags', 'photo_moderation_log')
order by 1;

-- (b) Políticas de match_profiles: solo la propia fila.   Esperado: 4 filas (select, insert, update, delete), todas con user_id = auth.uid()
select policyname, cmd, regexp_replace(coalesce(qual, with_check), '\s+', ' ', 'g') as condicion
from pg_policies where schemaname = 'public' and tablename = 'match_profiles' order by cmd;

-- (c) Privilegios de las tablas nuevas.   Esperado: match_profiles → authenticated select/insert/update/delete y NADA para anon;
--     match_v2_flags y photo_moderation_log → ninguno para anon ni authenticated
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('match_profiles', 'match_v2_flags', 'photo_moderation_log') and grantee in ('anon', 'authenticated')
group by 1, 2 order by 1, 2;

-- (d) Sexo e interés NO salen en ninguna vista ni en users.   Esperado: 0 filas en las dos consultas
select table_name, column_name from information_schema.columns
where table_schema = 'public' and column_name in ('gender', 'seeking') and table_name <> 'match_profiles';
select viewname from pg_views where schemaname = 'public' and (definition ilike '%match_profiles%' or definition ilike '%seeking%');

-- (e) La puerta de Match exige la coincidencia mutua, y match_get_deck sigue pasando por ella.   Esperado: 2 filas, ambas true
select p.proname, pg_get_functiondef(p.oid) like '%match_orientation_ok%' as usa_orientacion
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'match_common_business'
union all
select p.proname, pg_get_functiondef(p.oid) like '%match_common_business%'
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'match_get_deck';

-- (f) Tabla de verdad de match_fits (sin tocar datos).   Esperado, en este orden: true, false, false, true, null, null
select public.match_fits('women', 'woman') as mujer_busca_mujeres,
       public.match_fits('women', 'man') as mujer_busca_hombre,
       public.match_fits('men', 'nonbinary') as nb_para_quien_busca_hombres,
       public.match_fits('all', 'nonbinary') as nb_para_todos,
       public.match_fits(null, 'man') as sin_interes,
       public.match_fits('men', null) as sin_sexo;

-- (g) Transición: estado de la bandera.   Esperado al aplicar: enforce_profile_from NULL, forzado = false
select f.enforce_profile_from, public.match_profile_enforced() as forzado from public.match_v2_flags f;

-- (h) Reintentos sin el corte de 2 días.   Esperado: 2 filas, sin_corte = true
select p.proname, pg_get_functiondef(p.oid) not like '%2 days%' as sin_corte, pg_get_functiondef(p.oid) like '%photo_moderation_log%' as con_backoff
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('match_photo_retry_moderation', 'dm_photo_retry_moderation') order by 1;

-- (i) Crones.   Esperado: los dos de reintento cada 10 min y photo-moderation-alert cada 5 min, todos activos
select jobname, schedule, active from cron.job
where jobname in ('match-photo-retry-moderation', 'dm-photo-retry-moderation', 'photo-moderation-alert') order by 1;

-- (j) Trigger del aviso al usuario.   Esperado: 1 fila, habilitado ('O')
select tgname, tgenabled from pg_trigger where tgrelid = 'public.match_photos'::regclass and tgname = 'trg_match_photo_verdict_notify';

-- (k) Fotos que siguen sin moderar (para ver qué reintentará el cron y qué ya alertó).
select 'match' as tipo, count(*) as pendientes, min(created_at) as la_mas_antigua
from public.match_photos where status = 'pending' and moderated_at is null
union all
select 'dm', count(*), min(created_at) from public.dm_messages where media_moderation = 'pending' and media_url is not null;

select kind, count(*) filter (where alerted_at is not null) as alertadas, count(*) filter (where notified_at is not null) as avisadas, max(attempts) as max_intentos
from public.photo_moderation_log group by 1;

-- (l) Cuántas personas ya completaron sexo e interés (para decidir la fecha de enforce_profile_from).
select count(*) filter (where gender is not null and seeking is not null) as completos, count(*) as filas from public.match_profiles;

-- (m) match_profiles: los clientes solo actualizan gender y seeking, y no pueden borrar.   Esperado: UPDATE solo en gender y seeking; sin DELETE
select privilege_type, string_agg(column_name, ', ' order by column_name) as columnas
from information_schema.column_privileges where table_schema = 'public' and table_name = 'match_profiles' and grantee = 'authenticated' and privilege_type = 'UPDATE'
group by 1;
select count(*) as con_delete_para_authenticated from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'match_profiles' and grantee in ('anon', 'authenticated') and privilege_type = 'DELETE';

-- (n) Trigger del límite de cambios (3 cada 24 h).   Esperado: 1 fila, habilitado ('O')
select tgname, tgenabled from pg_trigger where tgrelid = 'public.match_profiles'::regclass and tgname = 'trg_match_profiles_change_guard';

-- (o) match_common_business solo responde por quien llama, y authenticated conserva EXECUTE (lo usan dos políticas).   Esperado: true, true
select pg_get_functiondef('public.match_common_business(uuid,uuid)'::regprocedure) like '%p_viewer = (select auth.uid())%' as solo_quien_llama,
       has_function_privilege('authenticated', 'public.match_common_business(uuid,uuid)', 'execute') as authenticated_ejecuta;
