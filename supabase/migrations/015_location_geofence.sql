-- ============================================================
-- JChat 3.0 — Location & Geofence editor columns
-- Business: precise lat/lng + geofence radius (editable from Settings).
-- Event: per-event point + optional drawn geofence polygon (GeoJSON).
-- ============================================================

alter table public.businesses
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geofence_radius_m integer default 200;

alter table public.events
  add column if not exists location_lat double precision,
  add column if not exists location_lng double precision,
  add column if not exists geofence_polygon jsonb;
