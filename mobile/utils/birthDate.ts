/**
 * JChat 3.0 — birth date typed in three boxes (pure: no React, no I/O, runs in Node tests).
 *
 * ConfirmAgeScreen shows Day / Month / Year boxes instead of a calendar. This turns what was typed into a real local
 * `Date`, tells why it is not one yet, and splits a pasted date over the boxes. It never states or checks an age: that is
 * the server's job (rpc confirm_age); here a date only has to exist and not be in the future.
 */

export interface DateParts {
  day: string;
  month: string;
  year: string;
}

/** Order of the boxes on screen: day-month-year (es) or month-day-year (en). */
export type FieldOrder = 'dmy' | 'mdy';

export type BirthDateResult =
  | { ok: true; date: Date }
  | { ok: false; reason: 'incomplete' | 'invalid' | 'future' };

const MIN_YEAR = 1900;
const DIGITS = /^\d+$/;

/**
 * - incomplete: a box is empty or the year has fewer than 4 digits (still typing)
 * - invalid:    not a date that exists (day 00, 31/04, 29/02 in a non-leap year, month 13, year before 1900, non-digits)
 * - future:     a real date after today (local calendar day)
 * The Date is built with `new Date(y, m - 1, d)` (local midnight), like toIsoDate in services/age.ts.
 * `now` is only a seam for tests.
 */
export function parseBirthDate({ day, month, year }: DateParts, now: Date = new Date()): BirthDateResult {
  const d = day.trim();
  const m = month.trim();
  const y = year.trim();

  if (d === '' || m === '' || y === '' || y.length < 4) return { ok: false, reason: 'incomplete' };
  if (!DIGITS.test(d) || !DIGITS.test(m) || !DIGITS.test(y)) return { ok: false, reason: 'invalid' };
  if (d.length > 2 || m.length > 2 || y.length > 4) return { ok: false, reason: 'invalid' };

  const dayNumber = Number(d);
  const monthNumber = Number(m);
  const yearNumber = Number(y);
  if (yearNumber < MIN_YEAR || monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) {
    return { ok: false, reason: 'invalid' };
  }

  const date = new Date(yearNumber, monthNumber - 1, dayNumber);
  // JS rolls 31/04 over to 01/05: the date exists only if it reads back the same.
  if (date.getFullYear() !== yearNumber || date.getMonth() !== monthNumber - 1 || date.getDate() !== dayNumber) {
    return { ok: false, reason: 'invalid' };
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date.getTime() > today.getTime()) return { ok: false, reason: 'future' };

  return { ok: true, date };
}

const SEPARATED_DATE = /^(\d{1,2})[\s/.\-]+(\d{1,2})[\s/.\-]+(\d{4})$/;

/**
 * Splits a pasted date over the three boxes. Accepts 14/03/1995, 14-03-1995, 14.03.1995, "14 03 1995" and 14031995; the
 * first two numbers are day then month for 'dmy' and month then day for 'mdy' (03/14/1995). Anything else → null.
 * It only splits: whether the date exists is parseBirthDate's call.
 */
export function splitPastedDate(text: string, order: FieldOrder): DateParts | null {
  const trimmed = text.trim();
  let first: string;
  let second: string;
  let year: string;

  const separated = SEPARATED_DATE.exec(trimmed);
  if (separated) {
    [, first, second, year] = separated;
  } else if (/^\d{8}$/.test(trimmed)) {
    first = trimmed.slice(0, 2);
    second = trimmed.slice(2, 4);
    year = trimmed.slice(4);
  } else {
    return null;
  }

  return order === 'dmy' ? { day: first, month: second, year } : { day: second, month: first, year };
}

/** Spanish writes day-month-year; everything else the app ships in (English) month-day-year. */
export function fieldOrder(lang: string): FieldOrder {
  return lang.toLowerCase().startsWith('es') ? 'dmy' : 'mdy';
}
