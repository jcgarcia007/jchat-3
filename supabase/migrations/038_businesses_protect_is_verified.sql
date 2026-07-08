-- 038 — FIX #9 (Tanda 3): protege businesses.is_verified (badge de "verificado").
-- Hoy authenticated tiene UPDATE sobre is_verified (estaba en la allow-list de la 036)
-- → un dueño podía auto-otorgarse el badge por UPDATE directo. Se replica el patrón de
-- columnas financieras (034/036): revoke del UPDATE de tabla + re-grant de la allow-list
-- SIN is_verified. Los cambios legítimos futuros deben ir por service_role o RPC
-- SECURITY DEFINER con guard is_platform_admin() (igual que status en la 034).
-- is_verified sigue siendo LEGIBLE (SELECT intacto) → el badge se muestra igual.
revoke update on public.businesses from authenticated, anon;

grant update (
  address, category, city, country, cover_url, created_at, dashboard_theme_id,
  description, event_ends_at, event_starts_at, external_menu_url, gallery_urls,
  geofence_polygon, geofence_radius_m, hours, icon_emoji, id, is_active,
  is_temporary, lat, latitude, lng, logo_url, longitude,
  menu_card_effect, menu_enabled, menu_mode, menu_palette_id, menu_template_id,
  name, payout_frequency, phone, radius_m, slug, state, tip_percentages,
  tips_enabled, updated_at, website
) on public.businesses to authenticated;
