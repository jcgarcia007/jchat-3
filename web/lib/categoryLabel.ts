/**
 * Business categories are free text in `businesses.category` (in practice the list chosen at
 * registration). Each known category has a key in `messages/*.json` → `businessCategories`; the key is
 * the normalized text (no accents, lower case) with every run of non-alphanumerics as "_".
 * Unknown free text is shown as written.
 */

/** "Bar & Nightclub" → "bar_nightclub"; "  Café " → "cafe". */
export function categoryKey(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

type CategoryTranslator = {
  (key: string): string;
  has: (key: string) => boolean;
};

/** Translated category, or the original text when it has no key. */
export function categoryLabel(text: string | null | undefined, t: CategoryTranslator): string {
  const raw = (text ?? '').trim();
  const key = categoryKey(raw);
  return key && t.has(key) ? t(key) : raw;
}
