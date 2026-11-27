import { reservationWhenParts } from './reservationFlow';

/**
 * The date and time of a reservation notice in the VENUE's time zone (pure; a Node test drives it). Same rule as the rest of the app (H-028 / H-032):
 * Spanish "23 de noviembre de 2026" + "20:00", English "November 23, 2026" + "8:00 PM", from our own tables (no Intl dateStyle / timeStyle).
 * Never throws: an unknown zone falls back to America/New_York (safeZone, like the server) and an unreadable date to null.
 */
export function formatReservationWhen(
  reservedAtIso: unknown,
  timeZone: unknown,
  language: string,
): { date: string; time: string } | null {
  return reservationWhenParts(reservedAtIso, typeof timeZone === 'string' ? timeZone : null, language.toLowerCase().startsWith('en') ? 'en' : 'es');
}
