/**
 * JChat 3.0 — type standard (B7). One table of roles: size, line height as a PROPORTION of the size, and the
 * font-scale cap. Screens never write a numeric fontSize / lineHeight: they use <AppText variant="…"> or
 * `typeStyle(role)` in a StyleSheet. Spacing lives in theme/spacing.ts. Documented in docs/design/type-standard.md.
 *
 * lineHeight: React Native has no unitless line height, so it is computed here (size × ratio, rounded) and the
 * system multiplies it by the same capped font scale as the text — it grows and shrinks WITH the text. A fixed px
 * lineHeight in a style is what made subtitles look too open at large sizes.
 * letterSpacing exists only on `label` (the uppercase mono caption); nothing else tracks.
 */

import type { TextStyle } from 'react-native';

export type TypeRole =
  | 'display'
  | 'title'
  | 'headline'
  | 'body'
  | 'field'
  | 'label'
  | 'button'
  | 'compact'
  | 'caption';

export interface TypeRoleSpec {
  /** Size in dp at font scale 1. */
  fontSize: number;
  /** lineHeight = fontSize × ratio. */
  lineHeightRatio: number;
  /** maxFontSizeMultiplier: how far the text may grow with the system setting. */
  cap: number;
}

export const TYPE_ROLES: Readonly<Record<TypeRole, TypeRoleSpec>> = {
  display: { fontSize: 32, lineHeightRatio: 1.15, cap: 1.3 },
  title: { fontSize: 24, lineHeightRatio: 1.2, cap: 1.3 },
  headline: { fontSize: 18, lineHeightRatio: 1.3, cap: 1.4 },
  body: { fontSize: 16, lineHeightRatio: 1.4, cap: 1.6 },
  // A field's text and its label grow together (same cap), so the label never looks tiny next to its value.
  field: { fontSize: 16, lineHeightRatio: 1.3, cap: 1.6 },
  label: { fontSize: 13, lineHeightRatio: 1.3, cap: 1.6 },
  button: { fontSize: 16, lineHeightRatio: 1.2, cap: 1.3 },
  // Dense UI (chips, pills, segmented controls, tip chips): what used to be 14–15. Below 14 it is `caption`.
  compact: { fontSize: 14, lineHeightRatio: 1.3, cap: 1.4 },
  caption: { fontSize: 12, lineHeightRatio: 1.35, cap: 1.4 },
};

/** Tracking of the label role, as a proportion of its size (≈ 0.12 em). */
export const LABEL_LETTER_SPACING_RATIO = 0.12;

/** fontSize + lineHeight (+ letterSpacing and uppercase for `label`) of a role. */
export function typeStyle(role: TypeRole): TextStyle {
  const { fontSize, lineHeightRatio } = TYPE_ROLES[role];
  const style: TextStyle = { fontSize, lineHeight: Math.round(fontSize * lineHeightRatio) };
  if (role === 'label') {
    style.letterSpacing = Math.round(fontSize * LABEL_LETTER_SPACING_RATIO * 10) / 10;
    style.textTransform = 'uppercase';
  }
  return style;
}

/** maxFontSizeMultiplier of a role. */
export function typeCap(role: TypeRole): number {
  return TYPE_ROLES[role].cap;
}
