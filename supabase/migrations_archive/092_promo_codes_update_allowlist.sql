-- 092_promo_codes_update_allowlist
-- D-54 Batch 2 (tabla 2): promo_codes tenía UPDATE de tabla completa a authenticated (10 cols).
-- La única escritura directa por PostgREST desde la UI de super-admin
-- (web/app/super-admin/promo-codes/page.tsx, toggleActive) es UPDATE { active }. La creación va
-- por RPC create_promo_code (definer) y la redención por RPC definer — no usan el grant de
-- authenticated. Restringir el UPDATE de authenticated a solo (active); las demás columnas
-- (code, plan, trial_days, expires_at, redeemed_by, redeemed_at, created_by, created_at, id)
-- dejan de ser escribibles por PostgREST. La RLS (promo_codes_admin_all, is_platform_admin())
-- ya limita las filas a admins de plataforma.
revoke update on public.promo_codes from authenticated;
grant update (active) on public.promo_codes to authenticated;
