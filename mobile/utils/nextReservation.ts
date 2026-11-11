/**
 * JChat 3.0 — M3: "Your next reservation" (pure: runs in Node tests).
 *
 * The card shows the nearest reservation that is still pending or confirmed and starts no earlier than two hours ago. It leaves on its own: when the
 * reservation is cancelled, rejected, marked arrived / no-show, or two hours after its time. Dates are the VENUE's calendar and clock (its time zone),
 * never the phone's, like the booking flow (utils/reservationFlow.ts).
 */

import { daysBetween, safeZone, slotTimeLabel, todayInZone, type FlowLocale } from './reservationFlow';

/** How long after its time a reservation stays on the card. */
export const CARD_GRACE_MS = 2 * 60 * 60 * 1000;

export interface NextReservationLike {
  status: string;
  /** ISO timestamp of the reserved time. */
  reserved_at: string;
}

function reservedMs(r: NextReservationLike): number {
  return Date.parse(r.reserved_at);
}

/** The instant the reservation leaves the card (its time + 2 h). NaN when the time is unreadable. */
export function expiresAtMs(r: NextReservationLike): number {
  return reservedMs(r) + CARD_GRACE_MS;
}

/** Pending or confirmed, and not yet two hours past its time. An unreadable time never shows. */
export function isOnCard(r: NextReservationLike, nowMs: number): boolean {
  if (r.status !== 'pending' && r.status !== 'confirmed') return false;
  const expires = expiresAtMs(r);
  return Number.isFinite(expires) && expires > nowMs;
}

/** The nearest reservation for the card and how many other ones are also coming ("and 1 more"). */
export function pickNext<T extends NextReservationLike>(rows: readonly T[], nowMs: number): { next: T | null; more: number } {
  const live = rows.filter((r) => isOnCard(r, nowMs)).sort((a, b) => reservedMs(a) - reservedMs(b));
  return { next: live[0] ?? null, more: Math.max(0, live.length - 1) };
}

/** Milliseconds until the card must be re-evaluated (the shown reservation expires), or null when nothing is shown. Never below 1 s nor above 24 h. */
export function msUntilCardChanges(rows: readonly NextReservationLike[], nowMs: number): number | null {
  const { next } = pickNext(rows, nowMs);
  if (!next) return null;
  return Math.min(24 * 60 * 60 * 1000, Math.max(1000, expiresAtMs(next) - nowMs));
}

/** "Sat, Nov 15" / "sáb 15 nov": the short date of the venue's calendar day (no zone shift). */
export function shortDateLabel(date: string, locale: FlowLocale): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  const at = new Date(Date.UTC(y, m - 1, d, 12));
  const parts = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(at);
  const get = (type: string) => (parts.find((p) => p.type === type)?.value ?? '').replace(/\.$/, '');
  return locale === 'es' ? `${get('weekday')} ${get('day')} ${get('month')}` : `${get('weekday')}, ${get('month')} ${get('day')}`;
}

export interface WhenWords {
  today: string;
  tomorrow: string;
}

/** "Today 8:00 PM" / "Hoy 20:00" · "Tomorrow …" · "Sat, Nov 15 · 8:00 PM". The day words come from i18n (the card passes its translations). */
export function nextWhenLabel(iso: string, tz: string | null | undefined, nowMs: number, locale: FlowLocale, words: WhenWords): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const zone = safeZone(tz);
  const time = slotTimeLabel(iso, zone, locale);
  const day = todayInZone(at, zone);
  const diff = daysBetween(todayInZone(nowMs, zone), day);
  if (diff === 0) return `${words.today} ${time}`;
  if (diff === 1) return `${words.tomorrow} ${time}`;
  return `${shortDateLabel(day, locale)} · ${time}`;
}

/** A link that opens directions to the venue in the phone's maps app (Google Maps on Android, the browser / Maps app on iOS). Null without coordinates. */
export function directionsUrl(lat: unknown, lng: unknown): string | null {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
