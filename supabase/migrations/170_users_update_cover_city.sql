-- 170: los usuarios pueden actualizar su propia portada y ciudad (cover_url, city), que añadió la 169.
-- APLICADA EN PRODUCCIÓN; este archivo solo la versiona.
grant update (cover_url, city) on public.users to authenticated;
