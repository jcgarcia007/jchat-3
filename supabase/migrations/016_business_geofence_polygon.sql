-- ============================================================
-- JChat 3.0 — Business custom geofence polygon
-- The Settings → Location editor lets owners draw a Circle/Polygon geofence.
-- Stored as GeoJSON (Point/Circle/Polygon). Null = simple radial geofence
-- (geofence_radius_m around latitude/longitude).
-- ============================================================

alter table public.businesses
  add column if not exists geofence_polygon jsonb;
