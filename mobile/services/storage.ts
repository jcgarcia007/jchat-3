/**
 * JChat 3.0 — Storage service
 *
 * Shared upload helpers for Supabase Storage.
 * Used by EditProfileScreen (avatars/covers) and ChatRoomScreen (chat photos).
 */

import { supabase, isSupabaseConfigured } from './supabase';

/**
 * Upload a local image URI to the given Supabase Storage bucket.
 *
 * @param userId   — the authenticated user's UUID (used as the folder name)
 * @param localUri — file:// URI returned by expo-image-picker
 * @param bucket   — target bucket id (e.g. 'avatars', 'post-media')
 * @returns public URL of the uploaded file, or the original localUri in demo mode
 */
export async function uploadImage(
  userId: string,
  localUri: string,
  bucket: string,
): Promise<string> {
  if (!isSupabaseConfigured) return localUri;

  const response = await fetch(localUri);
  const blob = await response.blob();

  const ext = localUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType, upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
