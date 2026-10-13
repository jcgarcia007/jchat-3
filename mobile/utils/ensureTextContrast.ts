/**
 * JChat 3.0 — ensureTextContrast: a pure helper that keeps a venue's chosen theme colour readable AS TEXT.
 *
 * Chat themes are set by the venue and their accent (the decorative colour: underline, bubble) must not change.
 * But the text of the active room tab uses that accent, and some accents do not reach the WCAG minimum on their own
 * top bar (e.g. #5068e0 on #dddfe8 is 3.6:1). `ensureTextContrast(fg, bg, 4.5)` returns `fg` untouched when it
 * already passes; otherwise it darkens (light background) or lightens (dark background) the SAME colour — mixing it
 * toward black / white in small steps, so the hue stays recognisable — until the ratio is reached.
 * Translucent colours (rgba) are flattened over `bg` first. Colours: #rgb, #rrggbb, rgb(), rgba().
 */

type Rgb = { r: number; g: number; b: number };

function parse(value: string): { rgb: Rgb; alpha: number } | null {
  const v = value.trim().toLowerCase();
  if (v.startsWith('#')) {
    const hex = v.length === 4 ? `#${[...v.slice(1)].map((x) => x + x).join('')}` : v;
    if (!/^#[0-9a-f]{6}$/.test(hex)) return null;
    return { rgb: { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) }, alpha: 1 };
  }
  const m = v.match(/^rgba?\(([^)]+)\)$/);
  if (!m) return null;
  const [r, g, b, a = '1'] = m[1].split(',').map((x) => Number(x.trim()));
  return { rgb: { r, g, b }, alpha: Number(a) };
}

function luminance({ r, g, b }: Rgb): number {
  const lin = [r, g, b].map((x) => {
    const c = x / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function ratio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const hex = ({ r, g, b }: Rgb) => `#${[r, g, b].map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0')).join('')}`;

function flatten(fg: { rgb: Rgb; alpha: number }, bg: Rgb): Rgb {
  const a = fg.alpha;
  return { r: fg.rgb.r * a + bg.r * (1 - a), g: fg.rgb.g * a + bg.g * (1 - a), b: fg.rgb.b * a + bg.b * (1 - a) };
}

/** WCAG contrast ratio of `fg` over an opaque `bg` (translucent `fg` is flattened over `bg`). NaN if unparsable. */
export function contrastRatio(fg: string, bg: string): number {
  const f = parse(fg);
  const b = parse(bg);
  if (!f || !b) return Number.NaN;
  return ratio(flatten(f, b.rgb), b.rgb);
}

/** `fg` if it has at least `min`:1 over `bg`, else the nearest same-hue colour that does. Unparsable input is returned as is. */
export function ensureTextContrast(fg: string, bg: string, min = 4.5): string {
  const f = parse(fg);
  const b = parse(bg);
  if (!f || !b) return fg;
  const solid = flatten(f, b.rgb);
  if (ratio(solid, b.rgb) >= min) return fg;
  const target: Rgb = luminance(b.rgb) > 0.4 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  for (let step = 1; step <= 100; step += 1) {
    const t = step / 100;
    const mixed = { r: solid.r + (target.r - solid.r) * t, g: solid.g + (target.g - solid.g) * t, b: solid.b + (target.b - solid.b) * t };
    const rounded = { r: Math.round(mixed.r), g: Math.round(mixed.g), b: Math.round(mixed.b) };
    if (ratio(rounded, b.rgb) >= min) return hex(rounded);
  }
  return hex(target);
}
