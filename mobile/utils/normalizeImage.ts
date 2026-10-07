import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Re-renders a local photo so its pixels are upright: iPhone photos are stored sideways with an EXIF
 * orientation flag that Supabase Storage / <Image> in some viewers ignore, so a portrait photo showed up
 * rotated 90° in the profile grid. The manipulator applies the EXIF rotation when it renders, and the
 * saved file carries no rotation flag. The same pass caps the longest side at 2000 px and compresses (JPEG q≈0.85),
 * so a 12 MP phone photo no longer uploads as 4-6 MB. GIFs are left alone (they would lose their animation); PNGs stay
 * PNG (resized). If anything fails the original uri is returned: a photo that uploads heavy or sideways is better
 * than none.
 */
export const MAX_UPLOAD_SIDE = 2000;
const JPEG_QUALITY = 0.85;

export async function normalizeImageUri(uri: string, mimeType?: string | null): Promise<{ uri: string; mimeType: string }> {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime === 'image/gif') return { uri, mimeType: mime };
  const png = mime === 'image/png';
  try {
    let ref = await ImageManipulator.manipulate(uri).renderAsync();
    if (Math.max(ref.width, ref.height) > MAX_UPLOAD_SIDE) {
      const resized = ImageManipulator.manipulate(ref);
      resized.resize(ref.width >= ref.height ? { width: MAX_UPLOAD_SIDE } : { height: MAX_UPLOAD_SIDE });
      ref = await resized.renderAsync();
    }
    const saved = await ref.saveAsync(png ? { format: SaveFormat.PNG } : { format: SaveFormat.JPEG, compress: JPEG_QUALITY });
    return { uri: saved.uri, mimeType: png ? 'image/png' : 'image/jpeg' };
  } catch (error) {
    console.warn('[normalizeImage] could not normalize the photo, using the original:', error);
    return { uri, mimeType: mime || 'image/jpeg' };
  }
}
