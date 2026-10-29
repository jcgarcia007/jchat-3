/**
 * Geometry of the notch of the tab bar (pure: no React, so scripts/notch-shape.test.mjs can check it).
 *
 * The bowl is a CIRCLE concentric with the centre button (same centre, radius = button radius + GAP), so the gap between the button and the bar
 * is the same all the way round. Where the bowl meets the flat top of the bar there are two convex FILLETS (rounded shoulders) of radius
 * FILLET: each is tangent to the flat top and tangent to the bowl, so the outline has no corner and no flat spot. The old outline was a
 * flat-bottomed U (two cubic curves): 4 pt of gap under the button and ~20 pt at the sides, with abrupt shoulders.
 *
 * Coordinates: x across the bar, y down from the bar's top edge; the button's centre sits ON the top edge (y = 0).
 */
export const BUTTON_RADIUS = 30;
export const NOTCH_GAP = 6;
export const NOTCH_FILLET = 18;

export interface NotchGeometry {
  /** Bowl radius = button radius + gap (also the depth of the notch). */
  bowl: number;
  fillet: number;
  /** Half width of the notch measured on the flat top: where the outline leaves y = 0. */
  halfWidth: number;
  /** Tangent point between a shoulder and the bowl, relative to the centre: (±px, py). */
  px: number;
  py: number;
}

export function notchGeometry(buttonRadius = BUTTON_RADIUS, gap = NOTCH_GAP, fillet = NOTCH_FILLET): NotchGeometry {
  const bowl = buttonRadius + gap;
  // The fillet's centre is (cx, fillet): tangent to y = 0, and at distance bowl + fillet from the bowl's centre (c, 0).
  const halfWidth = Math.sqrt((bowl + fillet) ** 2 - fillet ** 2);
  const px = (bowl * halfWidth) / (bowl + fillet);
  const py = (bowl * fillet) / (bowl + fillet);
  return { bowl, fillet, halfWidth, px, py };
}

const n = (value: number) => Math.round(value * 1000) / 1000;

/** SVG path commands from the flat top, left of the notch, to the flat top, right of it (the caller draws the rest of the bar). */
export function notchSegment(center: number, g: NotchGeometry = notchGeometry()): string[] {
  return [
    `H ${n(center - g.halfWidth)}`,
    // left shoulder (convex, clockwise), the bowl (concave, counter-clockwise, less than a half turn), right shoulder
    `A ${g.fillet} ${g.fillet} 0 0 1 ${n(center - g.px)} ${n(g.py)}`,
    `A ${g.bowl} ${g.bowl} 0 0 0 ${n(center + g.px)} ${n(g.py)}`,
    `A ${g.fillet} ${g.fillet} 0 0 1 ${n(center + g.halfWidth)} 0`,
  ];
}
