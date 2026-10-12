/**
 * JChat 3.0 — center square crop (pure). The web has no system photo editor, so a picked avatar is cropped to a
 * centered square here (expo-image-manipulator on a canvas) and scaled to AVATAR_SIDE before it is uploaded.
 */

export const AVATAR_SIDE = 512;

export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/** The largest centered square of a width x height image (integer pixels). Empty for a degenerate size. */
export function centerSquareCrop(width: number, height: number): CropRect {
  const w = Math.floor(width);
  const h = Math.floor(height);
  if (!(w > 0) || !(h > 0)) return { originX: 0, originY: 0, width: 0, height: 0 };
  const side = Math.min(w, h);
  return { originX: Math.floor((w - side) / 2), originY: Math.floor((h - side) / 2), width: side, height: side };
}

/** The side to scale the cropped square to: AVATAR_SIDE, never enlarged beyond the source. */
export function avatarOutputSide(cropSide: number, target = AVATAR_SIDE): number {
  return Math.max(1, Math.min(Math.floor(cropSide), target));
}
