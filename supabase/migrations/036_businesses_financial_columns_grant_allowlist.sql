-- 036 — Corrects 034: the column-level REVOKE was a no-op because a table-level
-- UPDATE grant implies all columns. Do it correctly: revoke the table-level UPDATE,
-- then grant UPDATE back on only the non-financial columns (allow-list). Result:
-- plan / tax_rate / stripe_account_id / status / owner_id are NOT client-writable;
-- the owner keeps editing everything else. service_role and the SECURITY DEFINER
-- RPC (owner=postgres) are unaffected.
revoke update on public.businesses from authenticated, anon;

grant update (
  address, category, city, country, cover_url, created_at, dashboard_theme_id,
  description, event_ends_at, event_starts_at, external_menu_url, gallery_urls,
  geofence_polygon, geofence_radius_m, hours, icon_emoji, id, is_active,
  is_temporary, is_verified, lat, latitude, lng, logo_url, longitude,
  menu_card_effect, menu_enabled, menu_mode, menu_palette_id, menu_template_id,
  name, payout_frequency, phone, radius_m, slug, state, tip_percentages,
  tips_enabled, updated_at, website
) on public.businesses to authenticated;
