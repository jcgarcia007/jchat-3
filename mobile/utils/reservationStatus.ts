/**
 * JChat 3.0 — pure helpers of "My reservations" (pure: runs in Node tests).
 *
 * The customer can cancel a reservation that is still pending or confirmed and has not happened yet (the database
 * agrees: reservations_customer_guard only lets a customer change status to 'cancelled'). The list is split into
 * "Upcoming" (in the future, not cancelled) and "Past" (already happened, or cancelled).
 */

import { format12h } from './hours';

export type ReservationStatus = 'pending' | 'confirmed' | 'arrived' | 'no_show' | 'cancelled';

export interface ReservationLike {
  status: string;
  /** ISO timestamp of the reserved time. */
  reserved_at: string;
}

const KNOWN_STATUSES: readonly string[] = ['pending', 'confirmed', 'arrived', 'no_show', 'cancelled'];

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

/** In the future and not cancelled. */
export function isUpcoming(reservation: ReservationLike, now: Date | number): boolean {
  if (reservation.status === 'cancelled') return false;
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
    default:
      return 'status.unknown';
  }
}

/** Which theme colour a status chip uses: pending = warning, confirmed = success, arrived = brand, the rest muted. */
export type StatusTone = 'warning' | 'success' | 'brand' | 'muted';

export function statusTone(status: string): StatusTone {
  if (status === 'pending') return 'warning';
  if (status === 'confirmed') return 'success';
  if (status === 'arrived') return 'brand';
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
 * "Fri, Oct 25 · 7:00 pm" / "vie, 25 oct · 7:00 pm": weekday, day and month in the locale, the time as 12 h with
 * am / pm (utils/hours.ts format12h, the same everywhere), both in the phone's time zone. Empty when unreadable.
 */
export function formatReservationWhen(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  let day: string;
  try {
    day = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
  } catch {
    day = date.toDateString();
  }
  const time = format12h(date.getHours() * 60 + date.getMinutes());
  return time ? `${day} · ${time}` : day;
}
