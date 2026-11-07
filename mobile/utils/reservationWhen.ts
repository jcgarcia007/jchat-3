/**
 * The date and time of a cancelled reservation in the VENUE's time zone (pure; a Node test drives it). Never throws: an unknown zone or an engine
 * without Intl time-zone support falls back to the device zone, and an unreadable date to an empty string.
 */
export function formatReservationWhen(
  reservedAtIso: unknown,
  timeZone: unknown,
  language: string,
): { date: string; time: string } | null {
  if (typeof reservedAtIso !== 'string') return null;
  const d = new Date(reservedAtIso);
  if (Number.isNaN(d.getTime())) return null;
  const locale = language === 'en' ? 'en-US' : 'es-US';
  const tz = typeof timeZone === 'string' && timeZone ? timeZone : undefined;
  const make = (zone: string | undefined) => ({
    date: new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: zone }).format(d),
    time: new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: zone }).format(d),
  });
  try {
    return make(tz);
  } catch {
    try {
      return make(undefined);
    } catch {
      return null;
    }
  }
}
