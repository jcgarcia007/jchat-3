/**
 * Geometry of the tab bar and of its notch (pure: no React, so scripts/notch-geometry.test.mjs can check it).
 *
 * Measures of the "JChat · Perfil" canvas (LG1/LG2/LG3): the bar is BAR_HEIGHT (64) tall with fully rounded ends; the centre button is 64 and its
 * centre sits CENTER_Y (2 pt) below the bar's top edge. The notch is a circle of radius BOWL_RADIUS (39) with the SAME centre as the button, so the gap
 * all round is 39 − 32 = 7 pt. It opens 2 × OPENING_HALF_WIDTH (106) wide on the top edge. Between the flat top and the bowl there are two
 * rounded shoulders: arcs tangent to the top edge and to the bowl (radius ≈ 15.76, solved from the opening), so the outline has no corner. (The
 * canvas drew the shoulders as a cubic that met the bowl with a ~21° kink.)
 *
 * Coordinates: x across the bar, y down from its top edge.
 */
export const BAR_HEIGHT = 64;
export const BAR_CORNER = BAR_HEIGHT / 2;
export const BUTTON_SIZE = 64;
export const BOWL_RADIUS = 39;
/** Centre of the button (and of the bowl) below the top edge. */
export const CENTER_Y = 2;
/** Half of the opening of the notch on the top edge. */
export const OPENING_HALF_WIDTH = 53;
/** Room reserved in the middle of the bar for the notch: the two groups of tabs share the rest. */
export const NOTCH_ROOM = 112;
/** The gap between the button and the bowl, all the way round. */
export const NOTCH_GAP = BOWL_RADIUS - BUTTON_SIZE / 2;

export interface NotchGeometry {
  bowl: number;
  centerY: number;
  openingHalfWidth: number;
  /** Radius of the shoulder arcs. */
  fillet: number;
  /** Where a shoulder meets the bowl, relative to the centre x: (±jointX, jointY). */
  jointX: number;
  jointY: number;
  /** Depth of the notch below the top edge. */
  depth: number;
}

export function notchGeometry(): NotchGeometry {
  const R = BOWL_RADIUS;
  const cy = CENTER_Y;
  const half = OPENING_HALF_WIDTH;
  // The shoulder's centre is (half away from the notch centre, fillet below the top edge): tangent to y = 0, and at distance R + fillet from the bowl's centre.
  const fillet = (half * half + cy * cy - R * R) / (2 * (R + cy));
  const dx = -half;
  const dy = fillet - cy;
  const length = Math.hypot(dx, dy); // = R + fillet
  return {
    bowl: R,
    centerY: cy,
    openingHalfWidth: half,
    fillet,
    jointX: (R * -dx) / length,
    jointY: cy + (R * dy) / length,
    depth: R + cy,
  };
}

const n = (value: number) => Math.round(value * 1000) / 1000;

/** SVG path commands for the notch, from the flat top left of it to the flat top right of it. */
export function notchSegment(center: number, g: NotchGeometry = notchGeometry()): string[] {
  return [
    `H ${n(center - g.openingHalfWidth)}`,
    `A ${n(g.fillet)} ${n(g.fillet)} 0 0 1 ${n(center - g.jointX)} ${n(g.jointY)}`,
    `A ${g.bowl} ${g.bowl} 0 0 0 ${n(center + g.jointX)} ${n(g.jointY)}`,
    `A ${n(g.fillet)} ${n(g.fillet)} 0 0 1 ${n(center + g.openingHalfWidth)} 0`,
  ];
}

/** The whole closed outline of a bar `width` wide. */
export function barPath(width: number): string {
  const r = BAR_CORNER;
  return [
    `M ${r} 0`,
    ...notchSegment(width / 2),
    `H ${width - r}`,
    `A ${r} ${r} 0 0 1 ${width} ${r}`,
    `A ${r} ${r} 0 0 1 ${width - r} ${BAR_HEIGHT}`,
    `H ${r}`,
    `A ${r} ${r} 0 0 1 0 ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    'Z',
  ].join(' ');
}
