/**
 * JChat 3.0 — report reasons and error mapping (shared with the web).
 *
 * The codes are the ones report_content (migration 212) accepts; anything else raises `invalid_reason`.
 * KEEP IDENTICAL to web/lib/reportReasons.ts (scripts/check-report-reasons-sync.mjs compares them).
 */

/** Order of the reasons in the server contract. The sheets show `child_safety` first and highlighted. */
export const REPORT_REASONS = [
  'spam',
  'harassment',
  'hate',
  'threat_violence',
  'sexual_content',
  'child_safety',
  'impersonation',
  'copyright',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type ReportContentType = 'user' | 'post' | 'comment' | 'message' | 'dm_message';

/** Max length of the free-text detail (the server cuts at the same size). */
export const REPORT_DETAILS_MAX = 1000;

/** The urgent reason: shown first, highlighted, with the emergency note. */
export const URGENT_REPORT_REASON: ReportReason = 'child_safety';

/** Reasons in the order the sheets show them: the urgent one first, then the rest as in the contract. */
export const REPORT_REASONS_DISPLAY: readonly ReportReason[] = [
  URGENT_REPORT_REASON,
  ...REPORT_REASONS.filter((reason) => reason !== URGENT_REPORT_REASON),
];

/** `other` needs a written detail. */
export function reportNeedsDetails(reason: ReportReason): boolean {
  return reason === 'other';
}

/** Keys of the translated error messages (`report.errors.<key>`). */
export type ReportErrorKey =
  | 'notAuthenticated'
  | 'invalidReason'
  | 'detailsRequired'
  | 'notFound'
  | 'invalidTarget'
  | 'reportLimit'
  | 'generic';

const ERROR_CODES: ReadonlyArray<readonly [string, ReportErrorKey]> = [
  ['not_authenticated', 'notAuthenticated'],
  ['invalid_reason', 'invalidReason'],
  ['details_required', 'detailsRequired'],
  ['not_found', 'notFound'],
  ['invalid_target', 'invalidTarget'],
  ['report_limit', 'reportLimit'],
];

/** Maps the error raised by report_content (message carries the code) to a translation key. */
export function reportErrorKey(err: unknown): ReportErrorKey {
  const text = typeof err === 'string' ? err : String((err as { message?: unknown } | null)?.message ?? '');
  for (const [code, key] of ERROR_CODES) if (text.includes(code)) return key;
  return 'generic';
}
