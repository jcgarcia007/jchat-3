/**
 * JChat 3.0 — Golden rule helper for Edge Functions (migrations 197–199).
 *
 * Inside the venue (server-verified): everything. Outside: only "counter" (pick-up) and only if
 * businesses.pickup_enabled. The verdict is the database's (venue_order_access); the functions only
 * forward the client's coordinates and reject at quote / PaymentIntent creation. This is the ONLY place the
 * rule lives: create_paid_order (service_role only, migration 198c) never re-applies it, because an order
 * that was already charged is never rejected.
 */

// deno-lint-ignore no-explicit-any
type RpcClient = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }> };

export type VenueGateCode = "outside_venue" | "pickup_disabled";

export interface VenueGateError {
  code: VenueGateCode;
  message: string;
}

/** A finite number from an unknown JSON value, else null. */
export function finiteCoord(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Asks the database whether this order type is allowed for the caller at these coordinates.
 * With an authenticated client the presence of the account counts; with the service role only
 * lat/lng does (guests). Returns null when allowed, or the error to answer with.
 * Fails CLOSED: if the check itself errors, the order is refused as outside_venue.
 */
export async function venueOrderGate(
  client: RpcClient,
  businessId: string,
  orderType: string,
  lat: number | null,
  lng: number | null,
): Promise<VenueGateError | null> {
  const { data, error } = await client.rpc("venue_order_access", {
    p_business_id: businessId,
    p_lat: lat,
    p_lng: lng,
  });
  if (error || !data) {
    console.error("[venue] venue_order_access failed:", error?.message ?? "no data");
    return { code: "outside_venue", message: "outside_venue" };
  }
  const allowed: string[] = Array.isArray(data.allowed_types) ? data.allowed_types : [];
  if (allowed.includes(orderType)) return null;
  return orderType === "counter"
    ? { code: "pickup_disabled", message: "pickup_disabled" }
    : { code: "outside_venue", message: "outside_venue" };
}
