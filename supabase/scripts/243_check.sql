-- 243 — comprobación DESPUÉS de aplicar supabase/migrations/243_venue_present_users.sql.
-- NO ESCRIBE NADA: la función es de solo lectura y todo lo de abajo es select. Cada sección dice qué resultado se espera.

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (a) Permisos.   Esperado: anon = false · authenticated = true · service_role = true (el dueño de la función lo tiene siempre)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select
  has_function_privilege('anon',          'public.venue_present_users(uuid, uuid[])', 'execute') as anon_puede,
  has_function_privilege('authenticated', 'public.venue_present_users(uuid, uuid[])', 'execute') as authenticated_puede,
  has_function_privilege('service_role',  'public.venue_present_users(uuid, uuid[])', 'execute') as service_role_puede;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (b) Definición.   Esperado: security_definer = true · volatilidad 's' (stable) · search_path = public · devuelve uuid[]
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select p.prosecdef as security_definer, p.provolatile as volatilidad, p.proconfig as config, pg_get_function_result(p.oid) as devuelve
from pg_proc p
where p.oid = 'public.venue_present_users(uuid, uuid[])'::regprocedure;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (c) Las reglas están en el texto de la función (se lee, no se ejecuta nada).
--     Esperado: todo true.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select
  position('v_uid is null' in def) > 0                                                             as sin_sesion_devuelve_vacio,
  position('not public.venue_presence_ok(p_business_id, v_uid)' in def) > 0                         as pregunta_debe_estar_presente,
  position('p_user_ids[1:100]' in def) > 0                                                          as maximo_100,
  position('select distinct x.id' in def) > 0                                                       as sin_duplicados,
  position('public.venue_presence_ok(p_business_id, c.id)' in def) > 0                              as filtra_por_presencia,
  position('(b.blocker_id = v_uid and b.blocked_id = c.id) or (b.blocker_id = c.id and b.blocked_id = v_uid)' in def) > 0 as bloqueos_en_ambos_sentidos,
  position('insert ' in lower(def)) = 0 and position('update ' in lower(def)) = 0 and position('delete ' in lower(def)) = 0 as no_escribe
from (select pg_get_functiondef('public.venue_present_users(uuid, uuid[])'::regprocedure) as def) f;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (d) Llamada sin sesión (el SQL Editor corre sin auth.uid()).   Esperado: {}  (array vacío: nadie puede sondear un local)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
select public.venue_present_users('00000000-0000-0000-0000-000000000000'::uuid, array['00000000-0000-0000-0000-000000000001'::uuid]);

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (e) OPCIONAL · solo lectura. Simula a una persona presente. Cambia <UID_QUE_PREGUNTA> por el id de alguien con presencia vigente
--     en el local (la consulta de abajo lista quiénes la tienen) y selecciona de "begin;" a "rollback;" juntos.
--     Esperado: devuelve SOLO los ids de la lista que siguen presentes y sin bloqueo; un id que no esté en la lista nunca aparece.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- select r.business_id, g.user_id, g.expires_at from public.room_geo_presence g join public.rooms r on r.id = g.room_id where g.expires_at > now() order by g.expires_at desc limit 10;
--
-- begin;
-- select set_config('request.jwt.claims', json_build_object('sub', '<UID_QUE_PREGUNTA>', 'role', 'authenticated')::text, true);
-- set local role authenticated;
-- select public.venue_present_users('<BUSINESS_ID>'::uuid, array['<UID_QUE_PREGUNTA>'::uuid, '<OTRO_UID>'::uuid, '<OTRO_UID>'::uuid]);
-- rollback;
