/**
 * JChat 3.0 — joins a chat message with its author's profile (name + avatar). Pure: no React, no Supabase.
 *
 * A Realtime INSERT and the row the send returns are just the `messages` row: no author profile. The first page of a
 * room is hydrated from public_profiles, but anything that arrives later used to be painted with the fallback initial
 * (and, for the sender's own message, the confirmed row REPLACED the optimistic one and dropped its avatar). The
 * ProfileCache is the one place that knows the profiles already loaded (room members, earlier messages, my own
 * profile), fetches a missing one ONCE (concurrent requests for the same user share the same promise) and lets the
 * caller patch the message when it arrives. A failed lookup is not remembered, so the next message retries it.
 *
 * `names` / `avatars` are plain Maps on purpose: ChatRoomScreen keeps using them directly (quick card, action sheet).
 * `avatars.has(id)` means "this profile was loaded" (the value is null when the person has no photo).
 */

export interface ProfileRow {
  id: string;
  name?: string | null;
  avatar?: string | null;
}

export type ProfileFetcher = (ids: string[]) => Promise<ProfileRow[]>;

export interface SenderMessage {
  id: string;
  user_id: string;
  sender_name?: string;
  sender_avatar?: string;
}

export interface ProfileCache {
  readonly names: Map<string, string>;
  readonly avatars: Map<string, string | null>;
  /** True when this user's profile has been loaded (even if they have no photo). */
  known(id: string | null | undefined): boolean;
  /** Stores a profile (own profile, a hydrated page…). */
  prime(id: string, profile: { name?: string | null; avatar?: string | null }): void;
  /** Makes sure the given users are loaded: cache hits cost nothing, in-flight lookups are shared, the rest is ONE fetch. */
  ensure(ids: ReadonlyArray<string | null | undefined>): Promise<void>;
  /** The message with the author's name / photo when known; unchanged otherwise (and for incognito senders). */
  apply<T extends SenderMessage>(message: T, options?: { incognito?: boolean }): T;
}

export function createProfileCache(fetcher: ProfileFetcher): ProfileCache {
  const names = new Map<string, string>();
  const avatars = new Map<string, string | null>();
  const inflight = new Map<string, Promise<void>>();

  const known = (id: string | null | undefined): boolean => !!id && avatars.has(id);

  const prime: ProfileCache['prime'] = (id, profile) => {
    if (profile.name) names.set(id, profile.name);
    avatars.set(id, profile.avatar ?? null);
  };

  const ensure: ProfileCache['ensure'] = (ids) => {
    const wanted = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))].filter((id) => !known(id));
    const waits: Promise<void>[] = [];
    const toFetch: string[] = [];
    for (const id of wanted) {
      const pending = inflight.get(id);
      if (pending) waits.push(pending);
      else toFetch.push(id);
    }
    if (toFetch.length > 0) {
      const request = fetcher(toFetch)
        .then((rows) => {
          for (const row of rows) prime(row.id, { name: row.name, avatar: row.avatar });
          // Asked for but not returned = no visible profile: remember it, do not ask again for every message.
          for (const id of toFetch) if (!avatars.has(id)) avatars.set(id, null);
        })
        .catch(() => undefined) // not remembered: the next message from this user tries again
        .finally(() => {
          for (const id of toFetch) inflight.delete(id);
        });
      for (const id of toFetch) inflight.set(id, request);
      waits.push(request);
    }
    return Promise.all(waits).then(() => undefined);
  };

  const apply: ProfileCache['apply'] = (message, options) => {
    // Incognito (explicit, or the message itself says so): never decorated with the real name / photo.
    if (options?.incognito || (message as { metadata?: { incognito?: unknown } }).metadata?.incognito === true) return message;
    const name = names.get(message.user_id);
    const hasAvatar = avatars.has(message.user_id);
    if (name === undefined && !hasAvatar) return message;
    const avatar = avatars.get(message.user_id);
    return {
      ...message,
      sender_name: name ?? message.sender_name,
      sender_avatar: hasAvatar ? avatar ?? undefined : message.sender_avatar,
    };
  };

  return { names, avatars, known, prime, ensure, apply };
}

/**
 * The sender's own message once the server confirmed it: drops a Realtime copy that arrived first and replaces the
 * optimistic row by the confirmed one KEEPING the optimistic row's sender name / photo (the confirmed row is the bare
 * `messages` row; it used to wipe the avatar, so the sender's own message fell back to the initial).
 */
export function settleOptimistic<T extends SenderMessage>(list: readonly T[], optimisticId: string, confirmed: T): T[] {
  const optimistic = list.find((m) => m.id === optimisticId);
  const settled: T = optimistic
    ? { ...confirmed, sender_name: optimistic.sender_name ?? confirmed.sender_name, sender_avatar: optimistic.sender_avatar ?? confirmed.sender_avatar }
    : confirmed;
  return list.filter((m) => m.id !== confirmed.id).map((m) => (m.id === optimisticId ? settled : m));
}
