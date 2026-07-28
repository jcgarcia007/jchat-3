/**
 * Central relative-time ("X ago") formatter for the super-admin surface.
 * Replaces 8 duplicated local `timeAgo()` copies — but does NOT collapse
 * their 3 distinct output shapes into one. Pass the `options` that match
 * what a given page showed before:
 *
 *   - businesses/revenue/announcements/team (day-only, compact):
 *       { granularity: 'day', style: 'compact' }   → "Today" / "3d ago"
 *   - users (day-only, verbose):
 *       { granularity: 'day', style: 'verbose' }   → "Today" / "1 day ago" / "3 days ago"
 *   - disputes(super-admin)/alerts (minute/hour/day granular):
 *       { granularity: 'time' }                    → "5m ago" / "3h ago" / "2d ago"
 *   - radius-requests (minute/hour, then a locale-aware date past 24h):
 *       { granularity: 'time', daysFallback: 'date' } → "5m ago" / "3h ago" / "Jul 12"
 *
 * `t` must already be scoped to the "superAdmin.relativeTime" namespace
 * (e.g. `useTranslations("superAdmin.relativeTime")`) — this is a plain
 * function, not a component, so it can't call the hook itself (same
 * parameter-passing pattern as tabSemantics.ts / nav4a-tokens.ts).
 */

type TranslateFn = (key: string, values?: Record<string, string | number>) => string;

export interface RelativeTimeOptions {
  granularity: "day" | "time";
  /** Only meaningful for granularity 'day' — 'time' has only ever shown compact ("Xm"/"Xh"/"Xd") output. */
  style?: "compact" | "verbose";
  /** granularity 'time' only: what to show once >=24h have passed. 'label' (default) = "Xd ago"; 'date' = a locale-aware toLocaleDateString fallback (radius-requests' existing behavior). */
  daysFallback?: "label" | "date";
  /** Only used when daysFallback === 'date'. Omit to keep today's exact behavior (runtime default locale, same as the `undefined` this replaces). */
  locale?: string;
}

export function formatRelativeTime(
  iso: string,
  t: TranslateFn,
  options: RelativeTimeOptions,
): string {
  const diffMs = Date.now() - new Date(iso).getTime();

  if (options.granularity === "day") {
    const days = Math.floor(diffMs / 86_400_000);
    if (days === 0) return t("today");
    return options.style === "verbose"
      ? t("daysAgoVerbose", { count: days })
      : t("daysAgoCompact", { count: days });
  }

  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return t("minutesAgoCompact", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("hoursAgoCompact", { count: hours });

  if (options.daysFallback === "date") {
    return new Date(iso).toLocaleDateString(options.locale, { month: "short", day: "numeric" });
  }
  const days = Math.floor(hours / 24);
  return t("daysAgoCompact", { count: days });
}
