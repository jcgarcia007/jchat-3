/**
 * JChat 3.0 — merge of message lists (pure). Used to catch up after a Realtime gap (resubscribe, app back
 * to the foreground, network back): the last page fetched from the server is merged into the list on screen
 * without duplicates (planResync decides between merging and reloading).
 *
 * Lists are NEWEST FIRST (the chat FlatLists are inverted: index 0 = newest = bottom).
 *   - dedupe by `id`; for a row present in both, the incoming fields win but a field the incoming row lacks
 *     (or has as undefined, e.g. a sender name that could not be resolved) keeps its current value;
 *   - rows only present in `current` stay (older pages, optimistic bubbles) and rows only in `incoming` are added;
 *   - result sorted by created_at DESC (ties: the later id first), so the order never depends on arrival order.
 */

export interface MessageLike {
  id: string;
  created_at: string;
}

/** Optimistic bubbles (sent, not confirmed yet) carry this id prefix and a LOCAL clock. */
export const OPTIMISTIC_ID_PREFIX = 'optimistic-';

function definedOnly<T extends object>(row: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(row) as (keyof T)[]) {
    if (row[key] !== undefined) out[key] = row[key];
  }
  return out;
}

function compareNewestFirst(a: MessageLike, b: MessageLike): number {
  const ta = Date.parse(a.created_at);
  const tb = Date.parse(b.created_at);
  if (ta !== tb && !Number.isNaN(ta) && !Number.isNaN(tb)) return tb - ta;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

export function mergeMessages<T extends MessageLike>(current: readonly T[], incoming: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const row of current) byId.set(row.id, row);
  for (const row of incoming) {
    const existing = byId.get(row.id);
    byId.set(row.id, existing ? { ...existing, ...definedOnly(row) } : row);
  }
  return [...byId.values()].sort(compareNewestFirst);
}

export type ResyncPlan = 'merge' | 'reload';

/**
 * How to apply the LAST page of a room / thread fetched after a Realtime gap (no created_at filter, so it never
 * depends on the device clock):
 *   - 'merge'  — at least one fetched id is already on screen: the page overlaps the list, so merging it
 *                (mergeMessages) leaves no hole; nothing fetched is also a plain merge (nothing was missed);
 *   - 'reload' — fetched rows but none of them is on screen (more new messages than a page, or an empty list):
 *                a merge could leave a hole in the history, so reload the first page instead.
 * Optimistic bubbles never count as "on screen": their ids are local and not in the server's answer.
 */
export function planResync(current: readonly MessageLike[], fetched: readonly MessageLike[]): ResyncPlan {
  if (fetched.length === 0) return 'merge';
  const known = new Set<string>();
  for (const row of current) {
    if (!row.id.startsWith(OPTIMISTIC_ID_PREFIX)) known.add(row.id);
  }
  return fetched.some((row) => known.has(row.id)) ? 'merge' : 'reload';
}
