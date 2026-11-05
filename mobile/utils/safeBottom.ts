/**
 * Bottom padding of a screen that pins its buttons to the bottom edge: the design padding, or the system bar
 * (3-button navigation / gesture pill, `insets.bottom`) plus a little air, whichever is larger. Without it the
 * last button sits behind the Android navigation bar (edge-to-edge) when the bar is a 3-button one.
 */
export function safeBottomPadding(base: number, insetBottom: number, air = 16): number {
  return Math.max(base, (Number.isFinite(insetBottom) ? insetBottom : 0) + air);
}
