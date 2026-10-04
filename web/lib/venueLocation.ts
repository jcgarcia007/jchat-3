/**
 * JChat 3.0 — Golden rule, web side (migrations 197–199).
 *
 * The browser only asks for coordinates and forwards them; whether the person is inside the venue is
 * decided by the SERVER (venue_order_access / join_room_via_qr). Outside the area or without location
 * permission the web shows a reduced hub: view the menu and (if the owner allows) order for pick-up.
 */

import { untypedDb } from "./untypedDb"; // venue_* RPCs are not in the generated types

export interface VenuePosition {
  lat: number;
  lng: number;
}

export type LocationFailure = "denied" | "unavailable" | "timeout" | "unsupported";

export type PositionResult =
  | { ok: true; pos: VenuePosition }
  | { ok: false; reason: LocationFailure };

export type OrderType = "table" | "counter" | "gift";

export interface VenueOrderAccess {
  inside: boolean;
  pickup_enabled: boolean;
  allowed_types: OrderType[];
}

const CACHE_KEY = "jchat.venuePos";
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Last position read in this tab (sessionStorage), if fresh — avoids re-prompting between /t, /c and /m. */
export function getCachedPosition(): VenuePosition | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { lat?: unknown; lng?: unknown; at?: unknown };
    if (typeof v.lat !== "number" || typeof v.lng !== "number" || typeof v.at !== "number") return null;
    return Date.now() - v.at <= CACHE_TTL_MS ? { lat: v.lat, lng: v.lng } : null;
  } catch {
    return null;
  }
}

function cachePosition(pos: VenuePosition): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...pos, at: Date.now() }));
  } catch {
    // private mode: non-fatal
  }
}

/** Reads the browser position (prompts the user if needed). Never throws. */
export function requestPosition(opts: { useCache?: boolean } = {}): Promise<PositionResult> {
  if (opts.useCache !== false) {
    const cached = getCachedPosition();
    if (cached) return Promise.resolve({ ok: true, pos: cached });
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ ok: false, reason: "unsupported" });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        cachePosition(pos);
        resolve({ ok: true, pos });
      },
      (err) =>
        resolve({
          ok: false,
          reason: err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable",
        }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

/**
 * What the person may do at this venue BEFORE quoting/paying anything. Works with an account (its venue
 * presence counts) and without one (only lat/lng). Fails closed to "nothing allowed" on any error.
 */
export async function fetchVenueOrderAccess(businessId: string, pos: VenuePosition | null): Promise<VenueOrderAccess> {
  const { data, error } = await untypedDb.rpc("venue_order_access", {
    p_business_id: businessId,
    p_lat: pos?.lat ?? null,
    p_lng: pos?.lng ?? null,
  });
  const d = data as Partial<VenueOrderAccess> | null;
  if (error || !d) return { inside: false, pickup_enabled: false, allowed_types: [] };
  return {
    inside: d.inside === true,
    pickup_enabled: d.pickup_enabled === true,
    allowed_types: Array.isArray(d.allowed_types) ? d.allowed_types : [],
  };
}

/** The stable error code of a failed Edge Function call ({code} or {error:{code}}), lower-cased. */
export async function readFunctionErrorCode(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown })?.context as { clone?: () => { json: () => Promise<unknown> }; json?: () => Promise<unknown> } | undefined;
  if (!ctx) return null;
  try {
    const source = typeof ctx.clone === "function" ? ctx.clone() : ctx;
    const body = (await (source as { json: () => Promise<unknown> }).json()) as {
      code?: unknown;
      error?: { code?: unknown } | string;
    };
    const code = typeof body?.code === "string" ? body.code : typeof body?.error === "object" ? body.error?.code : null;
    return typeof code === "string" ? code.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** i18n key (namespace "venue") for a golden-rule error code, or null if it isn't one. */
export function venueErrorKey(code: string | null | undefined): string | null {
  switch ((code ?? "").toLowerCase()) {
    case "outside_venue":
    case "not_in_venue":
      return "outsideVenue";
    case "pickup_disabled":
      return "pickupDisabled";
    case "call_already_open":
      return "callAlreadyOpen";
    case "blocked_24h":
      return "blocked24h";
    default:
      return null;
  }
}
