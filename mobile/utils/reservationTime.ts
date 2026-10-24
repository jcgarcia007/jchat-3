/**
 * JChat 3.0 — the reserved time of a reservation (pure: runs in Node tests).
 *
 * The customer types a date (YYYY-MM-DD) and a time (HH:MM) in the PHONE's time zone. The instant sent to the database
 * must carry that zone: reservedAtIso builds the local date-time and returns toISOString() ("2026-10-25T23:00:00.000Z"
 * for 19:00 in New York in summer). Sending "2026-10-25T19:00:00" without a zone made Postgres read it as UTC, so the
 * venue saw 3:00 pm instead of 7:00 pm.
 *
 * TODO(timezone): use the venue's time zone when the column exists (a customer booking from another zone would then
 * type the venue's local time).
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

/**
 * The instant of `date` + `time` in the phone's local time zone, as an ISO string (UTC, with the zone folded in).
 * Null when either text is not a real date / time, including a local time that does not exist (a clock that jumps
 * forward: 2:30 am on the spring-forward day).
 */
export function reservedAtIso(date: string, time: string): string | null {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time);
  if (!d || !t) return null;
  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hour, minute] = [Number(t[1]), Number(t[2])];
  const local = new Date(year, month - 1, day, hour, minute, 0, 0);
  // Date rolls an impossible value over (Feb 30 → Mar 2, 25:00 → next day, a skipped hour → the next one): not the same
  // numbers back means the input was not a real local date-time.
  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day ||
    local.getHours() !== hour ||
    local.getMinutes() !== minute
  ) {
    return null;
  }
  return local.toISOString();
}

/** True when the reserved time (local) is after `now`. An invalid date / time is never in the future. */
export function isFutureReservation(date: string, time: string, now: Date | number): boolean {
  const iso = reservedAtIso(date, time);
  if (!iso) return false;
  return Date.parse(iso) > (typeof now === 'number' ? now : now.getTime());
}
