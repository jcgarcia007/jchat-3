/**
 * JChat 3.0 — Storage service
 *
 * Shared upload helpers for Supabase Storage.
 * Uses expo-file-system + base64-arraybuffer because React Native / Hermes
 * does not support creating Blobs from fetch() responses on device.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase, isSupabaseConfigured } from './supabase';

/**
 * Upload a local image URI to the given Supabase Storage bucket.
 *
 * @param userId   — the authenticated user's UUID (used as the folder prefix)
 * @param localUri — file:// URI returned by expo-image-picker or expo-camera
 * @param bucket   — target bucket id (e.g. 'post-media', 'avatars', 'covers')
 * @returns public URL of the uploaded file, or the original localUri in demo mode
 */
export async function uploadImage(
  userId: string,
  localUri: string,
  bucket: string,
): Promise<string> {
  if (!isSupabaseConfigured) return localUri;

  // Read the file as base64, then decode to an ArrayBuffer. React Native / Hermes
  // cannot build a Blob from a fetch() response, so this is the reliable path.
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const arrayBuffer = decode(base64);

  const ext = localUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, arrayBuffer, { contentType, upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
