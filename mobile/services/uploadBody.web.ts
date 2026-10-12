/**
 * JChat 3.0 — upload bodies (web): a picked / recorded file arrives as a `blob:` (or `data:`) URI, which
 * expo-file-system cannot read in the browser, but fetch() can: fetch(uri).blob() is the file itself.
 * `mimeType` (the picker's, when it has one) wins over the blob's own type, which can be empty.
 */

export async function uriToUploadBody(uri: string, mimeType?: string | null): Promise<ArrayBuffer | Blob> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`upload_source_unreadable:${response.status}`);
  const blob = await response.blob();
  return mimeType && blob.type !== mimeType ? new Blob([blob], { type: mimeType }) : blob;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
};

/**
 * A blob: URI carries no extension (`blob:https://host/<uuid>`; splitting it on "." would give a broken path),
 * so the extension comes from the MIME type; JPEG when it is unknown.
 */
export function fileExtension(_uri: string, mimeType?: string | null): string {
  return EXTENSIONS[(mimeType ?? '').toLowerCase().split(';')[0].trim()] ?? 'jpg';
}
