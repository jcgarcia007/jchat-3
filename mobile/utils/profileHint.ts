/**
 * JChat 3.0 — the one-time "Tu perfil está aquí" hint (pure decision). Seen = this device OR this account
 * (users.settings.hints.profileMenuSeen) has it.
 *   local    — the flag stored on this device (null = not known yet)
 *   remote   — the flag in the account's settings (null = could not be read)
 * Returns what to do:
 *   show        — put the hint on screen now
 *   syncLocal   — the account says seen but this device does not know: remember it here
 *   syncRemote  — this device saw it but the account does not know yet (the earlier save failed): save it again
 */

export interface ProfileHintDecision {
  show: boolean;
  syncLocal: boolean;
  syncRemote: boolean;
}

export function decideProfileHint(input: { local: boolean | null; remote: boolean | null }): ProfileHintDecision {
  const local = input.local === true;
  const remote = input.remote === true;
  return {
    show: !local && !remote,
    syncLocal: remote && !local,
    syncRemote: local && !remote,
  };
}

/** Hint key stored on the device (one per account). */
export function profileHintStorageKey(userId: string): string {
  return `hints.profileMenuSeen:${userId}`;
}

/** The hint may only appear inside the chat: not while the entry screen is up, and only when a chat is shown. */
export function profileHintAllowed(input: { entryVisible: boolean; inChat: boolean }): boolean {
  return input.inChat && !input.entryVisible;
}
