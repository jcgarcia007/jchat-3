/**
 * Business opening hours — the single place that reads businesses.hours.
 *
 * Stored shape (web dashboard, JSONB): { mon..sun: { open: "HH:MM", close: "HH:MM", closed: boolean } };
 * "all day" is 00:00–23:59. The data comes from the database, so NOTHING here trusts it:
 * a missing/odd entry gives status 'unknown' (shown as "Horario no disponible"), never a crash.
 *
 * The clock is the BUSINESS's (businesses.timezone, IANA; the server's business_is_open_now reads it the same way): pass `timeZone`.
 *   - a zone string  → the wall clock in that zone (blank → 'America/New_York', like the server)
 *   - undefined       → the device's local clock (callers that have no zone to give; kept for them)
 *   - a zone Intl does not know → the status is 'unknown' (the server answers NULL there): never a crash, never "closed".
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

/** The zone used when a business has none (the server does the same; every venue is there today). */
export const DEFAULT_TIME_ZONE = 'America/New_York';

/** A wall-clock reading: Date.getDay()-style weekday (0 = Sunday) and minutes since midnight. */
interface Clock {
  day: number;
  minutes: number;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * The wall clock at `now` in `timeZone`; the device's own clock when `timeZone` is undefined. Null when the zone is unknown to Intl
 * (the caller treats the hours as unknown). Uses Intl only (no library); formatters are cached per zone.
 */
function clockIn(now: Date, timeZone?: string | null): Clock | null {
  if (timeZone === undefined) return { day: now.getDay(), minutes: now.getHours() * 60 + now.getMinutes() };
  const zone = typeof timeZone === 'string' && timeZone.trim() !== '' ? timeZone.trim() : DEFAULT_TIME_ZONE;
  try {
    let formatter = formatters.get(zone);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      formatters.set(zone, formatter);
    }
    let weekday = '';
    let hour = NaN;
    let minute = NaN;
    for (const part of formatter.formatToParts(now)) {
      if (part.type === 'weekday') weekday = part.value;
      else if (part.type === 'hour') hour = Number(part.value);
      else if (part.type === 'minute') minute = Number(part.value);
    }
    const day = WEEKDAY_INDEX[weekday];
    if (day === undefined || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return { day, minutes: (hour % 24) * 60 + minute };
  } catch {
    return null;
  }
}

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

export function getOpenStatus(hours: unknown, now: Date = new Date(), timeZone?: string | null): OpenStatus {
  if (!hours || typeof hours !== 'object') return 'unknown';
  const clock = clockIn(now, timeZone);
  if (!clock) return 'unknown';
  const map = hours as Record<string, unknown>;
  const today = parseDay(map[DAY_ORDER[clock.day]]);
  const yesterday = parseDay(map[DAY_ORDER[(clock.day + 6) % 7]]);
  const minutes = clock.minutes;

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

export function isOpenNow(hours: unknown, now: Date = new Date(), timeZone?: string | null): boolean {
  return getOpenStatus(hours, now, timeZone) === 'open';
}

/**
 * A time written by THE one clock rule of the app (H-028 / H-032, the same as utils/reservationFlow.ts formatClock; scripts/hours-clock-rule.test.mjs
 * keeps the two equal): Spanish 24 h ("20:00", "02:00"), English 12 h ("8:00 PM", "2:00 AM"). Written by hand, never with Intl hour12:
 * Hermes (Android) and the server render those differently. Takes "HH:MM" or minutes since midnight (1440, "24:00" → midnight). Null when it is not a valid time.
 */
export function formatClockLabel(time: unknown, locale: string): string | null {
  const total = typeof time === 'number' ? time : parseTimeToMinutes(time);
  if (total === null || !Number.isFinite(total) || total < 0 || total > MINUTES_PER_DAY) return null;
  const hour = Math.floor(total / 60) % 24;
  const minute = Math.floor(total) % 60;
  const mm = String(minute).padStart(2, '0');
  if (String(locale).toLowerCase().startsWith('es')) return `${String(hour).padStart(2, '0')}:${mm}`;
  return `${hour % 12 === 0 ? 12 : hour % 12}:${mm} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** The full weekday name in the locale for Date.getDay()-style index (0 = Sunday): "lunes" / "Monday". */
export function weekdayName(dayIndex: number, locale: string): string {
  try {
    // 2023-01-01 is a Sunday: only a reference date to format weekday names.
    return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + (((dayIndex % 7) + 7) % 7))));
  } catch {
    return DAY_ORDER[((dayIndex % 7) + 7) % 7];
  }
}

/**
 * The closing time while the business is open now ("2:00 AM" / "02:00"), or null when it is not open, when the hours can't be
 * read, or when it is open all day. Handles the cut after midnight: 20:00–02:00 closes at 2:00 the next morning,
 * and at 1:00 that morning it still reads the shift that started yesterday.
 */
export function closesAtLabel(hours: unknown, locale: string, now: Date = new Date(), timeZone?: string | null): string | null {
  if (getOpenStatus(hours, now, timeZone) !== 'open') return null;
  const clock = clockIn(now, timeZone);
  if (!clock) return null;
  const map = hours as Record<string, unknown>;
  const today = parseDay(map[DAY_ORDER[clock.day]]);
  const yesterday = parseDay(map[DAY_ORDER[(clock.day + 6) % 7]]);
  const minutes = clock.minutes;
  if (yesterday.kind === 'range' && yesterday.close < yesterday.open && minutes < yesterday.close) {
    return formatClockLabel(yesterday.close, locale);
  }
  if (today.kind === 'range' && !isAllDay(today)) return formatClockLabel(today.close, locale);
  return null;
}

/** When the business opens next: the time ("6:00 PM" / "18:00") and the day it is on. */
export interface OpensAt {
  time: string;
  /** 'today' (later today), 'tomorrow', or 'later' (another day: dayIndex says which). */
  when: 'today' | 'tomorrow' | 'later';
  /** Date.getDay()-style index (0 = Sunday) of the opening day. */
  dayIndex: number;
}

/**
 * The next opening while the business is closed now: the time ("6:00 PM" / "18:00") and the day (later today, tomorrow or
 * another weekday up to a week ahead). Null when it is open, when the hours can't be read ('unknown' is not
 * "closed") or when no day has an opening time.
 */
export function opensAtLabel(hours: unknown, locale: string, now: Date = new Date(), timeZone?: string | null): OpensAt | null {
  if (getOpenStatus(hours, now, timeZone) !== 'closed') return null;
  const clock = clockIn(now, timeZone);
  if (!clock) return null;
  const map = hours as Record<string, unknown>;
  const minutes = clock.minutes;
  for (let offset = 0; offset <= 7; offset += 1) {
    const dayIndex = (clock.day + offset) % 7;
    const day = parseDay(map[DAY_ORDER[dayIndex]]);
    if (day.kind !== 'range') continue;
    if (offset === 0 && day.open <= minutes) continue; // today's opening already passed
    const time = formatClockLabel(day.open, locale);
    if (!time) continue;
    return { time, when: offset === 0 ? 'today' : offset === 1 ? 'tomorrow' : 'later', dayIndex };
  }
  return null;
}

/** The text for a day's row in the hours grid, or null when the entry can't be read. */
export function formatDayRange(entry: unknown, locale: string): { kind: 'closed' } | { kind: 'range'; text: string } | { kind: 'unknown' } {
  const day = parseDay(entry);
  if (day.kind === 'closed') return { kind: 'closed' };
  if (day.kind === 'invalid') return { kind: 'unknown' };
  // The one clock rule: Spanish 24 h, English 12 h (the same as the status chip of the card).
  const open = formatClockLabel(entry && (entry as DayHours).open, locale);
  const close = formatClockLabel(entry && (entry as DayHours).close, locale);
  return open && close ? { kind: 'range', text: `${open} – ${close}` } : { kind: 'unknown' };
}

/** Date.getDay()-style index (0 = Sunday) of "today" in the business's zone (the device's own day when no zone is given); null if the zone is unknown. */
export function todayIndexIn(now: Date = new Date(), timeZone?: string | null): number | null {
  return clockIn(now, timeZone)?.day ?? null;
}
