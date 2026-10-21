/**
 * JChat 3.0 — logic of the map pin (pure: no React, no theme, runs in Node tests).
 *
 * components/map/BusinessPin.tsx draws the pin; what it shows is decided here:
 *  - activity level and size from the people count: 40 / 48 / 54 / 60 px;
 *  - the initials shown when the venue has no logo, and a stable colour index for them;
 *  - the category chip icon (bar, restaurant, café, club, other);
 *  - whether the pin is "muted" (grey: closed or pending) and whether the counter is shown.
 */

export type HeatLevel = 'cool' | 'mild' | 'warm' | 'hot';
export type PinCategory = 'bar' | 'restaurant' | 'cafe' | 'club' | 'other';

/** Count thresholds of the activity levels (people in the venue's chat). */
export function heatLevel(count: number): HeatLevel {
  if (count >= 50) return 'hot';
  if (count >= 20) return 'warm';
  if (count >= 5) return 'mild';
  return 'cool';
}

/** Diameter of the logo circle by activity level: 40 / 48 / 54 / 60 px. */
export const PIN_SIZES: Record<HeatLevel, number> = { cool: 40, mild: 48, warm: 54, hot: 60 };

export function pinSize(count: number): number {
  return PIN_SIZES[heatLevel(count)];
}

/** Counter text: nothing above 99. */
export function counterLabel(count: number): string {
  return count > 99 ? '99+' : String(Math.max(0, Math.floor(count)));
}

/**
 * Up to two letters, upper case: the first letters of the first two words ("Bar XZX" → "BX"), or the first two
 * letters of a single word ("Lounge" → "LO"). Anything that is not a letter or digit is ignored; none left → "?".
 */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '')
    .normalize('NFC')
    .split(/\s+/)
    .map((word) => Array.from(word).filter((ch) => /[\p{L}\p{N}]/u.test(ch)))
    .filter((letters) => letters.length > 0);
  if (words.length === 0) return '?';
  const letters = words.length === 1 ? words[0].slice(0, 2) : [words[0][0], words[1][0]];
  return letters.join('').toUpperCase();
}

/** A stable index in [0, length) for a seed (djb2 hash): the same venue always gets the same colour. */
export function colorIndex(seed: string, length: number): number {
  if (length <= 0) return 0;
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) hash = ((hash * 33) ^ seed.charCodeAt(i)) >>> 0;
  return hash % length;
}

/** Lower case, no accents, single spaces: "  Café " → "cafe". */
function normalize(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The categories chosen at registration are free text (Bar & Nightclub, Restaurant, Café, Lounge, Club, Brewery,
 * Rooftop Bar, Sports Bar, Cocktail Bar, Wine Bar, Other). They collapse to the five chip icons; matching is on
 * whole words, never on a fragment of a word ("barbería" is not a bar).
 */
export function pinCategory(category: string | null | undefined): PinCategory {
  const text = normalize(category);
  if (!text) return 'other';
  const words = text.split(/[^a-z0-9]+/).filter(Boolean);
  const has = (word: string) => words.includes(word);
  if (has('restaurant') || has('restaurante') || has('grill') || has('bistro')) return 'restaurant';
  if (has('cafe') || has('coffee') || has('cafeteria')) return 'cafe';
  if (has('club') && !has('nightclub')) return 'club';
  if (has('bar') || has('lounge') || has('brewery') || has('pub') || has('nightclub')) return 'bar';
  return 'other';
}

/** A closed or pending venue is drawn in grey, without heat colour. */
export function isMuted(status: string | null | undefined, closed: boolean | undefined): boolean {
  return status === 'pending' || closed === true;
}

/** The counter shows only for a venue that is not pending and has people in it. */
export function showCounter(count: number, status: string | null | undefined): boolean {
  return status !== 'pending' && count > 0;
}

/** The soft halo shows only at the top activity level, and never on a muted pin. */
export function showHalo(count: number, muted: boolean): boolean {
  return !muted && heatLevel(count) === 'hot';
}
