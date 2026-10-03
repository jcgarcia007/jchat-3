/**
 * Business categories as they really exist (businesses.category is free text, in practice the
 * list chosen at registration: "Bar & Nightclub", "Café", "Restaurant", …). Matching is by
 * EQUALITY of the normalized text — never "contains", so "bar" can't match "barbería".
 */

export interface CategoryOption {
  /** Normalized text: the value filters compare against. */
  key: string;
  /** Text as written on the first business that uses it (what the chip shows). */
  label: string;
}

/** Lower case, no accents, trimmed, single spaces: "  Café " → "cafe". */
export function normalizeCategory(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** One option per distinct real category present, alphabetical. Empty categories are skipped. */
export function buildCategoryOptions(categories: ReadonlyArray<string | null | undefined>): CategoryOption[] {
  const byKey = new Map<string, string>();
  for (const category of categories) {
    const key = normalizeCategory(category);
    if (key && !byKey.has(key)) byKey.set(key, (category as string).trim());
  }
  return [...byKey.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** `selectedKey` is 'all' (no restriction) or a CategoryOption.key. */
export function categoryMatches(category: string | null | undefined, selectedKey: string): boolean {
  return selectedKey === 'all' || normalizeCategory(category) === selectedKey;
}
