/**
 * JChat 3.0 — how many px of the layout viewport an ON-SCREEN KEYBOARD covers (pure: no I/O, runs in Node tests).
 *
 * useKeyboardCover.web.ts measures  innerHeight − (visualViewport.height + visualViewport.offsetTop).  That difference is not always a
 * keyboard: Chrome for iPhone has its own bottom toolbar, so the visual viewport is ~80-100 px shorter than the layout viewport with NO
 * keyboard at all (Safari, without a keyboard, has no difference). Taking it for a keyboard lifted the accept sheet off the bottom (the
 * chat's composer showed under it) and capped it to the shorter height. A real iPhone keyboard is ≥ ~290 px, so anything under
 * KEYBOARD_MIN_COVER_PX is browser chrome and counts as 0.
 */

/** Below this, the height difference is browser chrome (Chrome iOS toolbar, Safari's collapsing bar), not a keyboard. */
export const KEYBOARD_MIN_COVER_PX = 150;

export function keyboardCover(innerHeight: number, visualHeight: number, visualOffsetTop: number): number {
  const raw = Math.round(innerHeight - (visualHeight + visualOffsetTop));
  return raw >= KEYBOARD_MIN_COVER_PX ? raw : 0;
}
