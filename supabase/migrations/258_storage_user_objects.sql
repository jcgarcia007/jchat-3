-- 258: qué archivos de Storage son de una persona. NO APLICADA (la aplica Juan Carlos por MCP, cuando diga "aplica 258").
-- Reversión: supabase/rollbacks/258_storage_user_objects_rollback.sql · Comprobación: supabase/scripts/258_check.sql
--
-- Problema (prueba de tiendas, C-3 / B2-1): borrar una cuenta no borraba sus archivos. La función delete-account los purga ANTES de borrar
-- auth.users, pero deducir las rutas de las tablas de la app no sirve: en producción messages.media_url es NULL en todas las filas y aun
-- así el bucket voice-notes tiene objetos room/<sala>/<uid>/<archivo>; y dm-media depende de que las filas de dm_messages sigan existiendo.
-- La fuente de verdad son los propios objetos: storage.objects. Esta función devuelve (bucket, ruta) de TODOS los objetos de una persona:
--   avatars, covers, profile-media, post-media, match-photos, story-media, verification-selfies   <uid>/…            (primera carpeta)
--   dm-media                                                                                       <conversación>/<uid>/…   (segunda carpeta)
--   voice-notes                                                                                    room/<sala>/<uid>/<archivo>  (tercera carpeta)
-- NUNCA incluye menu-photos (sus carpetas son ids de negocio, no de personas).
--
-- Seguridad: la función lee storage.objects de CUALQUIER persona, así que solo la ejecuta service_role (la Edge Function delete-account,
-- que toma el uid del JWT verificado). Se revoca a public, anon y authenticated.
--
-- Idempotente y no destructivo: "create or replace" y revoke/grant (repetirlos no cambia nada). No toca datos.

create or replace function public.storage_user_object_paths(p_user uuid)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path = public, storage
as $$
  select o.bucket_id, o.name
  from storage.objects o
  where (o.bucket_id in ('avatars', 'covers', 'profile-media', 'post-media', 'match-photos', 'story-media', 'verification-selfies')
         and split_part(o.name, '/', 1) = p_user::text)
     or (o.bucket_id = 'dm-media' and split_part(o.name, '/', 2) = p_user::text)
     or (o.bucket_id = 'voice-notes' and split_part(o.name, '/', 1) = 'room' and split_part(o.name, '/', 3) = p_user::text)
  order by o.bucket_id, o.name;
$$;

comment on function public.storage_user_object_paths(uuid) is
  'Bucket y ruta de todos los objetos de Storage de una persona (carpeta de usuario por bucket; nunca los archivos de los negocios). Solo service_role: la usa delete-account para purgar archivos antes de borrar la cuenta.';

revoke all on function public.storage_user_object_paths(uuid) from public, anon, authenticated;
grant execute on function public.storage_user_object_paths(uuid) to service_role;
