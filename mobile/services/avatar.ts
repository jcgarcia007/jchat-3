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
    const url = await uploadImage(userId, prepared.uri, AVATAR_BUCKET, prepared.mimeType);
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
