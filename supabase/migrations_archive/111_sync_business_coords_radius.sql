-- ============================================================
-- JChat 3.0 — Épica Geocerca, Fase 1.0: sincronizar columnas de
-- coordenadas y radio duplicadas en `businesses`, sin tocar
-- consumidores ni sitios de escritura existentes.
--
-- Contexto (docs/EPICA_GEOCERCA_ACCESO_CHAT.md §7 P1, reconocimiento
-- 2026-07-28): `businesses` tiene 4 columnas de coordenadas
-- (lat/lng + latitude/longitude) y 2 de radio (radius_m +
-- geofence_radius_m) escritas de forma inconsistente por 3 sitios
-- (business/register, LocationEditor, radius-requests), sin trigger
-- de sincronización. Riesgo: la Fase 3 (enforcement de la regla de
-- oro) leería coordenadas/radio no fiables.
--
-- Columnas primarias elegidas (fuente de verdad):
--   - Coordenadas: lat/lng — únicas leídas por el mapa móvil
--     (MapScreen, BusinessPin, BusinessPreviewCard) y por el alta
--     de negocio.
--   - Radio: geofence_radius_m — es la columna que valida el
--     trigger server-side ya existente trg_enforce_business_radius_cap
--     (021_enforce_business_radius_cap.sql) contra el cap de 50 m
--     y las solicitudes aprobadas en radius_increase_requests.
--     radius_m (NOT NULL, default 100) nunca pasa por ese cap porque
--     el trigger dispara solo "of geofence_radius_m". Dejar radius_m
--     como primario habría requerido subir geofence_radius_m de 50 a
--     100 en 17 negocios SIN solicitud aprobada — el propio trigger
--     de cap lo habría rechazado. geofence_radius_m gana.
--
-- Regla de precedencia:
--   - Si el par/columna primario llega no-null en el mismo
--     INSERT/UPDATE, gana y se copia al secundario (incluso si el
--     secundario tenía otro valor no-null distinto).
--   - Si el primario llega null pero el secundario no, se copia el
--     secundario al primario (rellenar hueco, nunca al revés).
--   - Si ambos llegan null, no se toca nada.
--   - Nunca se fuerza null sobre un valor bueno del otro lado.
--
-- NO cambia tipos, NO elimina columnas, NO toca geofence_polygon.
-- NO toca business/register, LocationEditor ni radius-requests.
-- ============================================================

create or replace function public.sync_business_coords_radius()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Coordenadas: lat/lng es el primario.
  if new.lat is not null and new.lng is not null then
    new.latitude := new.lat;
    new.longitude := new.lng;
  elsif new.latitude is not null and new.longitude is not null then
    new.lat := new.latitude;
    new.lng := new.longitude;
  end if;

  -- Radio: geofence_radius_m es el primario (el que valida el cap
  -- server-side trg_enforce_business_radius_cap).
  if new.geofence_radius_m is not null then
    new.radius_m := new.geofence_radius_m;
  else
    new.geofence_radius_m := new.radius_m; -- radius_m es NOT NULL, siempre hay valor de respaldo
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_business_coords_radius on public.businesses;
create trigger trg_sync_business_coords_radius
  before insert or update on public.businesses
  for each row execute function public.sync_business_coords_radius();

-- ============================================================
-- Backfill de las 18 filas existentes (2026-07-28). Reglas explícitas
-- (auditable sin depender del trigger). Ningún valor de coordenada
-- se inventa: solo se copia entre columnas donde una ya tenía el
-- dato y la otra estaba vacía o desalineada.
-- ============================================================

-- Coords: rellenar latitude/longitude desde lat/lng (10 filas esperadas).
update public.businesses
set latitude = lat, longitude = lng
where lat is not null and lng is not null
  and (latitude is distinct from lat or longitude is distinct from lng);

-- Coords: rellenar lat/lng desde latitude/longitude en el caso inverso (0 filas esperadas hoy).
update public.businesses
set lat = latitude, lng = longitude
where latitude is not null and longitude is not null
  and (lat is distinct from latitude or lng is distinct from longitude);

-- Radio: geofence_radius_m (primario, cap-enforced) gana sobre radius_m (17 filas esperadas).
update public.businesses
set radius_m = geofence_radius_m
where geofence_radius_m is not null
  and radius_m is distinct from geofence_radius_m;
