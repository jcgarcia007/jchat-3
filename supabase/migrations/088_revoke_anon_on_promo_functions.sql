-- 088 — Defensa en profundidad sobre las funciones de códigos promocionales.
--
-- Supabase concede EXECUTE por defecto a `anon` y `authenticated` en toda función
-- nueva del schema public. El `revoke all ... from public` de las migraciones 086/087
-- NO quita ese permiso, porque está concedido al ROL anon, no a PUBLIC.
--
-- Hoy no hay agujero: create_promo_code exige is_platform_admin() y validate_promo_code
-- exige auth.uid(). Pero eso deja la seguridad apoyada SOLO en el chequeo interno: si
-- una edición futura quita ese `if`, anon queda dentro. Estas funciones tocan planes de
-- pago, así que cerramos también la puerta de permisos (refuerza D-41 y D-54).

revoke execute on function public.create_promo_code(text, int, timestamptz) from anon;
revoke execute on function public.validate_promo_code(text) from anon;
