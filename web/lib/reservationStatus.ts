/**
 * JChat 3.0 — M3: the reservation states the dashboard works with (migration 274) and the small rules around them.
 *
 * pending → confirmed | rejected (the venue answers a request) · confirmed → rejected · pending | confirmed → arrived | no_show | cancelled.
 * Lote 2 (migration 277): a pending request nobody answered expires 2 h after its time (cron every 10 min) → "expired", terminal: no action applies.
 * The server (set_reservation_status / reject_reservation) enforces the same transitions; these helpers only decide what the screen offers.
 */

export const RESERVATION_STATUSES = ["pending", "confirmed", "arrived", "no_show", "cancelled", "rejected", "expired"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];
export type FilterStatus = "all" | ReservationStatus;

/** The keys of the rejection reasons (reservations.status_reason). Translated in messages › dashboardCommon › resReject_<key>. */
export const REJECT_REASONS = ["no_availability", "closed_that_day", "group_too_large"] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export function isRejectReason(value: unknown): value is RejectReason {
  return typeof value === "string" && (REJECT_REASONS as readonly string[]).includes(value);
}

/** The venue can confirm only a request that is still waiting. */
export function canConfirm(status: ReservationStatus): boolean {
  return status === "pending";
}

/** ... and can reject a request that is waiting or was already confirmed. */
export function canReject(status: ReservationStatus): boolean {
  return status === "pending" || status === "confirmed";
}

/** Still ahead of the venue: the edit / check-in actions apply. */
export function isLive(status: ReservationStatus): boolean {
  return status === "pending" || status === "confirmed";
}

export function matchesFilter(status: ReservationStatus, filter: FilterStatus): boolean {
  return filter === "all" || status === filter;
}

/**
 * The status to SHOW and act on (H-030 / H-059). A pending request whose time has already passed was never answered: until the cron marks it
 * "expired" it reads and behaves like an expired one (no Confirm, no check-in, not counted as waiting). Without a time the status is returned as it is.
 */
export function effectiveStatus(status: ReservationStatus, reservedAt?: string | null, nowMs: number = Date.now()): ReservationStatus {
  if (status !== "pending" || !reservedAt) return status;
  const at = Date.parse(reservedAt);
  return Number.isFinite(at) && at <= nowMs ? "expired" : status;
}

/** Requests waiting for an answer (the number on the "Pending" filter). A pending one whose time has passed is not waiting any more. */
export function countPending(reservations: ReadonlyArray<{ status: string; reserved_at?: string | null }>, nowMs: number = Date.now()): number {
  return reservations.filter((r) => effectiveStatus(r.status as ReservationStatus, r.reserved_at, nowMs) === "pending").length;
}
