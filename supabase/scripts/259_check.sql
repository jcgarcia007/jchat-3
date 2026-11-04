-- 259 — comprobación DESPUÉS de aplicar supabase/migrations/259_text_filter_v2.sql. NO ESCRIBE NADA: todo es select.
-- Cada fila trae ok = true/false; lo esperado es que TODAS salgan con ok = true.

-- (a) Las dos funciones existen
select r.nombre as comprobacion, to_regprocedure(r.firma) is not null as ok
from (values
  ('message_is_objectionable', 'public.message_is_objectionable(text)'),
  ('content_filter_trigger',   'public.content_filter_trigger()'),
  ('message_filter_trigger (sigue)', 'public.message_filter_trigger()')
) as r(nombre, firma);

-- (b) message_is_objectionable sigue siendo IMMUTABLE con search_path = public
select 'objectionable_immutable_search_path' as comprobacion,
       coalesce(p.provolatile = 'i', false) and coalesce('search_path=public' = any (p.proconfig), false) as ok
from (select 1) x left join pg_proc p on p.oid = to_regprocedure('public.message_is_objectionable(text)');

-- (c) Triggers nuevos: tabla, columna y argumento. (INSERT solo donde corresponde; users solo UPDATE)
select r.tabla || '.' || r.columna as comprobacion,
       exists (
         select 1 from pg_trigger t
         where t.tgrelid = to_regclass('public.' || r.tabla) and not t.tgisinternal
           and t.tgfoid = to_regprocedure('public.content_filter_trigger()')
           and pg_get_triggerdef(t.oid) like '%UPDATE OF ' || r.columna || ' ON%'
           and pg_get_triggerdef(t.oid) like '%content_filter_trigger(''' || r.columna || ''')%'
           and (pg_get_triggerdef(t.oid) like 'CREATE TRIGGER % BEFORE INSERT OR UPDATE OF%') = r.con_insert
       ) as ok
from (values
  ('posts', 'caption', true), ('tod_cards', 'body', true), ('rooms', 'name', true), ('rooms', 'description', true),
  ('users', 'bio', false), ('users', 'display_name', false), ('users', 'username', false)
) as r(tabla, columna, con_insert);

-- (d) Los tres triggers antiguos siguen (messages, comments, dm_messages)
select 'trg_message_filter_x3' as comprobacion,
       (select count(*) from pg_trigger t where t.tgname = 'trg_message_filter' and not t.tgisinternal
          and t.tgfoid = to_regprocedure('public.message_filter_trigger()')) = 3 as ok;

-- (e) "kike" ya no bloquea solo; sí la frase ofensiva. Falsos positivos típicos pasan; amenazas y slurs se bloquean
select 'kike_apodo_pasa_frase_bloquea' as comprobacion,
       not public.message_is_objectionable('Kike') and not public.message_is_objectionable('Enrique, Kike para los amigos')
       and public.message_is_objectionable('dirty kike') as ok;
select 'falsos_positivos_pasan' as comprobacion,
       not public.message_is_objectionable('me muero de risa') and not public.message_is_objectionable('Scunthorpe')
       and not public.message_is_objectionable('te voy a matar de risa') and not public.message_is_objectionable('Nacho, Chucho y Pepe') as ok;
select 'bloqueados' as comprobacion,
       public.message_is_objectionable('f a g g o t') and public.message_is_objectionable('h1j0 d3 put4')
       and public.message_is_objectionable('kill yourself') and public.message_is_objectionable('te voy a matar') as ok;

-- (f) INFORMATIVO (no es ok/ko): filas YA guardadas que el filtro nuevo no habría dejado pasar. No se tocan: el trigger no las revisa
--     mientras no cambie esa columna. Sirve para que Juan las vea y decida.
select 'posts.caption' as tabla, count(*) as filas_que_hoy_no_pasarian from public.posts where public.message_is_objectionable(caption)
union all select 'tod_cards.body', count(*) from public.tod_cards where public.message_is_objectionable(body)
union all select 'rooms.name', count(*) from public.rooms where public.message_is_objectionable(name)
union all select 'rooms.description', count(*) from public.rooms where public.message_is_objectionable(description)
union all select 'users.bio', count(*) from public.users where public.message_is_objectionable(bio)
union all select 'users.display_name', count(*) from public.users where public.message_is_objectionable(display_name)
union all select 'users.username', count(*) from public.users where public.message_is_objectionable(username);
