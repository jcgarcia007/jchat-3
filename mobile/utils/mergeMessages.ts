/**
 * JChat 3.0 — merge of message lists (pure). Used to catch up after a Realtime gap (resubscribe, app back
 * to the foreground, network back): the rows fetched since the newest known message are merged into the list
 * on screen without duplicates.
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

/**
 * created_at of the newest CONFIRMED message of a newest-first list (the point to resync from), or null.
 * Optimistic bubbles are skipped: their timestamp is the device clock, not the server's.
 */
export function newestConfirmedTimestamp(list: readonly MessageLike[]): string | null {
  for (const row of list) {
    if (!row.id.startsWith(OPTIMISTIC_ID_PREFIX)) return row.created_at;
  }
  return null;
}

/**
 * True when a catch-up query came back FULL (limit rows or more): there may be more missed rows than it
 * returned, so merging would leave a hole between the old list and the newest ones — reload the first page.
 */
export function resyncHasGap(rowCount: number, limit: number): boolean {
  return rowCount >= limit;
}
