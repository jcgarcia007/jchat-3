import { dateWithYearLabel, formatClock, monthName, weekdayName, type FlowLocale } from './reservationFlow';

/**
 * JChat 3.0 — Lote G: times and dates in the PHONE's own clock, written by THE one clock rule of the app (H-028 / H-032, utils/reservationFlow.ts):
 * Spanish 24 h ("20:00"), English 12 h ("8:00 PM"), from our own tables. Never toLocaleTimeString / toLocaleString / Intl hour12: Hermes (Android),
 * iOS and the server render those differently (and an English phone in Spanish, or the other way round, read the wrong clock).
 * Pure: a Node test drives it. Never throws: an unreadable date gives ''.
 */

/** The language of the app as the flow helpers know it: English for "en…", Spanish for everything else (the app has only es / en). */
export function clockLocale(language: string | null | undefined): FlowLocale {
  return typeof language === 'string' && language.toLowerCase().startsWith('en') ? 'en' : 'es';
}

function toDate(input: unknown): Date | null {
  const d = input instanceof Date ? input : typeof input === 'string' || typeof input === 'number' ? new Date(input) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/** "20:00" / "8:00 PM" — the time of day on the phone's clock. */
export function formatLocalTime(input: unknown, language: string | null | undefined): string {
  const d = toDate(input);
  return d ? formatClock(d.getHours(), d.getMinutes(), clockLocale(language)) : '';
}

/** "23 nov, 20:00" / "Nov 23, 8:00 PM" — a short day and time (lists). */
export function formatLocalDayTime(input: unknown, language: string | null | undefined): string {
  const d = toDate(input);
  if (!d) return '';
  const locale = clockLocale(language);
  const month = monthName(d.getMonth(), locale, 'short');
  const day = d.getDate();
  const time = formatClock(d.getHours(), d.getMinutes(), locale);
  return locale === 'es' ? `${day} ${month}, ${time}` : `${month} ${day}, ${time}`;
}

/** "23 de noviembre de 2026, 20:00" / "November 23, 2026, 8:00 PM" — the full date and time. */
export function formatLocalDateTime(input: unknown, language: string | null | undefined): string {
  const d = toDate(input);
  if (!d) return '';
  const locale = clockLocale(language);
  return `${dateWithYearLabel(d.getFullYear(), d.getMonth() + 1, d.getDate(), locale)}, ${formatClock(d.getHours(), d.getMinutes(), locale)}`;
}

/** "sábado 23 de noviembre de 2026, 20:00" / "Saturday, November 23, 2026, 8:00 PM" — the long date with the weekday and the time (event details). */
export function formatLocalLongDateTime(input: unknown, language: string | null | undefined): string {
  const d = toDate(input);
  if (!d) return '';
  const locale = clockLocale(language);
  const weekday = weekdayName(d.getDay(), locale);
  const when = formatLocalDateTime(d, language);
  return locale === 'es' ? `${weekday} ${when}` : `${weekday}, ${when}`;
}
