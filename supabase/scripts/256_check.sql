-- 256 — comprobación DESPUÉS de aplicar supabase/migrations/256_match_join_venue.sql. NO ESCRIBE NADA: todo es select.
-- Cada fila trae ok = true/false; lo esperado es que TODAS salgan con ok = true.

-- (a) Las tres funciones existen y devuelven jsonb
select p.proname as comprobacion, pg_get_function_result(p.oid) = 'jsonb' as ok
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('match_check_in', 'match_join_venue', 'match_presence_core') order by 1;

-- (b) match_join_venue: security definer, y la ejecuta authenticated pero no anon; la interna no la ejecuta ningún cliente
select 'join_security_definer' as comprobacion, coalesce(bool_or(p.prosecdef), false) as ok
from pg_proc p where p.oid = to_regprocedure('public.match_join_venue(uuid,double precision,double precision,text,boolean)');
select r.comprobacion, has_function_privilege(r.rol, to_regprocedure(r.firma), 'execute') = r.esperado as ok
from (values
  ('join: authenticated puede', 'authenticated', 'public.match_join_venue(uuid,double precision,double precision,text,boolean)', true),
  ('join: anon no puede',       'anon',          'public.match_join_venue(uuid,double precision,double precision,text,boolean)', false),
  ('check_in: authenticated sigue pudiendo', 'authenticated', 'public.match_check_in(uuid,double precision,double precision,text,boolean)', true),
  ('core: authenticated no puede', 'authenticated', 'public.match_presence_core(uuid,double precision,double precision,text,boolean,boolean)', false),
  ('core: anon no puede',          'anon',          'public.match_presence_core(uuid,double precision,double precision,text,boolean,boolean)', false)
) as r(comprobacion, rol, firma, esperado);

-- (c) match_check_in NO inserta en game_optins; la función interna tampoco
select 'check_in_sin_insert_en_game_optins' as comprobacion,
       position('insert into public.game_optins' in pg_get_functiondef(to_regprocedure('public.match_check_in(uuid,double precision,double precision,text,boolean)'))) = 0 as ok;
select 'core_sin_insert_en_game_optins' as comprobacion,
       position('insert into public.game_optins' in pg_get_functiondef(to_regprocedure('public.match_presence_core(uuid,double precision,double precision,text,boolean,boolean)'))) = 0 as ok;

-- (d) match_join_venue es la ÚNICA función de public que inserta en game_optins (esperado: exactamente 1 fila, match_join_venue)
select 'unica_funcion_que_inserta' as comprobacion,
       coalesce(array_agg(p.proname order by p.proname) = array['match_join_venue']::name[], false) as ok
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosrc ilike '%insert into%game_optins%';

-- (e) INFORMATIVO: personas con opt-in de Match y cuántas tienen presencia viva (no cambia con la 256: las que ya estaban dentro siguen dentro)
select count(*) as optins_match, count(*) filter (where exists (select 1 from public.match_presence mp where mp.user_id = o.user_id and mp.business_id = o.business_id and mp.expires_at > now())) as con_presencia_viva
from public.game_optins o where o.game_key = 'match';
