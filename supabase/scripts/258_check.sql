-- 258 — comprobación DESPUÉS de aplicar supabase/migrations/258_storage_user_objects.sql. NO ESCRIBE NADA: todo es select.
-- Cada fila trae ok = true/false; lo esperado es que TODAS salgan con ok = true.

-- (a) La función existe con la firma esperada: storage_user_object_paths(uuid) → (bucket_id text, name text)
select 'existe' as comprobacion,
       to_regprocedure('public.storage_user_object_paths(uuid)') is not null as ok;

-- (b) Es security definer, con search_path = public, storage, y es "stable"
select 'security_definer_y_search_path' as comprobacion,
       coalesce(p.prosecdef, false)
         and coalesce(p.provolatile = 's', false)
         and coalesce('search_path=public, storage' = any (p.proconfig), false) as ok
from (select 1) x
left join pg_proc p on p.oid = to_regprocedure('public.storage_user_object_paths(uuid)');

-- (c) Solo service_role tiene EXECUTE (anon y authenticated no, y tampoco PUBLIC: anon/authenticated heredan de PUBLIC)
select r.rol as comprobacion,
       has_function_privilege(r.rol, to_regprocedure('public.storage_user_object_paths(uuid)'), 'execute') = r.esperado as ok
from (values ('service_role', true), ('anon', false), ('authenticated', false)) as r(rol, esperado);

-- (d) Para un uuid inexistente devuelve 0 filas
select 'uuid_inexistente_0_filas' as comprobacion,
       (select count(*) from public.storage_user_object_paths('00000000-0000-0000-0000-000000000000'::uuid)) = 0 as ok;

-- (e) La definición nunca menciona menu-photos
select 'sin_menu_photos' as comprobacion,
       position('menu-photos' in pg_get_functiondef(to_regprocedure('public.storage_user_object_paths(uuid)'))) = 0 as ok;

-- (f) INFORMATIVO: cuántos objetos hay hoy por bucket que esta función considera "de una persona" (los de cuentas ya borradas
--     son los huérfanos de la auditoría; se limpian con supabase/scripts/storage_orphans_cleanup.mjs)
select o.bucket_id, count(*) as objetos
from storage.objects o
where (o.bucket_id in ('avatars', 'covers', 'profile-media', 'post-media', 'match-photos', 'story-media', 'verification-selfies') and split_part(o.name, '/', 1) ~ '^[0-9a-f-]{36}$')
   or (o.bucket_id = 'dm-media' and split_part(o.name, '/', 2) ~ '^[0-9a-f-]{36}$')
   or (o.bucket_id = 'voice-notes' and split_part(o.name, '/', 1) = 'room' and split_part(o.name, '/', 3) ~ '^[0-9a-f-]{36}$')
group by 1 order by 1;
