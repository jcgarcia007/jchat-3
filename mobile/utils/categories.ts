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

/**
 * The options of the registration list (web, free text in the database) → their translation key under `map:categories.*`,
 * by normalized text. Text that is not in the list (a custom or already-translated category) has no key and is shown as written.
 */
const CATEGORY_LABEL_KEYS: Readonly<Record<string, string>> = {
  'bar & nightclub': 'bar_nightclub',
  restaurant: 'restaurant',
  cafe: 'cafe',
  lounge: 'lounge',
  club: 'club',
  brewery: 'brewery',
  'rooftop bar': 'rooftop_bar',
  'sports bar': 'sports_bar',
  'cocktail bar': 'cocktail_bar',
  'wine bar': 'wine_bar',
  other: 'other',
};

/** The translation key (`categories.<x>` in the `map` namespace) of a known category, or null. */
export function categoryLabelKey(category: string | null | undefined): string | null {
  const key = CATEGORY_LABEL_KEYS[normalizeCategory(category)];
  return key ? `categories.${key}` : null;
}

/** Display text of a category: translated when it is one of the registration options, otherwise as written. Filtering never uses this. */
export function categoryLabel(category: string | null | undefined, t: (key: string) => string): string {
  const key = categoryLabelKey(category);
  return key ? t(key) : (category ?? '').trim();
}
