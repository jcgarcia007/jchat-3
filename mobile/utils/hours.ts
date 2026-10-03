/**
 * Business opening hours — the single place that reads businesses.hours.
 *
 * Stored shape (web dashboard, JSONB): { mon..sun: { open: "HH:MM", close: "HH:MM", closed: boolean } };
 * "all day" is 00:00–23:59. The data comes from the database, so NOTHING here trusts it:
 * a missing/odd entry gives status 'unknown' (shown as "Horario no disponible"), never a crash.
 *
 * Uses the device's local clock (a business time zone does not exist in the schema).
 */

export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface DayHours {
  open: string;
  close: string;
  closed?: boolean;
}

export type HoursMap = Partial<Record<DayKey, DayHours>>;

/** 'unknown' = the hours can't be read or don't cover today: not confirmed open, not claimed closed. */
export type OpenStatus = 'open' | 'closed' | 'unknown';

/** Index = Date.getDay() (0 = Sunday). */
export const DAY_ORDER: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const MINUTES_PER_DAY = 24 * 60;

/** "HH:MM" → minutes since midnight, or null when it is not a valid time ("24:00" counts as 1440). */
export function parseTimeToMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59) return null;
  if (hours === 24 && minutes === 0) return MINUTES_PER_DAY;
  if (hours > 23) return null;
  return hours * 60 + minutes;
}

type ParsedDay =
  | { kind: 'closed' }
  | { kind: 'range'; open: number; close: number }
  | { kind: 'invalid' };

function parseDay(entry: unknown): ParsedDay {
  if (!entry || typeof entry !== 'object') return { kind: 'invalid' };
  const day = entry as Record<string, unknown>;
  if (day.closed === true) return { kind: 'closed' };
  const open = parseTimeToMinutes(day.open);
  const close = parseTimeToMinutes(day.close);
  if (open === null || close === null || open === close) return { kind: 'invalid' };
  return { kind: 'range', open, close };
}

/** 00:00–23:59 (or 24:00) is how the dashboard stores "open all day". */
function isAllDay(range: { open: number; close: number }): boolean {
  return range.open === 0 && range.close >= MINUTES_PER_DAY - 1;
}

export function getOpenStatus(hours: unknown, now: Date = new Date()): OpenStatus {
  if (!hours || typeof hours !== 'object') return 'unknown';
  const map = hours as Record<string, unknown>;
  const today = parseDay(map[DAY_ORDER[now.getDay()]]);
  const yesterday = parseDay(map[DAY_ORDER[(now.getDay() + 6) % 7]]);
  const minutes = now.getHours() * 60 + now.getMinutes();

  // Yesterday's overnight shift (e.g. Fri 22:00–02:00) still covers the early hours of today.
  if (yesterday.kind === 'range' && yesterday.close < yesterday.open && minutes < yesterday.close) {
    return 'open';
  }

  if (today.kind === 'invalid') return 'unknown';
  if (today.kind === 'closed') return 'closed';
  if (isAllDay(today)) return 'open';
  if (today.close > today.open) {
    return minutes >= today.open && minutes < today.close ? 'open' : 'closed';
  }
  // Overnight shift that starts today (e.g. 18:00–02:00): open from the opening time to midnight.
  return minutes >= today.open ? 'open' : 'closed';
}

export function isOpenNow(hours: unknown, now: Date = new Date()): boolean {
  return getOpenStatus(hours, now) === 'open';
}

/** "09:00" → "9:00 AM" / "9:00" following the locale. Null when the value is not a valid time. */
export function formatHourLabel(time24: unknown, locale: string): string | null {
  const total = parseTimeToMinutes(time24);
  if (total === null) return null;
  try {
    const date = new Date(Date.UTC(2023, 0, 1, Math.floor(total / 60) % 24, total % 60));
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(date);
  } catch {
    return null;
  }
}

/** The text for a day's row in the hours grid, or null when the entry can't be read. */
export function formatDayRange(entry: unknown, locale: string): { kind: 'closed' } | { kind: 'range'; text: string } | { kind: 'unknown' } {
  const day = parseDay(entry);
  if (day.kind === 'closed') return { kind: 'closed' };
  if (day.kind === 'invalid') return { kind: 'unknown' };
  const open = formatHourLabel(entry && (entry as DayHours).open, locale);
  const close = formatHourLabel(entry && (entry as DayHours).close, locale);
  return open && close ? { kind: 'range', text: `${open} – ${close}` } : { kind: 'unknown' };
}
