/**
 * JChat 3.0 — change my avatar from anywhere (the chat's "Cambiar foto"): pick a photo → (web: crop to a centered
 * 512 px square) → upload to the `avatars` bucket → set users.avatar_url → announce it (services/profileEvents) so
 * the chat shows it at once. Same bucket / column / upload helper as EditProfile.
 */

import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import i18n from '../i18n';
import { pickPhotoFromLibrary } from './photoPicker';
import { showAlert } from '../utils/dialog';
import { AVATAR_SIDE, avatarOutputSide, centerSquareCrop } from '../utils/squareCrop';
import { AVATAR_LARGE_SIDE, AVATAR_SMALL_SIDE, avatarPairNames } from '../utils/avatarUrls';
import { emitMyProfileChanged } from './profileEvents';
import { uploadImage } from './storage';
import { isSupabaseConfigured, supabase } from './supabase';

const AVATAR_BUCKET = 'avatars';

/** Web: centered square, scaled to AVATAR_SIDE, JPEG. (No system editor on the web, so the crop happens here.) */
async function cropToSquareWeb(uri: string): Promise<{ uri: string; mimeType: string }> {
  const source = await ImageManipulator.manipulate(uri).renderAsync();
  const rect = centerSquareCrop(source.width, source.height);
  if (rect.width === 0) return { uri, mimeType: 'image/jpeg' };
  const cropped = ImageManipulator.manipulate(source);
  cropped.crop(rect);
  const croppedRef = await cropped.renderAsync();
  const scaled = ImageManipulator.manipulate(croppedRef);
  const side = avatarOutputSide(rect.width, AVATAR_SIDE);
  if (side !== rect.width) scaled.resize({ width: side, height: side });
  const saved = await (await scaled.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return { uri: saved.uri, mimeType: 'image/jpeg' };
}

/**
 * Uploads an avatar as TWO versions under my folder in the `avatars` bucket: `<ts>.jpg` (256 px, what users.avatar_url points to: lists, chats) and
 * `<ts>@2x.jpg` (1024 px, never enlarged: the profile header and the full-screen viewer). Resolves the SMALL one's public URL.
 *
 * The photo is cut to a centred square first. If it cannot be processed the original goes up as the single (legacy) avatar, and if only the big one fails
 * the avatar still works: whoever asks for the missing big file falls back to the small one. Nothing changes in the bucket or its policies: the same
 * folder, the same helper, two objects instead of one.
 * (Demo mode, without a backend, keeps the local file.)
 */
export async function uploadAvatarPair(userId: string, localUri: string, mimeType?: string | null): Promise<string> {
  if (!isSupabaseConfigured) return localUri;

  let small: string;
  let large: string;
  try {
    const source = await ImageManipulator.manipulate(localUri).renderAsync();
    const rect = centerSquareCrop(source.width, source.height);
    if (rect.width === 0) throw new Error('avatar has no area');
    const square = ImageManipulator.manipulate(source);
    square.crop(rect);
    const squareRef = await square.renderAsync();
    const render = async (target: number): Promise<string> => {
      const side = avatarOutputSide(rect.width, target);
      const context = ImageManipulator.manipulate(squareRef);
      if (side !== rect.width) context.resize({ width: side, height: side });
      return (await (await context.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85 })).uri;
    };
    small = await render(AVATAR_SMALL_SIDE);
    large = await render(AVATAR_LARGE_SIDE);
  } catch (err) {
    console.warn('[avatar] could not make the two versions; uploading the photo as it is', err);
    return uploadImage(userId, localUri, AVATAR_BUCKET, mimeType);
  }

  const names = avatarPairNames(Date.now());
  const smallUrl = await uploadImage(userId, small, AVATAR_BUCKET, 'image/jpeg', names.small);
  try {
    await uploadImage(userId, large, AVATAR_BUCKET, 'image/jpeg', names.large);
  } catch (err) {
    console.warn('[avatar] the big version did not upload; the small one is used everywhere', err);
  }
  return smallUrl;
}

/**
 * Picks a photo and makes it my avatar. Resolves the new public URL, or null if the person cancelled or it failed
 * (a translated notice has been shown in that case).
 */
export async function changeMyAvatar(userId: string): Promise<string | null> {
  // No library permission (services/photoPicker.ts).
  const result = await pickPhotoFromLibrary({
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (!result || result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];

  try {
    const prepared = Platform.OS === 'web' ? await cropToSquareWeb(asset.uri) : { uri: asset.uri, mimeType: asset.mimeType ?? null };
    const url = await uploadAvatarPair(userId, prepared.uri, prepared.mimeType);
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('users').update({ avatar_url: url, updated_at: new Date().toISOString() }).eq('id', userId);
      if (error) throw error;
    }
    emitMyProfileChanged({ userId, avatarUrl: url });
    return url;
  } catch (err) {
    console.warn('[avatar] could not change the avatar', err);
    showAlert(i18n.t('edit.saveFailedTitle', { ns: 'profile' }) as string, i18n.t('edit.avatarChangeFailed', { ns: 'profile' }) as string);
    return null;
  }
}
