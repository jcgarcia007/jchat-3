/**
 * JChat 3.0 — the location step of the business registration wizard: coordinates are REQUIRED and come from the address.
 *
 * Why: a business saved without lat/lng has no geofence ("no_geofence" in check_geofence_and_join_room), so the server refuses
 * every non-owner at the door. The wizard used to leave the latitude / longitude boxes empty and save null. Now "Continue" on the
 * location step geocodes the address with the Google Maps Geocoder (the same API-key / loader as the dashboard's LocationEditor),
 * fills the boxes (still editable), and does not let the owner go on without valid coordinates.
 *
 * Pure on purpose (no React, no google global): the geocoder is passed in, so the decisions are unit-tested
 * (scripts/register-location.test.mjs).
 */

export interface Coords {
  lat: number;
  lng: number;
}

/** Where the numbers in the boxes came from: the geocoder ('auto') or typed by the owner ('manual'). */
export type CoordSource = 'auto' | 'manual' | null;

export interface CoordState {
  lat: string;
  lng: string;
  source: CoordSource;
  /** Normalised address the 'auto' coordinates were found for. */
  geocodedFor: string;
}

const RANGE = { lat: 90, lng: 180 } as const;

/** A finite number inside the valid range, or null. Accepts "26.0872319" and "26,0872319". */
export function parseCoordinate(value: string, kind: 'lat' | 'lng'): number | null {
  const text = value.trim().replace(',', '.');
  if (text === '') return null;
  const n = Number(text);
  if (!Number.isFinite(n) || Math.abs(n) > RANGE[kind]) return null;
  return n;
}

/** Both coordinates valid, and not the (0, 0) of "nothing here" → the pair; otherwise null. */
export function coordsFrom(lat: string, lng: string): Coords | null {
  const la = parseCoordinate(lat, 'lat');
  const ln = parseCoordinate(lng, 'lng');
  if (la === null || ln === null) return null;
  if (la === 0 && ln === 0) return null;
  return { lat: la, lng: ln };
}

export function normalizeAddress(address: string): string {
  return address.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Whether "Continue" must geocode now: there are no valid coordinates, or the ones in the boxes were found by the geocoder for a
 * DIFFERENT address than the one typed now (the owner fixed the address afterwards). Coordinates the owner typed are never replaced.
 */
export function needsGeocode(state: CoordState, address: string): boolean {
  if (!coordsFrom(state.lat, state.lng)) return true;
  return state.source === 'auto' && state.geocodedFor !== normalizeAddress(address);
}

/** An address shorter than this is still being typed (or is not an address): the blur does not geocode it. */
export const MIN_BLUR_ADDRESS_LENGTH = 8;

/**
 * Whether leaving the address field should geocode it now (silently, ahead of "Continue"): the same condition as Continue
 * (needsGeocode) plus a minimum length, and never while another geocoding is running.
 */
export function shouldGeocodeOnBlur(input: { address: string; state: CoordState; busy: boolean }): boolean {
  if (input.busy) return false;
  if (input.address.trim().length < MIN_BLUR_ADDRESS_LENGTH) return false;
  return needsGeocode(input.state, input.address);
}

export type GeocodeOutcome =
  | { ok: true; coords: Coords }
  | { ok: false; reason: 'empty_address' | 'unavailable' | 'no_results' | 'error' };

/** The slice of google.maps.Geocoder this module uses (callback form: its statuses are documented and stable). */
export interface GeocoderLike {
  geocode(
    request: { address: string },
    callback: (results: Array<{ geometry: { location: { lat(): number; lng(): number } } }> | null, status: string) => void,
  ): unknown;
}

const round = (n: number) => Math.round(n * 1e7) / 1e7;

/** Resolves the address with the geocoder (null = Maps not loaded / no key). Never rejects. */
export function geocodeAddress(geocoder: GeocoderLike | null, address: string): Promise<GeocodeOutcome> {
  const text = address.trim();
  if (!text) return Promise.resolve({ ok: false, reason: 'empty_address' });
  if (!geocoder) return Promise.resolve({ ok: false, reason: 'unavailable' });
  return new Promise((resolve) => {
    try {
      geocoder.geocode({ address: text }, (results, status) => {
        if (status === 'ZERO_RESULTS') return resolve({ ok: false, reason: 'no_results' });
        const loc = status === 'OK' ? results?.[0]?.geometry?.location : undefined;
        if (!loc) return resolve({ ok: false, reason: 'error' });
        const coords = { lat: round(loc.lat()), lng: round(loc.lng()) };
        resolve(coordsFrom(String(coords.lat), String(coords.lng)) ? { ok: true, coords } : { ok: false, reason: 'error' });
      });
    } catch {
      resolve({ ok: false, reason: 'error' });
    }
  });
}
