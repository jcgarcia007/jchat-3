/**
 * JChat 3.0 — Posts data access (Stage 1, shared by Feed 1.9 + Create Post 1.10)
 * Wraps the shared `supabase` client. Tables from 002_social_schema.sql:
 * posts(user_id, caption, media_urls[], geotag, created_at), post_likes, comments.
 */

import { supabase, isSupabaseConfigured } from './supabase';

export interface PostAuthor {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

/** Business a post was published for (posts.business_id), when it is a business post. */
export interface PostBusiness {
  name: string;
  /** Public page slug (https://jchat.cloud/b/{slug}); used when sharing a business post. */
  slug?: string | null;
  icon_emoji: string | null;
  logo_url: string | null;
}

export interface PostRow {
  id: string;
  user_id: string;
  business_id?: string | null;
  business?: PostBusiness | null;
  caption: string | null;
  media_urls: string[];
  geotag: string | null;
  created_at: string;
  author?: PostAuthor | null;
  like_count?: number;
  comment_count?: number;
  liked_by_me?: boolean;
}

export interface CommentRow {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author?: PostAuthor | null;
}

export interface CreatePostInput {
  userId: string;
  caption?: string;
  mediaUrls?: string[];
  /** Manual text only — NEVER GPS (privacy rule). */
  geotag?: string;
}

const PAGE_SIZE = 20;

/** Following-only chronological feed. Returns posts from `followingIds`. */
export async function listFeed(
  followingIds: string[],
  page = 0,
): Promise<PostRow[]> {
  if (!isSupabaseConfigured || followingIds.length === 0) return [];
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, error } = await supabase
    .from('posts')
    .select('*, author:users!posts_user_id_fkey(id, username, display_name, avatar_url)')
    .in('user_id', followingIds)
    .is('business_id', null) // business posts live in the megaphone, not in personal feeds
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;
  return (data ?? []) as unknown as PostRow[];
}

/** Posts authored by a single user (profile grid). */
export async function getUserPosts(userId: string, page = 0): Promise<PostRow[]> {
  if (!isSupabaseConfigured) return [];
  const from = page * PAGE_SIZE;
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', userId)
    .is('business_id', null) // an owner's business posts never show on their personal profile
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  return (data ?? []) as unknown as PostRow[];
}

/** A single post with its public author fields for the detail screen. */
export async function getPostById(postId: string): Promise<PostRow | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('posts')
    .select('*, business:businesses(name, slug, icon_emoji, logo_url)')
    .eq('id', postId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as PostRow | null;
}

export async function createPost(input: CreatePostInput): Promise<PostRow> {
  const { data, error } = await supabase
    .from('posts')
    .insert({
      user_id: input.userId,
      caption: input.caption ?? null,
      media_urls: input.mediaUrls ?? [],
      geotag: input.geotag ?? null, // manual text only
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as PostRow;
}

/**
 * Upload a local image to Supabase Storage and return its public URL.
 *
 * Posts are PERMANENT, so they live in the `profile-media` bucket — SEPARATE from
 * `post-media`, which is now exclusive to the ephemeral venue chat (24h TTL purge).
 * Keeping them apart means the chat purge never touches permanent post photos
 * (Fase C / decision D-13). Paths stay under `{userId}/`; the first folder = the
 * uploader's uid, which the Storage RLS enforces on insert.
 * Returns the input uri unchanged when Supabase isn't configured so the UI works.
 */
export async function uploadPostMedia(
  userId: string,
  localUri: string,
  fileBody: ArrayBuffer | Blob,
  contentType = 'image/jpeg',
): Promise<string> {
  if (!isSupabaseConfigured) return localUri;
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const nonce = Math.random().toString(36).slice(2, 10);
  const path = `${userId}/${Date.now()}-${nonce}.${extension}`;
  const { error } = await supabase.storage
    .from('profile-media')
    .upload(path, fileBody, { contentType, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('profile-media').getPublicUrl(path);
  return data.publicUrl;
}

function profileMediaPath(publicUrl: string): string | null {
  const marker = '/storage/v1/object/public/profile-media/';
  const index = publicUrl.indexOf(marker);
  if (index < 0) return null;
  const encodedPath = publicUrl.slice(index + marker.length).split('?')[0];
  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return encodedPath;
  }
}

/** Remove uploaded post media. Used both for draft rollback and post deletion. */
export async function removePostMedia(mediaUrls: string[]): Promise<void> {
  if (!isSupabaseConfigured) return;
  const paths = mediaUrls.map(profileMediaPath).filter((path): path is string => Boolean(path));
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from('profile-media').remove(paths);
  if (error) throw error;
}

/** Delete an owned post, then best-effort remove its permanent media files. */
export async function deletePost(postId: string, userId: string): Promise<void> {
  const { data, error: readError } = await supabase
    .from('posts')
    .select('media_urls')
    .eq('id', postId)
    .eq('user_id', userId)
    .single();
  if (readError) throw readError;

  const { error: deleteError } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId)
    .eq('user_id', userId);
  if (deleteError) throw deleteError;

  try {
    await removePostMedia((data?.media_urls as string[] | null) ?? []);
  } catch (storageError) {
    console.warn('[posts] post deleted but media cleanup failed', storageError);
  }
}

export async function isPostLiked(postId: string, userId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const { data, error } = await supabase
    .from('post_likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function reportPost(
  reporterId: string,
  postId: string,
  authorId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: reporterId,
    reported_user_id: authorId,
    content_type: 'post',
    content_id: postId,
    reason,
    status: 'pending',
  });
  if (error) throw error;
}

export async function likePost(postId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('post_likes')
    .insert({ post_id: postId, user_id: userId });
  if (error && error.code !== '23505') throw error; // ignore duplicate like
}

export async function unlikePost(postId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('post_likes')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function getLikeCount(postId: string): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  const { count, error } = await supabase
    .from('post_likes')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', postId);
  if (error) throw error;
  return count ?? 0;
}

export async function getComments(postId: string): Promise<CommentRow[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as CommentRow[];
  const authorIds = [...new Set(rows.map((row) => row.user_id))];
  if (authorIds.length === 0) return rows;
  const { data: authors, error: authorError } = await supabase
    .from('public_profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', authorIds);
  if (authorError) throw authorError;
  const byId = new Map((authors ?? []).map((author) => [author.id, author as PostAuthor]));
  return rows.map((row) => ({ ...row, author: byId.get(row.user_id) ?? null }));
}

export async function addComment(
  postId: string,
  userId: string,
  body: string,
): Promise<CommentRow> {
  const { data, error } = await supabase
    .from('comments')
    .insert({ post_id: postId, user_id: userId, body })
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as CommentRow;
}
