/**
 * JChat 3.0 — touch target helpers. The minimum comfortable target is 44×44.
 *
 * react-native-web ignores `hitSlop` on Pressable (the DOM element stays at its drawn size), so on web a 32 px
 * avatar was a 32 px target even though iOS / Android already had a slop. `webSlop(n)` is the web equivalent for
 * elements that draw NOTHING on their own box (an avatar image inside a bare Pressable): the element grows by n on
 * every side and a negative margin gives the space back, so the layout and the drawing do not change.
 * It must not be used on a Pressable that has its own background or border (those would grow too): size those
 * to 44 directly.
 */

import { Platform, type ViewStyle } from 'react-native';

export const MIN_TOUCH_TARGET = 44;

/** Web only: extra tap area of `slop` px on every side, layout neutral. Empty on iOS / Android (they use hitSlop). */
export function webSlop(slop: number): ViewStyle {
  return Platform.OS === 'web' ? { padding: slop, margin: -slop } : {};
}
