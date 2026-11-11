/**
 * JChat 3.0 — M3: the reservation states the dashboard works with (migration 274) and the small rules around them.
 *
 * pending → confirmed | rejected (the venue answers a request) · confirmed → rejected · pending | confirmed → arrived | no_show | cancelled.
 * The server (set_reservation_status / reject_reservation) enforces the same transitions; these helpers only decide what the screen offers.
 */

export const RESERVATION_STATUSES = ["pending", "confirmed", "arrived", "no_show", "cancelled", "rejected"] as const;
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

/** Requests waiting for an answer (the number on the menu and on the "Pending" filter). */
export function countPending(reservations: ReadonlyArray<{ status: string }>): number {
  return reservations.filter((r) => r.status === "pending").length;
}
