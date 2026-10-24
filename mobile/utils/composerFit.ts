/**
 * JChat 3.0 — sizing of the message box of the chat composers (pure: no React, no DOM, runs in Node tests).
 *
 * On the web a multiline TextInput is a <textarea> (react-native-web) and does not size itself like the native one: with no `rows` the
 * browser makes it 2 rows tall, and nothing makes it grow with the text. hooks/useComposerFit.web.ts uses these two functions to give
 * it the native behaviour: ONE line tall when empty (as tall as the round buttons beside it), growing with the text up to the app's
 * maximum, then scrolling inside. Native (iOS / Android) never imports this.
 */

import type { TextInputProps, TextStyle } from 'react-native';

export interface ComposerFitOptions {
  /** Height of the box with one line (or none): the height of the buttons beside it. Border included. */
  minHeight: number;
  /** The app's maximum (the style's maxHeight): past it the box scrolls inside. */
  maxHeight: number;
  /** The style's lineHeight. */
  lineHeight: number;
  /** The style's borderWidth (each side). */
  borderWidth: number;
}

/** What a composer spreads on its TextInput. Native: nothing (`style` undefined, no props). Web: the vertical padding and the rows. */
export interface ComposerFit {
  style: TextStyle | undefined;
  inputProps: Pick<TextInputProps, 'numberOfLines'>;
}

/** Vertical padding that makes ONE line plus the two borders exactly `minHeight` tall (16 px font on a 20 px line, 44 px box → 11). */
export function composerPadding({ minHeight, lineHeight, borderWidth }: Pick<ComposerFitOptions, 'minHeight' | 'lineHeight' | 'borderWidth'>): number {
  return Math.max(0, (minHeight - lineHeight - 2 * borderWidth) / 2);
}

/**
 * The box height for a textarea whose content needs `contentHeight` (its scrollHeight: the lines AND the padding, not the borders),
 * given the sum of its borders. Never under `minHeight`, never over `maxHeight`; `scrolls` is true when the content does not fit.
 */
export function composerHeight(
  contentHeight: number,
  borders: number,
  { minHeight, maxHeight }: Pick<ComposerFitOptions, 'minHeight' | 'maxHeight'>,
): { height: number; scrolls: boolean } {
  const wanted = contentHeight + borders;
  return { height: Math.min(Math.max(wanted, minHeight), maxHeight), scrolls: wanted > maxHeight };
}
