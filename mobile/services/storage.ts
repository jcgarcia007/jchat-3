/**
 * JChat 3.0 — Storage service
 *
 * Shared upload helpers for Supabase Storage.
 * The file bytes come from services/uploadBody (expo-file-system + base64-arraybuffer on device, because React
 * Native / Hermes cannot create Blobs from fetch() responses; fetch().blob() on web).
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { fileExtension, uriToUploadBody } from './uploadBody';

/**
 * Upload a local image URI to the given Supabase Storage bucket.
 *
 * @param userId   — the authenticated user's UUID (used as the folder prefix)
 * @param localUri — file:// URI returned by expo-image-picker or expo-camera
 * @param bucket   — target bucket id (e.g. 'post-media', 'avatars', 'covers')
 * @param mimeType — the picker's MIME type, when known (web: blob: URIs have no extension to read it from)
 * @returns public URL of the uploaded file, or the original localUri in demo mode
 */
export async function uploadImage(
  userId: string,
  localUri: string,
  bucket: string,
  mimeType?: string | null,
): Promise<string> {
  if (!isSupabaseConfigured) return localUri;

  // Device: base64 → ArrayBuffer (React Native / Hermes cannot build a Blob from a fetch() response).
  // Web: the file as a Blob. See services/uploadBody.
  const arrayBuffer = await uriToUploadBody(localUri, mimeType);
  const bodyType = typeof Blob !== 'undefined' && arrayBuffer instanceof Blob ? arrayBuffer.type : undefined;

  const ext = fileExtension(localUri, mimeType ?? bodyType);
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, arrayBuffer, { contentType, upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
