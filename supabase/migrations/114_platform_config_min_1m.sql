-- ============================================================
-- JChat 3.0 — Chunk A2 (Paso 1): bajar mínimo global a 1m
--
-- La constraint platform_config_radius_positive ya exige > 0,
-- así que 1m es válido. El piso absoluto documentado es 1m;
-- 10m es solo GUÍA de UX (texto en el LocationEditor y en el
-- panel de super-admin — no un valor de BD).
--
-- Este UPDATE no toca ningún geofence_radius_m existente en
-- businesses — solo cambia el piso del rango elegible para
-- nuevos ajustes del dueño. El trigger enforce_business_radius_cap
-- (A1) solo valida el MAX, no el min — el min es guía de UI.
-- ============================================================

update public.platform_config
   set business_radius_min_m = 1
 where id = true;
