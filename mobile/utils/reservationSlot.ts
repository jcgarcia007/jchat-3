/**
 * JChat 3.0 — pure helpers of the reservation "day is full" check (pure: runs in Node tests).
 *
 * ReservationScreen asks the server (reservation_slot_load, migration 237) how many reservations a venue has that day
 * and its capacity. The customer can only SEE their own reservations (RLS), so the count has to come from the server.
 * capacity null = the venue set no limit: the day is never full.
 */

/**
 * The instant sent to reservation_slot_load for a date typed as YYYY-MM-DD: noon of that day in the phone's time zone,
 * as an ISO string. The server counts the day of that instant, and noon stays on the same date for almost every time
 * zone (a midnight would slip to the day before or after). Null when the date is not a real date.
 */
export function slotRequestInstant(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const noon = new Date(`${date}T12:00:00`);
  return Number.isNaN(noon.getTime()) ? null : noon.toISOString();
}

/** Is the day full? reserved / capacity as the server sent them (either may be null / missing / text). */
export function isSlotFull(reserved: unknown, capacity: unknown): boolean {
  const cap = capacity === null || capacity === undefined ? NaN : Number(capacity);
  if (!Number.isFinite(cap) || cap <= 0) return false; // no limit set (or an unusable value): never full
  const taken = reserved === null || reserved === undefined ? 0 : Number(reserved);
  if (!Number.isFinite(taken) || taken < 0) return false;
  return taken >= cap;
}
