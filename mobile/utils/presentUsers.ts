/**
 * JChat 3.0 — filtering the room's presence list with the server's geo-presence clock (pure: no I/O, runs in Node tests).
 *
 * The room header ("N people here" + avatars) comes from the realtime presence, which each device publishes and which is NOT
 * withdrawn when the app goes to the background. The gift button comes from gift_available, which needs a CURRENT room_geo_presence
 * (it lapses after ~10 min) for both people. Migration 243's venue_present_users(business, ids) answers which of the given ids are
 * still confirmed in the venue with the SERVER's clock; this module applies that answer to the list.
 *
 * Rules (Juan Carlos, Arreglo B option A):
 *   - Any failure of the call (null) leaves the list as it is today (fail-open).
 *   - I always stay in my own list.
 *   - If MY id does not come back, the answer says nothing about the others (I am not confirmed in the venue — an owner / staff
 *     member who entered without a geo-presence, or my own presence lapsed): the list stays unfiltered (fail-open too). The empty
 *     array of "you are not present" is thereby never read as "nobody is here".
 *   - Only people whose id was SENT can be removed: whoever is past the 100-id limit of the call stays.
 *   - The function never adds anyone: the output is always a sub-list of the input.
 */

/** venue_present_users takes at most 100 ids per call (it cuts the rest). */
export const PRESENT_QUERY_LIMIT = 100;

interface HasId {
  id: string;
}

/** The ids to ask about: me first (so my own answer always travels), then everyone else once, at most PRESENT_QUERY_LIMIT. */
export function presentQueryIds(users: readonly HasId[], selfId: string | null | undefined): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  };
  if (selfId) push(selfId);
  for (const user of users) push(user.id);
  return ids.slice(0, PRESENT_QUERY_LIMIT);
}

/**
 * `present` is the server's answer (null = the call failed); `queried` are the ids that were sent (what presentQueryIds gave at
 * that moment). Returns the SAME array when there is nothing to filter.
 */
export function filterPresentUsers<T extends HasId>(
  users: T[],
  present: readonly string[] | null,
  queried: readonly string[] | null,
  selfId: string | null | undefined,
): T[] {
  if (present === null || queried === null || !selfId) return users;
  const answered = new Set(present);
  if (!answered.has(selfId)) return users;
  const sent = new Set(queried);
  const kept = users.filter((user) => user.id === selfId || !sent.has(user.id) || answered.has(user.id));
  return kept.length === users.length ? users : kept;
}
