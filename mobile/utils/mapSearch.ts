/**
 * JChat 3.0 — the Map's business search (pure: no React, no I/O, runs in Node tests).
 *
 * The search runs over the businesses ALREADY loaded on the map (no query): a business matches when the typed text, lowercased and without accents, is
 * contained in its name or in its category. At least one character; the list shows at most SEARCH_MAX_RESULTS rows; the screen waits
 * SEARCH_DEBOUNCE_MS after the last keystroke before it filters.
 */

export const SEARCH_MAX_RESULTS = 8;
export const SEARCH_DEBOUNCE_MS = 150;

/** Lowercase, accents removed ("Café" → "cafe"), outer spaces trimmed and inner runs of spaces collapsed. */
export function normalizeSearchText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

interface Searchable {
  name: string;
  category: string;
}

/** True when the (already typed) query is contained in the business's name or category. An empty query matches nothing. */
export function matchesSearch(business: Searchable, query: string): boolean {
  const needle = normalizeSearchText(query);
  if (needle === '') return false;
  return normalizeSearchText(business.name).includes(needle) || normalizeSearchText(business.category).includes(needle);
}

/** The businesses that match, in the order they came, at most `limit` of them. */
export function searchBusinesses<T extends Searchable>(businesses: readonly T[], query: string, limit: number = SEARCH_MAX_RESULTS): T[] {
  if (normalizeSearchText(query) === '') return [];
  const found: T[] = [];
  for (const business of businesses) {
    if (!matchesSearch(business, query)) continue;
    found.push(business);
    if (found.length >= limit) break;
  }
  return found;
}
