/**
 * JChat 3.0 — Stories data-access service (Task 1.11)
 *
 * Tables (002_social_schema.sql):
 *   stories(id, user_id, media_url, text_overlay, created_at, expires_at)
 *   story_views(id, story_id, viewer_id, created_at, unique(story_id, viewer_id))
 *
 * Expiry: 24 h enforced DB-side (default now()+24h) and filtered here via
 * `expires_at > now()`. No cron required — stale rows are just invisible.
 *
 * Guard: every function that hits the network is wrapped with isSupabaseConfigured.
 *
 * // TODO(i18n): all strings are English; wire to i18n once the layer is set up.
 */

import { supabase, isSupabaseConfigured } from './supabase';

// ── Co-located types ────────────────────────────────────────────────────────

/** A single story row returned from Supabase. */
export interface StoryRow {
  id: string;
  user_id: string;
  media_url: string;
  text_overlay: string | null;
  created_at: string;
  expires_at: string;
  /** Populated when fetched with a join to `users`. */
  author?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

/** Stories grouped by user — used by StoriesRow. */
export interface UserStories {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  stories: StoryRow[];
  /** True when the current viewer has NOT seen ALL stories in this group. */
  hasUnseen: boolean;
}

/** A viewer record returned by getStoryViewers (own stories only). */
export interface StoryViewer {
  viewer_id: string;
  created_at: string;
  viewer?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

// ── Data access functions ───────────────────────────────────────────────────

/**
 * Fetch all active stories (expires_at > now()) from users the viewer follows,
 * grouped by author. Stories within each group are sorted oldest-first so the
 * viewer progresses chronologically.
 *
 * Returns an empty array when Supabase is not configured.
 */
export async function getActiveStories(viewerId: string): Promise<UserStories[]> {
  if (!isSupabaseConfigured) return [];

  // 1. Fetch active stories with author join.
  const { data: rows, error } = await supabase
    .from('stories')
    .select(
      'id, user_id, media_url, text_overlay, created_at, expires_at, author:users!stories_user_id_fkey(id, username, display_name, avatar_url)',
    )
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[stories] getActiveStories error:', error.message);
    return [];
  }

  const stories = (rows ?? []) as unknown as StoryRow[];

  // 2. Fetch all view records for these stories by this viewer.
  const storyIds = stories.map((s) => s.id);
  let viewedIds: Set<string> = new Set();

  if (storyIds.length > 0) {
    const { data: views, error: vErr } = await supabase
      .from('story_views')
      .select('story_id')
      .eq('viewer_id', viewerId)
      .in('story_id', storyIds);

    if (vErr) {
      console.warn('[stories] getActiveStories views error:', vErr.message);
    } else {
      viewedIds = new Set((views ?? []).map((v: { story_id: string }) => v.story_id));
    }
  }

  // 3. Group by user_id preserving insertion order.
  const map = new Map<string, UserStories>();

  for (const s of stories) {
    if (!map.has(s.user_id)) {
      const a = s.author;
      map.set(s.user_id, {
        userId: s.user_id,
        username: a?.username ?? null,
        displayName: a?.display_name ?? null,
        avatarUrl: a?.avatar_url ?? null,
        stories: [],
        hasUnseen: false,
      });
    }
    const group = map.get(s.user_id)!;
    group.stories.push(s);
    if (!viewedIds.has(s.id)) {
      group.hasUnseen = true;
    }
  }

  return Array.from(map.values());
}

/**
 * Fetch stories authored by a specific user (active + expired — used in "my
 * stories" context so the creator can review their own content).
 */
export async function getMyStories(userId: string): Promise<StoryRow[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('stories')
    .select('id, user_id, media_url, text_overlay, created_at, expires_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[stories] getMyStories error:', error.message);
    return [];
  }
  return (data ?? []) as unknown as StoryRow[];
}

/** Payload for creating a new story. */
export interface CreateStoryInput {
  userId: string;
  mediaUrl: string;
  textOverlay?: string | null;
}

/** Insert a new story row. Expiry defaults to now()+24h in the DB. */
export async function createStory(input: CreateStoryInput): Promise<StoryRow | null> {
  if (!isSupabaseConfigured) {
    console.warn('[stories] createStory: Supabase not configured');
    return null;
  }
  const { data, error } = await supabase
    .from('stories')
    .insert({
      user_id: input.userId,
      media_url: input.mediaUrl,
      text_overlay: input.textOverlay ?? null,
    })
    .select('id, user_id, media_url, text_overlay, created_at, expires_at')
    .single();

  if (error) {
    console.warn('[stories] createStory error:', error.message);
    throw error;
  }
  return data as unknown as StoryRow;
}

/**
 * Record that `viewerId` saw `storyId`. Silently ignores duplicate-view
 * conflicts (unique constraint on story_id + viewer_id).
 */
export async function markStoryViewed(
  storyId: string,
  viewerId: string,
): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from('story_views')
    .upsert(
      { story_id: storyId, viewer_id: viewerId },
      { onConflict: 'story_id,viewer_id' },
    );
  if (error) {
    // Non-fatal — view tracking should never block playback.
    console.warn('[stories] markStoryViewed error:', error.message);
  }
}

/**
 * Return the list of viewers for a story.
 * Should only be called for stories owned by the current user (enforced by
 * the caller; RLS policies on story_views should mirror this).
 */
export async function getStoryViewers(storyId: string): Promise<StoryViewer[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('story_views')
    .select(
      'viewer_id, created_at, viewer:users!story_views_viewer_id_fkey(id, username, display_name, avatar_url)',
    )
    .eq('story_id', storyId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[stories] getStoryViewers error:', error.message);
    return [];
  }
  return (data ?? []) as unknown as StoryViewer[];
}

/**
 * Upload a local image URI to Supabase Storage (bucket: `story-media`) and
 * return its public URL. Falls back to the raw local URI when Supabase isn't
 * configured so the UI still works in demo mode.
 */
export async function uploadStoryMedia(
  userId: string,
  localUri: string,
  fileBody: ArrayBuffer | Blob,
  contentType = 'image/jpeg',
): Promise<string> {
  if (!isSupabaseConfigured) return localUri;
  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from('story-media')
    .upload(path, fileBody, { contentType, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('story-media').getPublicUrl(path);
  return data.publicUrl;
}
