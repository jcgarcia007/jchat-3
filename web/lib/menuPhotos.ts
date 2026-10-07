/**
 * Menu photo variants, generated in the browser before upload so the public menu never has to download a
 * multi-megabyte original:
 *   • full  — max 1280 px on the long side, webp q≈0.8   (photo_url / menu_item_photos.url point here)
 *   • thumb — max 400 px, webp q≈0.75, stored next to it with the fixed suffix `_thumb.webp`
 * Convention: thumb path = full path with `.webp` replaced by `_thumb.webp`. No extra columns. Photos uploaded
 * before this existed have no thumb (and are not .webp): the public menu falls back to the original.
 */

export const MENU_PHOTO_FULL_MAX = 1280;
export const MENU_PHOTO_THUMB_MAX = 400;
const FULL_QUALITY = 0.8;
const THUMB_QUALITY = 0.75;

/** Re-renders the image so its longest side is at most `maxSide` (never upscaled) and encodes it as webp. */
export async function resizeToWebp(file: Blob, maxSide: number, quality: number): Promise<Blob | null> {
  // 'from-image' applies the EXIF orientation, so portrait phone photos are not stored sideways.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    // A browser that cannot encode webp silently returns png: treat that as "not available".
    return blob && blob.type === "image/webp" ? blob : null;
  } finally {
    bitmap.close();
  }
}

export interface MenuPhotoVariants {
  full: Blob;
  /** null when the browser cannot encode webp (the full photo is then uploaded as is). */
  thumb: Blob | null;
  /** True when `full` was re-encoded (extension .webp); false when it is the untouched original. */
  reencoded: boolean;
}

export async function makeMenuPhotoVariants(file: File): Promise<MenuPhotoVariants> {
  try {
    const [full, thumb] = await Promise.all([
      resizeToWebp(file, MENU_PHOTO_FULL_MAX, FULL_QUALITY),
      resizeToWebp(file, MENU_PHOTO_THUMB_MAX, THUMB_QUALITY),
    ]);
    if (full) return { full, thumb, reencoded: true };
  } catch (error) {
    console.warn("[menuPhotos] could not re-encode the photo, uploading the original:", error);
  }
  return { full: file, thumb: null, reencoded: false };
}

/** `a/b/c.webp` → `a/b/c_thumb.webp`; null for anything that is not a .webp path. */
export function thumbPathFor(fullPath: string): string | null {
  return /\.webp$/i.test(fullPath) && !/_thumb\.webp$/i.test(fullPath) ? fullPath.replace(/\.webp$/i, "_thumb.webp") : null;
}

/** Public URL of the thumb of a menu photo, or null when this URL cannot have one. */
export function thumbUrlFor(url: string): string | null {
  if (!url.includes("/menu-photos/")) return null;
  const [base, query] = url.split("?");
  const thumb = thumbPathFor(base);
  return thumb ? (query ? `${thumb}?${query}` : thumb) : null;
}
