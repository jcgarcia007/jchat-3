/**
 * JChat 3.0 — "invite to the app" rules of the web (pure: no I/O, no React, runs in Node tests).
 *
 * The web sells what the app DOES (alerts when someone replies, the map, keep going where you were), never a prize for
 * installing; it never covers the screen, never blocks and never repeats a notice that was closed. Everything sits behind
 * INVITE_TO_APP_ENABLED (constants/appLinks.ts), which stays false until the app is public in both stores.
 *
 *   banner  "Abrir en JChat": bottom bar; closing it hides it for 7 days (localStorage, jchat.inviteBanner.dismissedAt).
 *   moments three small notices, each shown ONCE per browser session (sessionStorage, jchat.invite.<moment>) and never
 *           while the banner is dismissed:  firstMessage · exitedArea (a line of the exit message) · finished.
 *   open    the deep link equivalent to the current URL (jchat://c/<token>, jchat://v/<venue>[/<mesa>-<código>]); if the tab
 *           is still visible 1.5 s later the app did not take over → the store. No equivalent (/t/<token>) → the store.
 */

import { parseEntryUrl } from './entryUrl';

export type InviteMoment = 'firstMessage' | 'exitedArea' | 'finished';

/** A closed banner stays closed this long. */
export const INVITE_DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const BANNER_DISMISSED_KEY = 'jchat.inviteBanner.dismissedAt';
/** A moment's notice closes itself after this long. */
export const TOAST_AUTO_CLOSE_MS = 8000;
/** After trying the deep link: still visible after this long → the app did not open. */
export const OPEN_FALLBACK_MS = 1500;

export const momentStorageKey = (moment: InviteMoment): string => `jchat.invite.${moment}`;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** true when the banner was closed less than 7 days ago. A missing, broken or future date counts as "not closed". */
export function bannerDismissedRecently(raw: string | null | undefined, now: number): boolean {
  if (!raw) return false;
  const at = Number(raw);
  if (!Number.isFinite(at)) return false;
  const age = now - at;
  return age >= 0 && age < INVITE_DISMISS_TTL_MS;
}

export interface InviteContext {
  /** INVITE_TO_APP_ENABLED. */
  enabled: boolean;
  /** Platform.OS. */
  platform: string;
  /** localStorage (or null when the browser refuses it). */
  local: KeyValueStore | null;
  /** sessionStorage (or null). */
  session: KeyValueStore | null;
  /** In-memory fallback so a notice is not repeated when storage is unavailable (private mode). */
  memory: Set<string>;
  now: number;
}

function safeGet(store: KeyValueStore | null, key: string): string | null {
  try {
    return store ? store.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSet(store: KeyValueStore | null, key: string, value: string): void {
  try {
    store?.setItem(key, value);
  } catch {
    /* private mode / quota: the in-memory set still stops repeats */
  }
}

/** The banner (and every moment) may appear: web, switch on, and not closed within the last 7 days. */
export function inviteAllowed(ctx: InviteContext): boolean {
  if (!ctx.enabled || ctx.platform !== 'web') return false;
  return !bannerDismissedRecently(safeGet(ctx.local, BANNER_DISMISSED_KEY), ctx.now);
}

/** Records "the banner was closed now". */
export function dismissBanner(ctx: Pick<InviteContext, 'local' | 'now'>): void {
  safeSet(ctx.local, BANNER_DISMISSED_KEY, String(ctx.now));
}

/**
 * Asks to show a moment: true at most ONCE per browser session per moment, and only when the invite is allowed.
 * Saying yes consumes it (it is marked as shown right here), so a closed or auto-closed notice never comes back.
 */
export function claimMoment(ctx: InviteContext, moment: InviteMoment): boolean {
  if (!inviteAllowed(ctx)) return false;
  const key = momentStorageKey(moment);
  if (ctx.memory.has(key) || safeGet(ctx.session, key) !== null) return false;
  ctx.memory.add(key);
  safeSet(ctx.session, key, String(ctx.now));
  return true;
}

/** The jchat:// URL equivalent to a web URL, or null when there is none (then "Abrir" goes straight to the store). */
export function deepLinkForUrl(href: string, allowVenueQuery = true): string | null {
  const target = parseEntryUrl(href, { allowVenueQuery });
  if (!target) return null;
  switch (target.kind) {
    case 'token':
      return `jchat://c/${target.token}`;
    case 'venue':
      return `jchat://v/${target.venue}`;
    case 'table':
      return `jchat://v/${target.venue}/${target.label}-${target.code}`;
    default:
      return null; // 'tabletoken' (/t/<token>) has no jchat:// form
  }
}

export interface OpenInAppEnv {
  setLocation(url: string): void;
  isVisible(): boolean;
  schedule(fn: () => void, ms: number): void;
}

/** "Abrir": deep link first, the store when the app does not take over. Returns what it did (for tests). */
export function openInApp(
  { href, storeUrl }: { href: string; storeUrl: string },
  env: OpenInAppEnv,
  fallbackMs: number = OPEN_FALLBACK_MS,
): 'store' | 'deeplink' {
  const link = deepLinkForUrl(href);
  if (!link) {
    env.setLocation(storeUrl);
    return 'store';
  }
  env.setLocation(link);
  env.schedule(() => {
    if (env.isVisible()) env.setLocation(storeUrl);
  }, fallbackMs);
  return 'deeplink';
}
