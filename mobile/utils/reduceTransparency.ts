/**
 * "Reduce transparency" (pure part; no React Native imports so a Node test can load it).
 * Only iOS has the setting (AccessibilityInfo.isReduceTransparencyEnabled); Android never reports it, and there the glass is already a nearly opaque fill.
 * When it is on, the blur is replaced by a SOLID surface with the same shape.
 */
export function reduceTransparencyActive(os: string, enabled: boolean | null | undefined): boolean {
  return os === 'ios' && enabled === true;
}
