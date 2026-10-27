-- 063: cerrar hallazgo del linter — profile-media permite LISTAR archivos
-- Un bucket público sirve sus objetos por URL sin necesitar política de SELECT;
-- esta política solo habilitaba listar el bucket entero vía la API. Bucket vacío.
-- Verificado: "storage: public read public buckets" cubre solo avatars/covers/
-- post-media/menu-photos (NO profile-media), así que al quitar esta política
-- profile-media queda sin SELECT (no listable) y el acceso por URL sigue igual.
-- El hallazgo del SECURITY DEFINER en public_profiles NO se toca aquí: requiere
-- decisión de diseño (users solo tiene SELECT own + platform admin → INVOKER
-- rompería el descubrimiento de perfiles). Ver D-15 / migración 046.

begin;

drop policy if exists "storage: public read profile-media" on storage.objects;

commit;
