/**
 * JChat 3.0 — spacing standard (B7): a 4-point grid plus the form rhythm. Margins, paddings and gaps in migrated
 * screens come from here (or are multiples of 4; the one exception is `fieldLabelGap`, 6). Documented in
 * docs/design/type-standard.md.
 */

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export type SpaceToken = keyof typeof space;

/** Between a field's label and its input (and between the input and its error/hint). */
export const fieldLabelGap = 6;
/** Between one field and the next. */
export const fieldGap = 16;
/** Between one group of fields (a section) and the next. */
export const sectionGap = 24;
/** Minimum height of any tappable control (field, button): touch target and room for large text. */
export const controlMinHeight = 48;
