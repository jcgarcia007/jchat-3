/**
 * JChat 3.0 — Text for the native share sheet of a post.
 *
 * Business post → short caption + https://jchat.cloud/b/{slug} (falls back to the business id).
 * Personal post → short caption + "@username on JChat" + https://jchat.cloud — nothing else:
 * no geotag, no media and no link to the post (there is no public page for personal posts).
 */

import type { TFunction } from 'i18next';
import type { PostRow } from '../services/posts';

const SITE = 'https://jchat.cloud';
const MAX_CAPTION = 140;

function shortCaption(caption: string | null | undefined): string {
  const text = (caption ?? '').replace(/\s+/g, ' ').trim();
  return text.length > MAX_CAPTION ? `${text.slice(0, MAX_CAPTION - 1).trimEnd()}…` : text;
}

export function buildPostShareMessage(post: PostRow, t: TFunction): string {
  const caption = shortCaption(post.caption);

  if (post.business_id || post.business) {
    const slugOrId = post.business?.slug || post.business_id || '';
    const url = slugOrId ? `${SITE}/b/${slugOrId}` : SITE;
    const lead = caption || post.business?.name || '';
    return lead ? `${lead}\n${url}` : url;
  }

  const username = post.author?.username;
  const byline = username ? t('post.shareOnJChat', { username }) : 'JChat';
  return [caption, byline, SITE].filter(Boolean).join('\n');
}
