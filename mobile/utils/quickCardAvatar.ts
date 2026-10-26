/**
 * JChat 3.0 — what the user quick card shows for a person (pure: no I/O, runs in Node tests).
 *
 * The card must show the SAME picture as the room's row of avatars, and that row is fed by the realtime presence payload
 * (usePresenceChannels): whatever each person published when they entered, which for an incognito entry is a null avatar and a
 * nickname. So the card reads the presence payload too — never the public profile, which would reveal an incognito person's real
 * photo. Someone who is not in the live presence list (they left, or are only an author of an old message) gets no photo: the card
 * falls back to the initial, as it always has.
 */

export interface PresenceUserLike {
  id: string;
  avatar_url: string | null;
  is_incognito?: boolean;
  nickname?: string;
}

export interface QuickCardIdentity {
  /** The photo to show, or undefined → the card draws the initial. */
  avatarUrl: string | undefined;
  /** Incognito people are shown by their nickname, never by their real name. */
  nickname: string | undefined;
}

export function quickCardIdentity(present: readonly PresenceUserLike[], userId: string): QuickCardIdentity {
  const person = present.find((u) => u.id === userId);
  if (!person) return { avatarUrl: undefined, nickname: undefined };
  if (person.is_incognito) return { avatarUrl: undefined, nickname: person.nickname || undefined };
  return { avatarUrl: person.avatar_url || undefined, nickname: undefined };
}
