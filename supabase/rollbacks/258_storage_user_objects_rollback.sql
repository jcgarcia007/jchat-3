-- Reversión de 258_storage_user_objects.sql: quita la función. Es seguro: no toca datos ni objetos de Storage.
-- Efecto: delete-account (la versión que llama a esta función) responderá storage_purge_failed hasta que se vuelva a aplicar la 258
-- o se despliegue una versión anterior de la función.

drop function if exists public.storage_user_object_paths(uuid);
