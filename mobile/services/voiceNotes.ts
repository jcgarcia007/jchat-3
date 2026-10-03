/**
 * JChat 3.0 — Voice notes (rooms + DMs).
 *
 * Recording options, upload to the PRIVATE buckets, signed-URL playback and the "one audio at a
 * time" playback store. Storage layout (migration 187):
 *   rooms: bucket voice-notes, path room/{room_id}/{uid}/{file}.m4a  (messages.media_url = the PATH,
 *          messages.metadata.duration_s)
 *   DMs:   bucket dm-media,   path {conversation_id}/{uid}/{file}.m4a (dm_messages.voice_url = the PATH,
 *          dm_messages.voice_duration_s)
 * A file:// uri is never stored in the database.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { AudioQuality, IOSOutputFormat, type RecordingOptions } from 'expo-audio';
import { supabase, isSupabaseConfigured } from './supabase';
import { AppError } from '../utils/errors';

export const VOICE_MAX_SECONDS = 60;
export const VOICE_MIN_SECONDS = 1;

/** m4a / AAC, 64 kbps, mono: plenty for speech (~0.5 MB per minute). */
export const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
};

export type VoiceBucket = 'voice-notes' | 'dm-media';
export interface VoiceSource {
  bucket: VoiceBucket;
  path: string;
}

/** Clamp to the 1–60 s range the database accepts. */
export function clampVoiceSeconds(seconds: number): number {
  return Math.min(VOICE_MAX_SECONDS, Math.max(VOICE_MIN_SECONDS, Math.round(seconds)));
}

function randomFileId(): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function upload(bucket: VoiceBucket, path: string, localUri: string): Promise<string> {
  if (!/\.(m4a|mp4)$/i.test(localUri)) throw new AppError('VOICE_UPLOAD_FAILED');
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, decode(base64), { contentType: 'audio/mp4', upsert: false });
  if (error) throw error;
  return path;
}

/** Upload a room voice note; returns the storage PATH to store in messages.media_url. */
export async function uploadRoomVoice(roomId: string, userId: string, localUri: string): Promise<string> {
  if (!isSupabaseConfigured) throw new AppError('NOT_CONFIGURED');
  return upload('voice-notes', `room/${roomId}/${userId}/${randomFileId()}.m4a`, localUri);
}

/** Upload a DM voice note; returns the storage PATH to store in dm_messages.voice_url. */
export async function uploadDmVoice(conversationId: string, userId: string, localUri: string): Promise<string> {
  if (!isSupabaseConfigured) throw new AppError('NOT_CONFIGURED');
  return upload('dm-media', `${conversationId}/${userId}/${randomFileId()}.m4a`, localUri);
}

/** Best-effort removal of the local recording once it was uploaded or discarded. */
export async function discardLocalRecording(uri: string | null | undefined): Promise<void> {
  if (!uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // ignore
  }
}

// ── Signed URLs (1 h), cached in memory ───────────────────────────────────────

const SIGNED_TTL_SECONDS = 3600;
const signedCache = new Map<string, { url: string; expiresAt: number }>();

export async function getVoiceSignedUrl(source: VoiceSource): Promise<string> {
  const key = `${source.bucket}:${source.path}`;
  const hit = signedCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.url;
  const { data, error } = await supabase.storage
    .from(source.bucket)
    .createSignedUrl(source.path, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) throw error ?? new AppError('VOICE_UNAVAILABLE');
  // Refresh a few minutes before the real expiry.
  signedCache.set(key, { url: data.signedUrl, expiresAt: Date.now() + (SIGNED_TTL_SECONDS - 300) * 1000 });
  return data.signedUrl;
}

// ── One audio at a time, app-wide ─────────────────────────────────────────────

let active: { id: string; stop: () => void } | null = null;

/** Claim playback: whoever was playing before is stopped. */
export function claimPlayback(id: string, stop: () => void): void {
  if (active && active.id !== id) active.stop();
  active = { id, stop };
}

export function releasePlayback(id: string): void {
  if (active?.id === id) active = null;
}
