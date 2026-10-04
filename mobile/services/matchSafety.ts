/**
 * JChat 3.0 — Match safety (Fase D4/D7)
 *
 * Report (match_report: goes to the venue owner AND the JChat team), discreet help request
 * (match_request_help: a service call + alert to the owner and active staff — nobody else sees it)
 * and block (existing block_user). Blocking makes the person disappear from deck, matches and
 * chats; callers refresh their lists afterwards.
 */

import { supabase } from './supabase';
import { blockUser } from './blocks';

export type MatchReportReason = 'harassment' | 'explicit' | 'minor' | 'scam' | 'other';

export const MATCH_REPORT_REASONS: readonly MatchReportReason[] = [
  'harassment',
  'explicit',
  'minor',
  'scam',
  'other',
];

export async function matchReport(
  businessId: string,
  reportedUserId: string,
  reason: MatchReportReason,
  details?: string,
): Promise<void> {
  const { error } = await supabase.rpc('match_report', {
    p_business_id: businessId,
    p_reported_user_id: reportedUserId,
    p_reason: reason,
    p_details: details?.trim() ? details.trim().slice(0, 500) : null,
  });
  if (error) throw error;
}

export async function matchRequestHelp(
  businessId: string,
  roomId: string | null,
  tableLabel?: string,
): Promise<void> {
  const { error } = await supabase.rpc('match_request_help', {
    p_business_id: businessId,
    p_room_id: roomId,
    p_table_label: tableLabel?.trim() ? tableLabel.trim().slice(0, 40) : null,
  });
  if (error) throw error;
}

export async function matchBlock(userId: string): Promise<void> {
  await blockUser(userId);
}
