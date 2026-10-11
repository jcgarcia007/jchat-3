/**
 * JChat 3.0 — Truth or Dare service.
 *
 * Thin wrappers over the server API (migration 222): every state change is an RPC that answers jsonb with
 * status 'ok' | 'denied' | 'cooldown' | 'pending'. The client never writes the game tables or the tod_* chat messages.
 * Also holds: the card cache (tod_cards, per locale, synced by updated_at and kept in AsyncStorage), the per-venue
 * cooldown store (the server is the truth; this only paints the countdown) and the reason → i18n key map.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';

// ── Types ───────────────────────────────────────────────────────────────────

export const TOD_CATEGORIES = ['classic', 'party', 'laughs', 'confessions', 'talent'] as const;
export type TodCategory = (typeof TOD_CATEGORIES)[number];
export type TodKind = 'truth' | 'dare';
export type TodChoice = 'truth' | 'dare' | 'random';
export type TodRoundStatus = 'active' | 'closed' | 'expired' | 'hidden';
export type TodLocale = 'es' | 'en';

export const TOD_TERMS_VERSION = '2026-10';
export const TOD_COOLDOWN_SECONDS = 300;

export interface TodDenied { status: 'denied'; reason: string }
export interface TodCooldown { status: 'cooldown'; seconds: number }
export interface TodDrawOk {
  status: 'ok' | 'pending';
  draw_id: string;
  round_id: string;
  kind: TodKind;
  is_random: boolean;
  concept_id: string;
}
export type TodDrawResult = TodDrawOk | TodCooldown | TodDenied;
export type TodCreateResult =
  | { status: 'ok'; round_id: string; message_id: string; expires_at: string }
  | TodCooldown
  | TodDenied;
export type TodDecideResult = { status: 'ok'; published: boolean; message_id?: string } | TodDenied;
export type TodApplaudResult = { status: 'ok'; applause: number; new: boolean } | TodDenied;
export type TodCloseResult = { status: 'ok' } | TodDenied;

/** Metadata of a 'tod_round' chat message. */
export interface TodRoundMeta {
  round_id: string;
  category: TodCategory;
  official: boolean;
  expires_at: string;
  status: TodRoundStatus;
  plays: number;
}

/** Metadata of a 'tod_draw' chat message. */
export interface TodDrawMeta {
  round_id: string;
  draw_id: string;
  category: TodCategory;
  kind: TodKind;
  is_random: boolean;
  concept_id: string;
  applause: number;
}

export interface TodActiveRound {
  id: string;
  creator_id: string;
  category: TodCategory;
  is_official: boolean;
  message_id: string | null;
  plays_count: number;
  expires_at: string;
}

export interface TodCardInfo { body: string; category: string; kind: string }

const isCategory = (v: unknown): v is TodCategory => typeof v === 'string' && (TOD_CATEGORIES as readonly string[]).includes(v);
const isKind = (v: unknown): v is TodKind => v === 'truth' || v === 'dare';

export function isTodMessageType(type: string | null | undefined): type is 'tod_round' | 'tod_draw' {
  return type === 'tod_round' || type === 'tod_draw';
}

export function parseRoundMeta(meta: Record<string, unknown> | null | undefined): TodRoundMeta | null {
  if (!meta || typeof meta.round_id !== 'string' || !isCategory(meta.category)) return null;
  const status = meta.status;
  return {
    round_id: meta.round_id,
    category: meta.category,
    official: meta.official === true,
    expires_at: typeof meta.expires_at === 'string' ? meta.expires_at : new Date(0).toISOString(),
    status: status === 'closed' || status === 'expired' || status === 'hidden' ? status : 'active',
    plays: typeof meta.plays === 'number' ? meta.plays : 0,
  };
}

export function parseDrawMeta(meta: Record<string, unknown> | null | undefined): TodDrawMeta | null {
  if (!meta || typeof meta.draw_id !== 'string' || typeof meta.concept_id !== 'string' || !isKind(meta.kind)) return null;
  return {
    round_id: typeof meta.round_id === 'string' ? meta.round_id : '',
    draw_id: meta.draw_id,
    category: isCategory(meta.category) ? meta.category : 'classic',
    kind: meta.kind,
    is_random: meta.is_random === true,
    concept_id: meta.concept_id,
    applause: typeof meta.applause === 'number' ? meta.applause : 0,
  };
}

/** The user's UI language as a card locale. */
export function todLocale(language: string | null | undefined): TodLocale {
  return (language ?? '').toLowerCase().startsWith('es') ? 'es' : 'en';
}

/** 298 → "4:58". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── Server reasons → i18n ───────────────────────────────────────────────────

const KNOWN_REASONS = new Set([
  'room_not_found', 'age_not_confirmed', 'games_disabled', 'terms_required', 'game_disabled', 'category_disabled',
  'unavailable', 'not_staff', 'not_in_room', 'round_not_found', 'round_ended', 'own_round', 'no_cards', 'not_found',
  'already_decided', 'draw_expired', 'not_in_venue', 'own_result', 'forbidden', 'network',
]);

/** Key (inside the 'tod' namespace) of the text for a server `reason`; unknown reasons fall back to the generic text. */
export function todReasonKey(reason: string | null | undefined): string {
  return reason && KNOWN_REASONS.has(reason) ? `reasons.${reason}` : 'reasons.default';
}

// ── Untyped access (tables and RPCs of migration 222 are not in the generated types) ──

interface UntypedDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}
const db = supabase as unknown as UntypedDb;

/** Calls an RPC and returns its jsonb; a transport failure is reported as { status: 'denied', reason: 'network' }. */
async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T | TodDenied> {
  try {
    const { data, error } = await db.rpc(fn, args);
    if (error || data == null || typeof data !== 'object') return { status: 'denied', reason: 'network' };
    return data as T;
  } catch {
    return { status: 'denied', reason: 'network' };
  }
}

// ── API ─────────────────────────────────────────────────────────────────────

export async function isTodEnabledForBusiness(businessId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { data, error } = await db.rpc('tod_enabled_for_business', { p_business_id: businessId });
    return !error && data === true;
  } catch {
    return false; // fail closed: no game UI when it cannot be confirmed
  }
}

/** Categories active at the venue: tod_settings.categories, or all five when the venue has no row. */
export async function fetchTodCategories(businessId: string): Promise<TodCategory[]> {
  if (!isSupabaseConfigured) return [...TOD_CATEGORIES];
  try {
    const { data, error } = await db.from('tod_settings').select('categories').eq('business_id', businessId).maybeSingle();
    if (error || !data) return [...TOD_CATEGORIES];
    const list = (data as { categories?: unknown }).categories;
    return Array.isArray(list) ? TOD_CATEGORIES.filter((c) => list.includes(c)) : [...TOD_CATEGORIES];
  } catch {
    return [...TOD_CATEGORIES];
  }
}

let termsAccepted = false;

/** Whether the user already accepted the game rules (tod_terms has their row). */
export async function hasAcceptedTodTerms(): Promise<boolean> {
  if (termsAccepted) return true;
  if (!isSupabaseConfigured) return false;
  try {
    const { data, error } = await db.from('tod_terms').select('user_id').limit(1);
    if (error) return false;
    termsAccepted = Array.isArray(data) && data.length > 0;
    return termsAccepted;
  } catch {
    return false;
  }
}

export async function acceptTodTerms(): Promise<boolean> {
  try {
    const { error } = await db.rpc('tod_accept_terms', { p_version: TOD_TERMS_VERSION });
    if (error) return false;
    termsAccepted = true;
    return true;
  } catch {
    return false;
  }
}

export function resetTodTermsCache(): void {
  termsAccepted = false;
}

export const createTodRound = (roomId: string, category: TodCategory) =>
  callRpc<TodCreateResult>('tod_create_round', { p_room_id: roomId, p_category: category, p_official: false });
export const drawTod = (roundId: string, choice: TodChoice) =>
  callRpc<TodDrawResult>('tod_draw', { p_round_id: roundId, p_choice: choice });
export const decideTod = (drawId: string, publish: boolean) =>
  callRpc<TodDecideResult>('tod_decide', { p_draw_id: drawId, p_publish: publish });
export const applaudTod = (drawId: string) => callRpc<TodApplaudResult>('tod_applaud', { p_draw_id: drawId });
export const closeTodRound = (roundId: string) => callRpc<TodCloseResult>('tod_close_round', { p_round_id: roundId });

/** Rounds still running in a room (tod_rounds is readable through can_access_room). */
export async function fetchActiveTodRounds(roomId: string): Promise<TodActiveRound[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await db
      .from('tod_rounds')
      .select('id, creator_id, category, is_official, message_id, plays_count, expires_at')
      .eq('room_id', roomId)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    if (error || !Array.isArray(data)) return [];
    return (data as TodActiveRound[]).filter((r) => isCategory(r.category));
  } catch {
    return [];
  }
}

// ── Card cache ──────────────────────────────────────────────────────────────

const CARDS_KEY = (locale: TodLocale) => `tod.cards.v1.${locale}`;
const TUTORIAL_KEY = 'tod.tutorial.seen.v1';
const PAGE = 1000;

const cardMemory: Record<TodLocale, Map<string, TodCardInfo>> = { es: new Map(), en: new Map() };
const cardStorageLoaded: Record<TodLocale, boolean> = { es: false, en: false };
const cardSyncedAt: Record<TodLocale, string | null> = { es: null, en: null };
const cardListeners = new Set<() => void>();
const pendingFetches = new Map<string, Promise<void>>();

const emitCards = () => cardListeners.forEach((l) => l());

async function loadCardsFromStorage(locale: TodLocale): Promise<void> {
  if (cardStorageLoaded[locale]) return;
  cardStorageLoaded[locale] = true;
  try {
    const raw = await AsyncStorage.getItem(CARDS_KEY(locale));
    if (!raw) return;
    const parsed = JSON.parse(raw) as { syncedAt?: string | null; cards?: Record<string, TodCardInfo> };
    cardSyncedAt[locale] = parsed.syncedAt ?? null;
    for (const [id, info] of Object.entries(parsed.cards ?? {})) cardMemory[locale].set(id, info);
    emitCards();
  } catch {
    // a corrupt cache is simply rebuilt by the next sync
  }
}

async function persistCards(locale: TodLocale): Promise<void> {
  try {
    await AsyncStorage.setItem(
      CARDS_KEY(locale),
      JSON.stringify({ syncedAt: cardSyncedAt[locale], cards: Object.fromEntries(cardMemory[locale]) }),
    );
  } catch {
    // best effort
  }
}

/** Loads the stored cache, then pulls only what changed (updated_at > last sync) for the user's locale. */
export async function syncTodCards(locale: TodLocale): Promise<void> {
  await loadCardsFromStorage(locale);
  if (!isSupabaseConfigured) return;
  try {
    let from = 0;
    let newest = cardSyncedAt[locale];
    for (;;) {
      let query = db
        .from('tod_cards')
        .select('concept_id, category, kind, body, updated_at')
        .eq('locale', locale)
        .order('updated_at', { ascending: true })
        .order('concept_id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (cardSyncedAt[locale]) query = query.gt('updated_at', cardSyncedAt[locale]);
      const { data, error } = await query;
      if (error || !Array.isArray(data)) return;
      for (const row of data as { concept_id: string; category: string; kind: string; body: string; updated_at: string }[]) {
        cardMemory[locale].set(row.concept_id, { body: row.body, category: row.category, kind: row.kind });
        if (!newest || row.updated_at > newest) newest = row.updated_at;
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
    if (newest !== cardSyncedAt[locale]) {
      cardSyncedAt[locale] = newest;
      emitCards();
      await persistCards(locale);
    }
  } catch {
    // offline: the cached cards keep working
  }
}

export function getTodCard(conceptId: string, locale: TodLocale): TodCardInfo | undefined {
  return cardMemory[locale].get(conceptId);
}

/** Cache first; otherwise one request by concept_id + locale (a card the sync has not brought yet, or an older one). */
export function ensureTodCard(conceptId: string, locale: TodLocale): Promise<void> {
  if (cardMemory[locale].has(conceptId) || !isSupabaseConfigured) return Promise.resolve();
  const key = `${locale}:${conceptId}`;
  const inFlight = pendingFetches.get(key);
  if (inFlight) return inFlight;
  const job = (async () => {
    try {
      await loadCardsFromStorage(locale);
      if (cardMemory[locale].has(conceptId)) return;
      const { data, error } = await db
        .from('tod_cards')
        .select('concept_id, category, kind, body')
        .eq('concept_id', conceptId)
        .eq('locale', locale)
        .maybeSingle();
      if (!error && data) {
        const row = data as { category: string; kind: string; body: string };
        cardMemory[locale].set(conceptId, { body: row.body, category: row.category, kind: row.kind });
        emitCards();
        void persistCards(locale);
      }
    } catch {
      // stays unresolved; the UI shows the "unavailable" text
    } finally {
      pendingFetches.delete(key);
    }
  })();
  pendingFetches.set(key, job);
  return job;
}

/** The text of a card in the viewer's language: 'loading' until the cache or one request answers, 'missing' if it never does. */
export function useTodCardText(conceptId: string | null, locale: TodLocale): { status: 'loading' | 'ready' | 'missing'; text: string } {
  const [, force] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const listener = () => force((n) => n + 1);
    cardListeners.add(listener);
    return () => { cardListeners.delete(listener); };
  }, []);
  useEffect(() => {
    if (!conceptId) return undefined;
    let alive = true;
    setFailed(false);
    void ensureTodCard(conceptId, locale).then(() => {
      if (alive && !getTodCard(conceptId, locale)) setFailed(true);
    });
    return () => { alive = false; };
  }, [conceptId, locale]);
  const card = conceptId ? getTodCard(conceptId, locale) : undefined;
  if (card) return { status: 'ready', text: card.body };
  return { status: failed ? 'missing' : 'loading', text: '' };
}

// ── Tutorial flag ───────────────────────────────────────────────────────────

export async function hasSeenTodTutorial(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(TUTORIAL_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markTodTutorialSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    // best effort
  }
}

// ── Cooldown (global per venue; the server is the truth) ────────────────────

const cooldownUntil = new Map<string, number>();
const cooldownListeners = new Set<() => void>();
const emitCooldown = () => cooldownListeners.forEach((l) => l());

/** Starts (or corrects) the countdown for a venue: `seconds` from now. */
export function setTodCooldown(businessId: string, seconds: number): void {
  cooldownUntil.set(businessId, Date.now() + Math.max(0, seconds) * 1000);
  emitCooldown();
}

export function getTodCooldownRemaining(businessId: string | null | undefined): number {
  if (!businessId) return 0;
  const until = cooldownUntil.get(businessId);
  return until ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0;
}

/** Seconds left of the venue-wide cooldown, ticking once a second while it runs. */
export function useTodCooldown(businessId: string | null | undefined): number {
  const [remaining, setRemaining] = useState(() => getTodCooldownRemaining(businessId));
  useEffect(() => {
    const sync = () => setRemaining(getTodCooldownRemaining(businessId));
    sync();
    cooldownListeners.add(sync);
    const timer = setInterval(sync, 1000);
    return () => {
      cooldownListeners.delete(sync);
      clearInterval(timer);
    };
  }, [businessId]);
  return remaining;
}

/** Re-renders every second while `active` (countdowns). Returns the current time in ms. */
export function useTodNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}
