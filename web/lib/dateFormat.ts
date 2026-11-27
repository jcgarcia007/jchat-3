// Dashboard dates and times in the panel language (H-052). Never pass `undefined` to toLocale*String: that follows
// the browser, so a Spanish panel in an English browser showed "Nov 8". Pass the next-intl locale instead.

export type PanelLocale = "es" | "en" | string;

type DateInput = string | number | Date;

function toDate(value: DateInput): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Uppercases only the first letter ("noviembre de 2026" -> "Noviembre de 2026"); CSS "capitalize" would give "De". */
export function capitalizeFirst(text: string): string {
  return text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text;
}

export function formatPanelDate(value: DateInput, locale: PanelLocale, options: Intl.DateTimeFormatOptions): string {
  const d = toDate(value);
  return d ? new Intl.DateTimeFormat(locale, options).format(d) : "";
}

/** "noviembre de 2026" / "November 2026" with the first letter capitalized and "de" left in lower case. */
export function formatMonthYear(year: number, monthIndex: number, locale: PanelLocale): string {
  return capitalizeFirst(formatPanelDate(new Date(year, monthIndex, 1), locale, { month: "long", year: "numeric" }));
}
