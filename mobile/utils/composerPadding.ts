/**
 * JChat 3.0 — bottom padding of a chat composer bar (pure logic, tested in scripts/composer-padding.test.mjs).
 *
 * Keyboard closed: the bar clears the home indicator / rounded corners (the bottom safe-area inset), never less than 8.
 * Keyboard open: the keyboard already covers the inset, so only the regular 8 remains (no gap above the keys).
 */

export const COMPOSER_MIN_PADDING = 8;

export function composerBottomPadding(insetBottom: number, keyboardOpen: boolean): number {
  if (keyboardOpen) return COMPOSER_MIN_PADDING;
  const inset = Number.isFinite(insetBottom) ? insetBottom : 0;
  return Math.max(inset, COMPOSER_MIN_PADDING);
}
