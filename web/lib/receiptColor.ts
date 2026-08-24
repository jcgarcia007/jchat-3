/**
 * receiptColor.ts — pure helpers for receipt brand color + contrast.
 *
 * Safe to import from Server Components and Client Components alike
 * (no DOM, no browser APIs, no side effects).
 *
 * WCAG relative luminance (IEC 61966-2-1 sRGB linearization).
 */

/** Relative luminance of a #RRGGBB hex color (0 = black, 1 = white). */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const r = toLinear(parseInt(h.slice(0, 2), 16) / 255);
  const g = toLinear(parseInt(h.slice(2, 4), 16) / 255);
  const b = toLinear(parseInt(h.slice(4, 6), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Returns the legible text color to place ON TOP of `hexBg`.
 * Threshold 0.55: colors with lum > 0.55 are considered "light" → dark text.
 * Default JChat blue (#5C7CFA) has lum ≈ 0.243 → white text ✅.
 */
export function textOn(hexBg: string): "#111827" | "#ffffff" {
  try {
    return luminance(hexBg) > 0.55 ? "#111827" : "#ffffff";
  } catch {
    return "#ffffff";
  }
}

/**
 * Returns a version of `hex` that is readable on a WHITE (#fff) background.
 * If the color is too light (lum > 0.7), it's darkened by 50%.
 * Use for: TOTAL value, "Ver menú" link, accent text on white card areas.
 */
export function accentOnWhite(hex: string): string {
  try {
    if (luminance(hex) > 0.7) {
      const h = hex.replace("#", "");
      const darken = (s: number, e: number) =>
        Math.round(parseInt(h.slice(s, e), 16) * 0.5)
          .toString(16)
          .padStart(2, "0");
      return `#${darken(0, 2)}${darken(2, 4)}${darken(4, 6)}`;
    }
    return hex;
  } catch {
    return hex;
  }
}

/** Default JChat brand color used when the business hasn't set one. */
export const DEFAULT_BRAND_COLOR = "#5C7CFA";

/**
 * Returns the business's brand color if valid, or the JChat default.
 * Accepts null/undefined safely.
 */
export function brandColorOrDefault(hex: string | null | undefined): string {
  if (!hex) return DEFAULT_BRAND_COLOR;
  const trimmed = hex.trim();
  // Accept exactly #RRGGBB (6-char hex)
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  return DEFAULT_BRAND_COLOR;
}

/** Preset palette for the receipt brand color picker (10 swatches). */
export const RECEIPT_COLOR_SWATCHES: string[] = [
  "#5C7CFA", // JChat blue (default)
  "#7C3AED", // purple
  "#1D9E75", // green
  "#D97706", // gold
  "#ef4444", // red
  "#0ea5e9", // sky blue
  "#ec4899", // pink
  "#64748b", // slate
  "#111827", // near-black
  "#b45309", // amber-dark
];
