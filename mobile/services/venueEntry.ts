/**
 * JChat 3.0 — venue entry (QR → venue chat): resolver + the pending entry.
 *
 * resolveEntry() asks the server which venue / room an entry URL points to (RPC resolve_venue_entry, migration
 * 228: public data only, callable before login). It NEVER grants access: the chat still goes through the
 * geofence gate (check_geofence_and_join_room). A QR only says which venue to go to.
 *
 * The pending entry survives the login: the URL is saved the moment it arrives (before the person is signed
 * in), and EntryBridge consumes it once they are. One entry only (the last one wins), expiring after 2 h.
 * AsyncStorage is localStorage on web.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { EntryTarget } from '../utils/entryUrl';
import { isSupabaseConfigured, supabase } from './supabase';

export interface ResolvedEntry {
  businessId: string;
  businessName: string;
  businessSlug: string;
  logoUrl: string | null;
  roomId: string;
  /** Real table label (e.g. "T8") when the entry was a table QR with a valid code. */
  tableLabel: string | null;
  tableQrToken: string | null;
}

/**
 * Resolves an entry target. `null` = the QR is not valid (no match, wrong table code, venue off): the server
 * does not say which. A network / server failure THROWS, so callers can tell "invalid QR" from "no connection".
 */
export async function resolveEntry(target: EntryTarget): Promise<ResolvedEntry | null> {
  if (!isSupabaseConfigured) throw new Error('entry_not_configured');

  const args =
    target.kind === 'venue'
      ? { p_venue: target.venue }
      : target.kind === 'table'
        ? { p_venue: target.venue, p_label: target.label, p_code: target.code }
        : target.venue
          ? { p_token: target.token, p_venue: target.venue }
          : { p_token: target.token };

  const { data, error } = await supabase.rpc('resolve_venue_entry', args);
  if (error) throw error;

  const row = data?.[0];
  if (!row) return null;
  return {
    businessId: row.business_id,
    businessName: row.business_name,
    businessSlug: row.business_slug,
    logoUrl: row.logo_url,
    roomId: row.room_id,
    tableLabel: row.table_label,
    tableQrToken: row.table_qr_token,
  };
}

// ── Pending entry ────────────────────────────────────────────────────────────

const PENDING_KEY = 'jchat.pendingEntry.v1';
/** A pending entry older than this is dropped (a QR scanned and forgotten must not hijack a later session). */
export const PENDING_ENTRY_TTL_MS = 2 * 60 * 60 * 1000;

interface StoredEntry {
  target: EntryTarget;
  savedAt: number;
}

type PendingListener = () => void;
const listeners = new Set<PendingListener>();

/** Fires after a new entry was saved (a link that arrives while the app is open). */
export function subscribePendingEntry(listener: PendingListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isEntryTarget(value: unknown): value is EntryTarget {
  if (!value || typeof value !== 'object') return false;
  const t = value as Record<string, unknown>;
  if (t.kind === 'venue') return typeof t.venue === 'string';
  if (t.kind === 'table') return typeof t.venue === 'string' && typeof t.label === 'string' && typeof t.code === 'string';
  if (t.kind === 'token') return typeof t.token === 'string' && (t.venue === undefined || typeof t.venue === 'string');
  return false;
}

export async function savePendingEntry(target: EntryTarget, now: number = Date.now()): Promise<void> {
  const stored: StoredEntry = { target, savedAt: now };
  try {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(stored));
  } catch {
    return; // storage unavailable (private mode): the entry simply is not remembered
  }
  listeners.forEach((listener) => listener());
}

/** The pending entry, or null when there is none / it expired (an expired one is removed here). */
export async function loadPendingEntry(now: number = Date.now()): Promise<EntryTarget | null> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let stored: Partial<StoredEntry> | null = null;
  try {
    stored = JSON.parse(raw) as Partial<StoredEntry>;
  } catch {
    stored = null;
  }
  const valid =
    stored !== null &&
    typeof stored.savedAt === 'number' &&
    now - stored.savedAt >= 0 &&
    now - stored.savedAt <= PENDING_ENTRY_TTL_MS &&
    isEntryTarget(stored.target);
  if (!valid) {
    await clearPendingEntry();
    return null;
  }
  return stored!.target as EntryTarget;
}

export async function clearPendingEntry(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_KEY);
  } catch {
    // nothing to clear
  }
}
