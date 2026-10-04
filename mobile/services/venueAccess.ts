/**
 * JChat 3.0 — Golden rule, app side (migrations 197–199).
 *
 * The app only reads coordinates and forwards them; whether the person is inside the venue is decided
 * by the SERVER (venue_order_access / check_geofence_and_join_room). Outside the area or without
 * location permission only the menu and — if the owner enabled it — pick-up orders exist.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import {
  getCurrentPosition,
  hasForegroundPermission,
  requestForegroundPermission,
  type Coords,
} from './geofence';

export type VenueOrderType = 'table' | 'counter' | 'gift';

export interface VenueAccess {
  inside: boolean;
  pickupEnabled: boolean;
  allowedTypes: VenueOrderType[];
  /** The check itself failed (network/server) — NOT a verdict; callers must not treat it as "outside". */
  failed?: boolean;
}

/** Fails closed: nothing allowed. */
export const NO_VENUE_ACCESS: VenueAccess = { inside: false, pickupEnabled: false, allowedTypes: [] };

/** Everything allowed (demo mode / Supabase not configured). */
export const FULL_VENUE_ACCESS: VenueAccess = {
  inside: true,
  pickupEnabled: true,
  allowedTypes: ['table', 'counter', 'gift'],
};

const POSITION_TIMEOUT_MS = 8000;
/** A fix this fresh is reused (quotes are re-requested on every tip/cart change). */
const POSITION_TTL_MS = 60_000;
let lastFix: { coords: Coords; at: number } | null = null;

/**
 * Current coordinates, or null when there is no permission / no fix. With `ask` it shows the system
 * permission prompt (use it from "Allow location / Retry"); without it never prompts.
 */
export async function readVenueCoords(ask = false): Promise<Coords | null> {
  try {
    const granted = (await hasForegroundPermission()) || (ask && (await requestForegroundPermission()));
    if (!granted) return null;
    if (!ask && lastFix && Date.now() - lastFix.at <= POSITION_TTL_MS) return lastFix.coords;
    const coords = await Promise.race<Coords | null>([
      getCurrentPosition(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), POSITION_TIMEOUT_MS)),
    ]);
    if (coords) lastFix = { coords, at: Date.now() };
    return coords;
  } catch {
    return null;
  }
}

/** What the signed-in person may do at this venue (their venue presence counts; coords are the fallback). */
export async function fetchVenueAccess(businessId: string, coords: Coords | null): Promise<VenueAccess> {
  if (!isSupabaseConfigured) return FULL_VENUE_ACCESS;
  const { data, error } = await supabase.rpc('venue_order_access' as never, {
    p_business_id: businessId,
    p_lat: coords?.lat ?? null,
    p_lng: coords?.lng ?? null,
  } as never);
  const d = data as { inside?: unknown; pickup_enabled?: unknown; allowed_types?: unknown } | null;
  if (error || !d) return { ...NO_VENUE_ACCESS, failed: true };
  return {
    inside: d.inside === true,
    pickupEnabled: d.pickup_enabled === true,
    allowedTypes: Array.isArray(d.allowed_types)
      ? d.allowed_types.filter((t): t is VenueOrderType => t === 'table' || t === 'counter' || t === 'gift')
      : [],
  };
}
