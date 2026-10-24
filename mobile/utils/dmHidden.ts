/**
 * JChat 3.0 — how a DM conversation is hidden for one user (pure: runs in Node tests).
 *
 * Two independent sources hide a conversation:
 *  - hidden_at_x (the user hid it by hand, migration 172): a CUT-OFF. Only messages after it show, and a newer message
 *    (last_message_at > hidden_at) shows the conversation again.
 *  - exit_hidden_at_x (a confirmed venue exit, migration 237): STICKY. While it is set the conversation is hidden
 *    completely, however new its last message is. Only venue_session_resume (or the purge) clears it, and resume never
 *    touches hidden_at_x, so it can never undo a manual hide.
 */
export function isExitHidden(exit: string | null | undefined): boolean {
  return !!exit;
}

/** The manual cut-off to apply to messages (null = no cut-off). Ignores the exit hide, which hides everything. */
export function manualCutoff(manual: string | null | undefined): string | null {
  return manual || null;
}

/** Does the conversation show in the inbox? */
export function isConversationVisible(
  manual: string | null | undefined,
  exit: string | null | undefined,
  lastMessageAt: string | null | undefined,
): boolean {
  if (isExitHidden(exit)) return false;
  if (!manual) return true;
  if (!lastMessageAt) return false;
  return lastMessageAt > manual;
}
