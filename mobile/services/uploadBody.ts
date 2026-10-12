/**
 * JChat 3.0 — upload bodies (iOS / Android): a local file URI → the bytes Supabase Storage uploads.
 *
 * React Native / Hermes cannot build a Blob from a fetch() response on device, so the file is read as base64
 * with expo-file-system and decoded to an ArrayBuffer — EXACTLY the code every upload service had inline.
 * The web build resolves uploadBody.web.ts (blob: / data: URIs, which expo-file-system cannot read there).
 */

import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

export async function uriToUploadBody(uri: string, _mimeType?: string | null): Promise<ArrayBuffer | Blob> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return decode(base64);
}

/** File extension of a picked / recorded file: the one in its URI (what the services always did). */
export function fileExtension(uri: string, _mimeType?: string | null): string {
  return uri.split('.').pop()?.toLowerCase() ?? 'jpg';
}
