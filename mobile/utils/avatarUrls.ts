/**
 * The two versions of an avatar (pure: no React Native, a Node test loads it).
 *
 * Uploading an avatar stores TWO JPEGs in the `avatars` bucket, side by side under the person's folder:
 *   <uid>/<ts>.jpg      256 px  → what `users.avatar_url` points to (lists, chats, the compact header)
 *   <uid>/<ts>@2x.jpg   1024 px → the profile header and the full-screen viewer
 * The big URL is DERIVED from the small one (no column, no migration). People who uploaded before this have no `@2x` file: asking for it fails and the
 * callers fall back to the small one.
 */

export const AVATAR_SMALL_SIDE = 256;
export const AVATAR_LARGE_SIDE = 1024;

/** `…/avatars/<uid>/<ts>.jpg` (optionally with a query string) → `…/avatars/<uid>/<ts>@2x.jpg`. null for anything that is not one of our avatars. */
export function largeAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = /^(.*\/avatars\/[^/?#]+\/\d+)(\.(?:jpe?g|png|webp))(\?.*)?$/i.exec(url);
  if (!match) return null;
  return `${match[1]}@2x${match[2]}${match[3] ?? ''}`;
}

/** The file names (without extension) of a pair uploaded at time `timestamp`. */
export function avatarPairNames(timestamp: number): { small: string; large: string } {
  return { small: String(timestamp), large: `${timestamp}@2x` };
}
