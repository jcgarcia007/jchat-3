/**
 * JChat 3.0 — pure helpers for the weekly-hours editor of the business registration wizard.
 *
 * The stored shape does not change: { [day]: { open: "HH:MM", close: "HH:MM", closed: boolean } } (businesses.hours JSON).
 * "Open 24 h" is not a new field: it is 00:00–23:59, the same value the dashboard editor already treats as "all day".
 * Unit-tested in scripts/business-hours.test.mjs.
 */

export interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}

export const OPEN_24H_OPEN = '00:00';
export const OPEN_24H_CLOSE = '23:59';

/** A day open round the clock: not closed, 00:00–23:59. */
export function isOpen24h(day: DayHours): boolean {
  return !day.closed && day.open === OPEN_24H_OPEN && day.close === OPEN_24H_CLOSE;
}

/** Closes after midnight (close earlier than open, e.g. 18:00 → 02:00): the UI says "closes the next day". "HH:MM" compares as text. */
export function isOvernight(day: DayHours): boolean {
  if (day.closed || !day.open || !day.close) return false;
  return day.close < day.open;
}

/**
 * Copies open / close of the first open day (in `order`) to every OTHER open day. Closed days stay closed and keep their times;
 * with no open day nothing changes. Returns a new object.
 */
export function copyHoursToAll<K extends string>(hours: Record<K, DayHours>, order: readonly K[]): Record<K, DayHours> {
  const source = order.find((k) => !hours[k].closed);
  if (source === undefined) return { ...hours };
  const { open, close } = hours[source];
  const next = { ...hours };
  for (const k of order) {
    if (!hours[k].closed) next[k] = { ...hours[k], open, close };
  }
  return next;
}

/**
 * Turns "open 24 h" on (00:00–23:59, day open) or off (back to `previous` — the times the day had before — or to `fallback`).
 * Switching off never leaves 00:00–23:59 behind.
 */
export function setOpen24h(
  day: DayHours,
  on: boolean,
  previous: { open: string; close: string } | null,
  fallback: { open: string; close: string },
): DayHours {
  if (on) return { open: OPEN_24H_OPEN, close: OPEN_24H_CLOSE, closed: false };
  const back = previous && !(previous.open === OPEN_24H_OPEN && previous.close === OPEN_24H_CLOSE) ? previous : fallback;
  return { open: back.open, close: back.close, closed: day.closed };
}
