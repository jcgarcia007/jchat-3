import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Re-renders a local photo so its pixels are upright: iPhone photos are stored sideways with an EXIF
 * orientation flag that Supabase Storage / <Image> in some viewers ignore, so a portrait photo showed up
 * rotated 90° in the profile grid. The manipulator applies the EXIF rotation when it renders, and the
 * saved file carries no rotation flag. GIFs are left alone (they would lose their animation); PNGs stay PNG.
 * If anything fails the original uri is returned: a photo that uploads sideways is better than none.
 */
export async function normalizeImageUri(uri: string, mimeType?: string | null): Promise<{ uri: string; mimeType: string }> {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime === 'image/gif') return { uri, mimeType: mime };
  const png = mime === 'image/png';
  try {
    const ref = await ImageManipulator.manipulate(uri).renderAsync();
    const saved = await ref.saveAsync(png ? { format: SaveFormat.PNG } : { format: SaveFormat.JPEG, compress: 0.9 });
    return { uri: saved.uri, mimeType: png ? 'image/png' : 'image/jpeg' };
  } catch (error) {
    console.warn('[normalizeImage] could not normalize the photo, using the original:', error);
    return { uri, mimeType: mime || 'image/jpeg' };
  }
}
