/**
 * JChat 3.0 — does a new venue-chat message count as "unread" for the venue session (pure)?
 * It counts when the message is not mine and the chat is NOT in front of the person: the chat screen is not
 * mounted, or it is mounted but covered (the profile sheet is open on top of it).
 */

export function shouldCountUnread(input: { fromMe: boolean; chatMounted: boolean; chatCovered: boolean }): boolean {
  if (input.fromMe) return false;
  return !input.chatMounted || input.chatCovered;
}
