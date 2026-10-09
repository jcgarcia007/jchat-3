/**
 * JChat 3.0 — reports (migration 212).
 *
 * Every report goes through the report_content RPC: the SERVER validates the target, takes the snapshot of the reported
 * content, deduplicates (same person + same content in 24 h), limits to 20 a day and sets the priority. The app never
 * inserts into `reports` directly.
 */

import { supabase } from './supabase';
import {
  reportErrorKey,
  type ReportContentType,
  type ReportErrorKey,
  type ReportReason,
} from '../utils/reportReasons';

/** Error with the translation key of the message to show (`report.errors.<key>`). */
export class ReportError extends Error {
  readonly key: ReportErrorKey;
  constructor(key: ReportErrorKey, cause?: unknown) {
    super(key);
    this.name = 'ReportError';
    this.key = key;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/** Reports a piece of content (or a user, with the user id) and returns the report id. Throws ReportError. */
export async function reportContent(
  contentType: ReportContentType,
  contentId: string,
  reason: ReportReason,
  details?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('report_content', {
    p_content_type: contentType,
    p_content_id: contentId,
    p_reason: reason,
    p_details: details?.trim() ? details.trim() : undefined,
  });
  if (error || !data) throw new ReportError(reportErrorKey(error), error);
  return data;
}
