/**
 * JChat 3.0 — M1: pure helpers of the keyboard-free reservation flow (pure: runs in Node tests; no imports).
 *
 * The customer picks a date, a time slot, the party size and optional request chips, reviews, and confirms. Nothing is typed.
 *  - Dates are YYYY-MM-DD strings in the VENUE's time zone (businesses.timezone): "today" is the venue's today, not the phone's.
 *  - Slots come from the server (reservation_slots, migration 273); slotsFromHours mirrors that rule for demo mode and for the tests.
 *  - special_requests keeps a comma-separated list of KEYS ("birthday,terrace"), never free text from the app. Old reservations have
 *    free text: parseRequests tells them apart so My reservations and the dashboard can translate the keys and show the old text as is.
 */

export type FlowStep = 'date' | 'time' | 'people' | 'requests' | 'review' | 'done';
export const FLOW_STEPS: readonly FlowStep[] = ['date', 'time', 'people', 'requests', 'review', 'done'];

export type SlotStatus = 'open' | 'full';
export interface Slot {
  /** ISO instant (UTC) of the slot, as the server sent it. */
  slot_at: string;
  status: SlotStatus;
}

/** businesses.hours: {mon..sun: {open: "HH:MM", close: "HH:MM", closed: bool}} */
export type HoursMap = Record<string, { open?: string; close?: string; closed?: boolean } | undefined> | null | undefined;

export const STRIP_DAYS = 14;
/** Days a customer can book ahead (today + 60). */
export const MAX_DAYS_AHEAD = 60;
/** Slots are 30 minutes apart; nothing is offered with less than 30 minutes of notice. */
export const SLOT_STEP_MIN = 30;
export const MIN_NOTICE_MIN = 30;
export const PARTY_BASE_MAX = 8;
export const PARTY_MAX = 20;

/** The request chips, in display order. The key is what is stored in reservations.special_requests. */
export const REQUEST_KEYS = ['birthday', 'anniversary', 'terrace', 'indoor', 'high_chair', 'accessibility', 'allergies', 'quiet', 'near_tv'] as const;
export type RequestKey = typeof REQUEST_KEYS[number];

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})/;
const DOW_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

// ── dates ────────────────────────────────────────────────────────────────────

/** A real YYYY-MM-DD, or null. */
export function parseDate(date: string): { y: number; m: number; d: number } | null {
  const m = DATE_RE.exec(date);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDate(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** date + n days (calendar arithmetic, no time zone involved). */
export function addDays(date: string, n: number): string {
  const p = parseDate(date);
  if (!p) return date;
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return formatDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  const pa = parseDate(a);
  const pb = parseDate(b);
  if (!pa || !pb) return NaN;
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  const p = parseDate(date);
  return p ? new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() : 0;
}

/** A usable IANA zone: the venue's if Intl knows it, else America/New_York (the server does the same: business_tz). */
export function safeZone(tz: string | null | undefined): string {
  const zone = (tz ?? '').trim();
  if (zone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: zone });
      return zone;
    } catch {
      /* fall through */
    }
  }
  return 'America/New_York';
}

/** The venue's today (YYYY-MM-DD) at the instant `nowMs`. */
export function todayInZone(nowMs: number, tz: string | null | undefined): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: safeZone(tz), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(nowMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return formatDate(get('year'), get('month'), get('day'));
}

/** Offset (ms) of `tz` from UTC at the instant `utcMs` (positive east of Greenwich). */
function zoneOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The instant (UTC ms) of a wall-clock date + minutes-after-midnight in `tz` (minutes may exceed 1440: the next day). */
export function zonedInstant(date: string, minutes: number, tz: string | null | undefined): number | null {
  const p = parseDate(date);
  if (!p) return null;
  const zone = safeZone(tz);
  const wall = Date.UTC(p.y, p.m - 1, p.d, 0, minutes, 0);
  // two passes settle the offset around a clock change
  let guess = wall - zoneOffsetMs(wall, zone);
  guess = wall - zoneOffsetMs(guess, zone);
  return guess;
}

// ── days and slots ───────────────────────────────────────────────────────────

function toMinutes(value: string | undefined): number | null {
  const m = value ? TIME_RE.exec(value) : null;
  if (!m) return null;
  const [h, min] = [Number(m[1]), Number(m[2])];
  return h > 23 || min > 59 ? null : h * 60 + min;
}

/** The opening window of a date: [open, close] in minutes after midnight (close > 1440 when it crosses midnight), or null when closed / no hours. */
export function dayWindow(hours: HoursMap, date: string): { open: number; close: number } | null {
  if (!parseDate(date)) return null;
  const day = hours?.[DOW_KEYS[weekday(date)]];
  if (!day || day.closed === true) return null;
  const open = toMinutes(day.open);
  const close = toMinutes(day.close);
  if (open === null || close === null || open === close) return null;
  return { open, close: close < open ? close + 1440 : close };
}

/** Does the venue take reservations that day at all? (The server's reservation_slots is the authority for the slots themselves.) */
export function isDayOpen(hours: HoursMap, date: string): boolean {
  return dayWindow(hours, date) !== null;
}

/**
 * The slots of a day from hours + time zone, the same rule as reservation_slots (migration 273): every 30 minutes from `open` to `close` − 30,
 * nothing earlier than now + 30 minutes, nothing beyond today + 60 days. `full` marks the whole day (capacity is per day).
 */
export function slotsFromHours(hours: HoursMap, tz: string | null | undefined, date: string, nowMs: number, full = false): Slot[] {
  const win = dayWindow(hours, date);
  if (!win) return [];
  const today = todayInZone(nowMs, tz);
  if (daysBetween(today, date) > MAX_DAYS_AHEAD) return [];
  const out: Slot[] = [];
  for (let min = win.open; min <= win.close - SLOT_STEP_MIN; min += SLOT_STEP_MIN) {
    const at = zonedInstant(date, min, tz);
    if (at === null || at < nowMs + MIN_NOTICE_MIN * 60_000) continue;
    out.push({ slot_at: new Date(at).toISOString(), status: full ? 'full' : 'open' });
  }
  return out;
}

/** The next 14 days from the venue's today, each with whether the venue opens that day. */
export function dayStrip(hours: HoursMap, tz: string | null | undefined, nowMs: number, days = STRIP_DAYS): { date: string; open: boolean; isToday: boolean }[] {
  const today = todayInZone(nowMs, tz);
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i);
    return { date, open: isDayOpen(hours, date), isToday: i === 0 };
  });
}

export interface CalendarCell {
  date: string;
  /** Inside the bookable range (today … today + 60) and the venue opens that day. */
  selectable: boolean;
  /** Inside the range but the venue is closed. */
  closed: boolean;
  isToday: boolean;
}

/** One month of the calendar as weeks (Sunday first); null pads the first and last week. */
export function monthGrid(year: number, month: number, hours: HoursMap, tz: string | null | undefined, nowMs: number): (CalendarCell | null)[][] {
  const today = todayInZone(nowMs, tz);
  const first = formatDate(year, month, 1);
  const lead = weekday(first);
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (CalendarCell | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= length; d += 1) {
    const date = formatDate(year, month, d);
    const delta = daysBetween(today, date);
    const inRange = delta >= 0 && delta <= MAX_DAYS_AHEAD;
    const open = inRange && isDayOpen(hours, date);
    cells.push({ date, selectable: open, closed: inRange && !open, isToday: delta === 0 });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (CalendarCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** The months the calendar can show: from today's month to the month of today + 60 days. */
export function calendarMonths(tz: string | null | undefined, nowMs: number): { year: number; month: number }[] {
  const today = parseDate(todayInZone(nowMs, tz));
  const last = parseDate(addDays(todayInZone(nowMs, tz), MAX_DAYS_AHEAD));
  if (!today || !last) return [];
  const out: { year: number; month: number }[] = [];
  let y = today.y;
  let m = today.m;
  while (y < last.y || (y === last.y && m <= last.m)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** Is the picked slot still among the slots the server just returned? (Re-checked right before confirming.) */
export function slotStillAvailable(slots: Slot[], slotAt: string | null): Slot | null {
  if (!slotAt) return null;
  const t = Date.parse(slotAt);
  return slots.find((s) => Date.parse(s.slot_at) === t) ?? null;
}

// ── party size ───────────────────────────────────────────────────────────────

/** The buttons: 1–8, then "9+" which opens 9–20. */
export function partyOptions(expanded: boolean): number[] {
  const from = expanded ? PARTY_BASE_MAX + 1 : 1;
  const to = expanded ? PARTY_MAX : PARTY_BASE_MAX;
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

export function isValidParty(n: number | null): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= PARTY_MAX;
}

// ── request chips ────────────────────────────────────────────────────────────

const KEY_SET = new Set<string>(REQUEST_KEYS);

export function isRequestKey(value: string): value is RequestKey {
  return KEY_SET.has(value);
}

/** The value stored in special_requests: known keys only, no duplicates, in the chips' display order; null when none. */
export function serializeRequests(keys: readonly string[]): string | null {
  const chosen = new Set(keys.filter(isRequestKey));
  const list = REQUEST_KEYS.filter((k) => chosen.has(k));
  return list.length > 0 ? list.join(',') : null;
}

/** Toggles one chip in the selection. */
export function toggleRequest(keys: readonly RequestKey[], key: RequestKey): RequestKey[] {
  return keys.includes(key) ? keys.filter((k) => k !== key) : REQUEST_KEYS.filter((k) => k === key || keys.includes(k));
}

/**
 * special_requests as stored → what to show. All tokens known → the keys (to be translated). Anything else is an older reservation with free
 * text: shown as it is. Empty → nothing.
 */
export function parseRequests(value: string | null | undefined): { keys: RequestKey[]; legacy: string | null } {
  const text = (value ?? '').trim();
  if (text === '') return { keys: [], legacy: null };
  const tokens = text.split(',').map((s) => s.trim());
  if (tokens.every(isRequestKey)) return { keys: REQUEST_KEYS.filter((k) => tokens.includes(k)), legacy: null };
  return { keys: [], legacy: text };
}

// ── labels ───────────────────────────────────────────────────────────────────

export type FlowLocale = 'en' | 'es';

/** The time of a slot in the venue's zone ("7:00 PM" / "19:00"). */
export function slotTimeLabel(slotAt: string, tz: string | null | undefined, locale: FlowLocale): string {
  return new Intl.DateTimeFormat(locale, { timeZone: safeZone(tz), hour: 'numeric', minute: '2-digit', hour12: locale === 'en' }).format(new Date(slotAt));
}

/** "sábado 15 de noviembre" / "Saturday, November 15" — the date as the venue's calendar says it (no zone shift). */
export function longDateLabel(date: string, locale: FlowLocale): string {
  const p = parseDate(date);
  if (!p) return date;
  const at = new Date(Date.UTC(p.y, p.m - 1, p.d, 12));
  const f = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).formatToParts(at);
  const get = (type: string) => f.find((x) => x.type === type)?.value ?? '';
  return locale === 'es' ? `${get('weekday')} ${get('day')} de ${get('month')}` : `${get('weekday')}, ${get('month')} ${get('day')}`;
}

/** Short weekday of the strip ("sáb" / "Sat"). */
export function shortWeekday(date: string, locale: FlowLocale): string {
  const p = parseDate(date);
  if (!p) return '';
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short' }).format(new Date(Date.UTC(p.y, p.m - 1, p.d, 12))).replace('.', '');
}

export function monthTitle(year: number, month: number, locale: FlowLocale): string {
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, 1, 12)));
}

// ── flow state ───────────────────────────────────────────────────────────────

export interface FlowState {
  date: string | null;
  slotAt: string | null;
  slotStatus: SlotStatus | null;
  party: number | null;
  requests: RequestKey[];
}

export const EMPTY_FLOW: FlowState = { date: null, slotAt: null, slotStatus: null, party: null, requests: [] };

/** Picking another date clears the time (the slots belong to the date); everything else is kept ("Cambiar" conserves what was chosen). */
export function pickDate(state: FlowState, date: string): FlowState {
  return state.date === date ? state : { ...state, date, slotAt: null, slotStatus: null };
}

export function pickSlot(state: FlowState, slot: Slot): FlowState {
  return { ...state, slotAt: slot.slot_at, slotStatus: slot.status };
}

/** Can the flow move on from `step`? (The requests step is optional: always yes.) */
export function canContinue(state: FlowState, step: FlowStep): boolean {
  switch (step) {
    case 'date': return state.date !== null;
    case 'time': return state.slotAt !== null;
    case 'people': return isValidParty(state.party);
    case 'requests': return true;
    case 'review': return reviewReady(state);
    default: return false;
  }
}

export function reviewReady(state: FlowState): boolean {
  return state.date !== null && state.slotAt !== null && state.slotStatus !== null && isValidParty(state.party);
}

/** The step after `step` (stays on the last one). */
export function nextStep(step: FlowStep): FlowStep {
  const i = FLOW_STEPS.indexOf(step);
  return FLOW_STEPS[Math.min(FLOW_STEPS.length - 1, i + 1)];
}

/** The first step that still lacks something (where "Cambiar" or a failed confirmation sends the person). */
export function firstIncompleteStep(state: FlowState): FlowStep {
  if (state.date === null) return 'date';
  if (state.slotAt === null) return 'time';
  if (!isValidParty(state.party)) return 'people';
  return 'review';
}

/** What goes to the database for a confirmed flow. */
export function reservationPayload(state: FlowState): { reserved_at: string; party_size: number; special_requests: string | null; is_waitlist: boolean } | null {
  if (!reviewReady(state)) return null;
  return {
    reserved_at: state.slotAt as string,
    party_size: state.party as number,
    special_requests: serializeRequests(state.requests),
    is_waitlist: state.slotStatus === 'full',
  };
}

/** "A nombre de …": the profile's display name, else @username, else nothing. */
export function bookingName(profile: { display_name?: string | null; username?: string | null } | null | undefined): string | null {
  const display = (profile?.display_name ?? '').trim();
  if (display) return display;
  const username = (profile?.username ?? '').trim().replace(/^@/, '');
  return username ? `@${username}` : null;
}
