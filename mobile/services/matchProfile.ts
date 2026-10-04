/**
 * JChat 3.0 — Match profile service (Fase D2)
 *
 * My Match photos (private bucket `match-photos`, moderated server-side), my interests and
 * signed URLs. Photos: resized to WebP ~800 px on device, uploaded to `{uid}/{uuid}.webp`, then a
 * `match_photos` row is inserted as 'pending' (the server moderates it). The client can never set
 * status — only sort/delete (guard trigger, migration 193).
 */

import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { supabase, isSupabaseConfigured } from './supabase';
import type { InterestRow, MatchPhoto, MatchPhotoStatus } from './matchTypes';

export const MATCH_PHOTOS_BUCKET = 'match-photos';
export const MAX_MATCH_PHOTOS = 6;
const TARGET_WIDTH = 800;
const SIGNED_URL_TTL_S = 60 * 60;

// ── Signed URLs ─────────────────────────────────────────────────────────────

/** Signed URLs for storage paths of `match-photos` (path → url). Missing/failed paths are omitted. */
export async function signedPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!isSupabaseConfigured || unique.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(MATCH_PHOTOS_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_S);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  for (const row of data) {
    if (row.path && row.signedUrl) map[row.path] = row.signedUrl;
  }
  return map;
}

// ── My photos ───────────────────────────────────────────────────────────────

export async function fetchMyMatchPhotos(userId: string): Promise<MatchPhoto[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('match_photos')
    .select('id, user_id, path, sort, status, rejection_reason, needs_review, created_at')
    .eq('user_id', userId)
    .order('sort', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as Omit<MatchPhoto, 'url'>[];
  const urls = await signedPhotoUrls(rows.map((r) => r.path));
  return rows.map((r) => ({
    ...r,
    status: (['pending', 'approved', 'rejected'] as MatchPhotoStatus[]).includes(r.status) ? r.status : 'pending',
    url: urls[r.path] ?? null,
  }));
}

function generateId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback (Hermes without crypto.randomUUID): only used for a unique file name inside {uid}/.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function imageWidth(uri: string): Promise<number | null> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width) => resolve(width),
      () => resolve(null),
    );
  });
}

/** Resize to ≤ 800 px wide (never upscale) and re-encode as WebP. Returns the local file URI. */
async function toWebp(uri: string): Promise<string> {
  const width = await imageWidth(uri);
  const context = ImageManipulator.manipulate(uri);
  if (width == null || width > TARGET_WIDTH) context.resize({ width: TARGET_WIDTH });
  const ref = await context.renderAsync();
  const result = await ref.saveAsync({ format: SaveFormat.WEBP, compress: 0.8 });
  return result.uri;
}

/** Processes a local image and uploads it as a new pending Match photo. */
export async function addMatchPhoto(userId: string, localUri: string, sort: number): Promise<void> {
  if (!isSupabaseConfigured) return;
  const webpUri = await toWebp(localUri);
  const base64 = await FileSystem.readAsStringAsync(webpUri, { encoding: FileSystem.EncodingType.Base64 });
  const path = `${userId}/${generateId()}.webp`;

  const { error: uploadError } = await supabase.storage
    .from(MATCH_PHOTOS_BUCKET)
    .upload(path, decode(base64), { contentType: 'image/webp', upsert: false });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase
    .from('match_photos')
    .insert({ user_id: userId, path, sort, status: 'pending' });
  if (insertError) {
    // Don't leave an orphan object behind.
    await supabase.storage.from(MATCH_PHOTOS_BUCKET).remove([path]).catch(() => undefined);
    throw insertError;
  }
}

/** Copies the profile avatar (public URL) as a new Match photo. */
export async function addAvatarAsMatchPhoto(userId: string, avatarUrl: string, sort: number): Promise<void> {
  const target = `${FileSystem.cacheDirectory}match-avatar-${Date.now()}.jpg`;
  const download = await FileSystem.downloadAsync(avatarUrl, target);
  try {
    await addMatchPhoto(userId, download.uri, sort);
  } finally {
    await FileSystem.deleteAsync(download.uri, { idempotent: true }).catch(() => undefined);
  }
}

/** Deletes the row and its Storage object. */
export async function deleteMatchPhoto(photo: Pick<MatchPhoto, 'id' | 'path'>): Promise<void> {
  const { error } = await supabase.from('match_photos').delete().eq('id', photo.id);
  if (error) throw error;
  await supabase.storage.from(MATCH_PHOTOS_BUCKET).remove([photo.path]).catch(() => undefined);
}

/** Persists a new order: photo ids in display order → sort 0..n-1. */
export async function reorderMatchPhotos(idsInOrder: string[]): Promise<void> {
  const results = await Promise.all(
    idsInOrder.map((id, index) => supabase.from('match_photos').update({ sort: index }).eq('id', id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

// ── Interests ───────────────────────────────────────────────────────────────

let interestsCache: InterestRow[] | null = null;

/** Catalog of interests (cached for the session). */
export async function fetchInterests(): Promise<InterestRow[]> {
  if (interestsCache) return interestsCache;
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('interests')
    .select('key, name_es, name_en, sort')
    .order('sort', { ascending: true });
  if (error) throw error;
  interestsCache = (data ?? []) as InterestRow[];
  return interestsCache;
}

export function interestName(row: InterestRow | undefined, language: 'en' | 'es'): string {
  if (!row) return '';
  return language === 'es' ? row.name_es : row.name_en;
}

export async function fetchMyInterestKeys(userId: string): Promise<string[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from('user_interests').select('interest_key').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((r: { interest_key: string }) => r.interest_key);
}

/** Replaces my interests with `keys` (direct own-row writes). */
export async function saveMyInterests(userId: string, keys: string[]): Promise<void> {
  const current = await fetchMyInterestKeys(userId);
  const toRemove = current.filter((k) => !keys.includes(k));
  const toAdd = keys.filter((k) => !current.includes(k));
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('user_interests')
      .delete()
      .eq('user_id', userId)
      .in('interest_key', toRemove);
    if (error) throw error;
  }
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('user_interests')
      .insert(toAdd.map((interest_key) => ({ user_id: userId, interest_key })));
    if (error) throw error;
  }
}
