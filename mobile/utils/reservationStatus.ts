/**
 * JChat 3.0 — pure helpers of "My reservations" (pure: runs in Node tests).
 *
 * The customer can cancel a reservation that is still pending or confirmed and has not happened yet (the database
 * agrees: reservations_customer_guard only lets a customer change status to 'cancelled'). The list is split into
 * "Upcoming" (in the future, not cancelled, rejected or expired) and "Past" (already happened, cancelled, rejected or expired).
 */

import { formatClock, monthName, weekdayName, zonedParts, type FlowLocale } from './reservationFlow';

export type ReservationStatus = 'pending' | 'confirmed' | 'arrived' | 'no_show' | 'cancelled' | 'rejected' | 'expired';

export interface ReservationLike {
  status: string;
  /** ISO timestamp of the reserved time. */
  reserved_at: string;
}

const KNOWN_STATUSES: readonly string[] = ['pending', 'confirmed', 'arrived', 'no_show', 'cancelled', 'rejected', 'expired'];

/** Why the venue rejected a request (reservations.status_reason, migration 274). */
export const REJECT_REASON_KEYS = ['no_availability', 'closed_that_day', 'group_too_large'] as const;
export type RejectReasonKey = typeof REJECT_REASON_KEYS[number];

export function isRejectReasonKey(value: unknown): value is RejectReasonKey {
  return typeof value === 'string' && (REJECT_REASON_KEYS as readonly string[]).includes(value);
}

function asMillis(now: Date | number): number {
  return typeof now === 'number' ? now : now.getTime();
}

function reservedMillis(reservation: ReservationLike): number {
  return Date.parse(reservation.reserved_at);
}

/** Pending or confirmed, and still in the future. An unreadable time cannot be cancelled. */
export function canCancel(reservation: ReservationLike, now: Date | number): boolean {
  if (reservation.status !== 'pending' && reservation.status !== 'confirmed') return false;
  const at = reservedMillis(reservation);
  return Number.isFinite(at) && at > asMillis(now);
}

/**
 * The status to SHOW (H-030, migration 277). A pending reservation whose time has already passed was never answered by the venue: until the server's cron
 * marks it 'expired' (every 10 min, 2 h after the time) it reads the same as an expired one, never "Pending confirmation".
 */
export function effectiveStatus(reservation: ReservationLike, now: Date | number): string {
  if (reservation.status !== 'pending') return reservation.status;
  const at = reservedMillis(reservation);
  return Number.isFinite(at) && at <= asMillis(now) ? 'expired' : reservation.status;
}

/** In the future and not cancelled, rejected or expired. */
export function isUpcoming(reservation: ReservationLike, now: Date | number): boolean {
  if (reservation.status === 'cancelled' || reservation.status === 'rejected' || reservation.status === 'expired') return false;
  const at = reservedMillis(reservation);
  return Number.isFinite(at) && at > asMillis(now);
}

/** i18n key (namespace `reservations`) of a status chip. An unknown status reads "Unknown", never a raw code. */
export function statusLabelKey(status: string): string {
  switch (status) {
    case 'pending':
      return 'status.pending';
    case 'confirmed':
      return 'status.confirmed';
    case 'arrived':
      return 'status.arrived';
    case 'no_show':
      return 'status.noShow';
    case 'cancelled':
      return 'status.cancelled';
    case 'rejected':
      return 'status.rejected';
    case 'expired':
      return 'status.expired';
    default:
      return 'status.unknown';
  }
}

/** Which theme colour a status chip uses: pending = warning, confirmed = success, arrived = brand, rejected = danger, the rest muted. */
export type StatusTone = 'warning' | 'success' | 'brand' | 'danger' | 'muted';

export function statusTone(status: string): StatusTone {
  if (status === 'pending') return 'warning';
  if (status === 'confirmed') return 'success';
  if (status === 'arrived') return 'brand';
  if (status === 'rejected') return 'danger';
  return 'muted';
}

export function isKnownStatus(status: string): status is ReservationStatus {
  return KNOWN_STATUSES.includes(status);
}

/** Upcoming (nearest first) and past (most recent first) lists. */
export function splitReservations<T extends ReservationLike>(
  reservations: readonly T[],
  now: Date | number,
): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const reservation of reservations) {
    (isUpcoming(reservation, now) ? upcoming : past).push(reservation);
  }
  const at = (r: T) => {
    const value = reservedMillis(r);
    return Number.isFinite(value) ? value : 0;
  };
  upcoming.sort((a, b) => at(a) - at(b));
  past.sort((a, b) => at(b) - at(a));
  return { upcoming, past };
}

/**
 * "Fri, Oct 25 · 7:00 PM" / "vie, 25 oct · 19:00": weekday, day and month from our own tables, the time by the one app rule
 * (utils/reservationFlow.ts formatClock: Spanish 24 h, English 12 h). In the VENUE's zone when given (the card and the assistant do
 * the same), else the phone's. Empty when unreadable.
 */
export function formatReservationWhen(iso: string, locale: string, timeZone?: string | null): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const lang: FlowLocale = locale.toLowerCase().startsWith('en') ? 'en' : 'es';
  const zone = timeZone || (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; } })();
  const p = zonedParts(ms, zone);
  if (!p) return '';
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d, 12)).getUTCDay();
  const weekday = weekdayName(dow, lang, 'short');
  const month = monthName(p.m - 1, lang, 'short');
  const day = lang === 'es' ? `${weekday} ${p.d} ${month}` : `${weekday}, ${month} ${p.d}`;
  return `${day} · ${formatClock(p.hour, p.minute, lang)}`;
}
