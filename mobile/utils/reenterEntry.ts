/**
 * JChat 3.0 — which venue entry the web offers to (re)enter (pure: no React, no Supabase, runs in Node tests).
 *
 * On the web the entry QR / link is consumed once: EntryBridge clears the pending entry before opening the chat, and the
 * entry gate's "Cancelar" goes back to WebNoVenueScreen, where there was nothing left to tap (only a refresh helped).
 * So the LAST entry of this visit is remembered — in this tab's memory / sessionStorage only, never in a URL or a log —
 * and WebNoVenueScreen offers "Entrar al chat de {local}".
 *
 * Which entry is offered: the remembered one > the one derived from the address (a `<local>.jchat.cloud` host, with the
 * same parseEntryUrl the QR capture uses) > nothing. The entry may carry a table code; the code only ever travels inside
 * the EntryTarget handed back to savePendingEntry — no text, label or log is built from it (describeOffer).
 */

import { parseEntryUrl, type EntryTarget } from './entryUrl';

export function isEntryTarget(value: unknown): value is EntryTarget {
  if (!value || typeof value !== 'object') return false;
  const t = value as Record<string, unknown>;
  if (t.kind === 'venue') return typeof t.venue === 'string';
  if (t.kind === 'table') return typeof t.venue === 'string' && typeof t.label === 'string' && typeof t.code === 'string';
  if (t.kind === 'token' || t.kind === 'tabletoken') return typeof t.token === 'string' && (t.venue === undefined || typeof t.venue === 'string');
  return false;
}

/** The entry to offer, or null (then the screen stays exactly as it was). `href` is window.location.href on the web. */
export function chooseEntryToOffer(input: { remembered: EntryTarget | null; href: string | null | undefined }): EntryTarget | null {
  if (input.remembered) return input.remembered;
  if (!input.href) return null;
  return parseEntryUrl(input.href); // no allowVenueQuery: only a real *.jchat.cloud host counts
}

/** What the UI may show about an offer: names only. Never the table label, code or token. */
export function describeOffer(_target: EntryTarget, names: { resolved?: string | null; left?: string | null }): { businessName: string | null } {
  const name = (names.left ?? '').trim() || (names.resolved ?? '').trim();
  return { businessName: name || null };
}

// ── Memory of the last entry (this tab) ──────────────────────────────────────

export interface TabStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'jchat.lastEntry.v1';
let inMemory: EntryTarget | null = null;

function defaultStore(): TabStore | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null; // per tab; gone when the tab closes
  } catch {
    return null; // storage blocked
  }
}

export function rememberEntry(target: EntryTarget, store: TabStore | null = defaultStore()): void {
  inMemory = target;
  try {
    store?.setItem(KEY, JSON.stringify(target));
  } catch {
    /* memory only */
  }
}

export function recallEntry(store: TabStore | null = defaultStore()): EntryTarget | null {
  if (inMemory) return inMemory;
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isEntryTarget(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Test hook: forgets the in-memory copy. */
export function resetRememberedEntryForTests(): void {
  inMemory = null;
}
