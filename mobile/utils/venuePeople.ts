/**
 * JChat 3.0 — pure helpers of the people-per-venue counts (pure: no React, no I/O, runs in Node tests).
 *
 * MapScreen asks the server (venue_people_counts, migration 237) how many people are in each visible venue: only
 * numbers, never who. These helpers prepare the ids the app sends and read the answer defensively, so a wrong or
 * missing answer can never crash the map: it just leaves the count at 0.
 */

/** The server is asked for at most this many venues at once. */
export const MAX_COUNT_IDS = 200;

/** The ids to send: no empty or repeated ones, at most MAX_COUNT_IDS, in the order they came. */
export function limitCountIds(ids: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_COUNT_IDS) break;
  }
  return out;
}

/**
 * The server's rows ([{ business_id, people }]) as { business_id: people }. Rows that are not what we expect are
 * dropped; a count is a whole number ≥ 0. A venue that is not in the answer has nobody: the caller uses 0.
 */
export function parsePeopleCounts(data: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!Array.isArray(data)) return counts;
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const { business_id: id, people } = row as { business_id?: unknown; people?: unknown };
    if (typeof id !== 'string' || id.length === 0) continue;
    const n = typeof people === 'number' ? people : Number(people);
    if (!Number.isFinite(n) || n < 0) continue;
    counts[id] = Math.floor(n);
  }
  return counts;
}
