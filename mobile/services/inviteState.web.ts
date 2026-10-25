/**
 * JChat 3.0 — invite-to-the-app state (web): storage, the notice channel and "Abrir".
 * The rules are pure and tested in utils/inviteMoments.ts; this file only supplies the browser (localStorage for the
 * 7-day banner dismissal, sessionStorage for "once per session", an in-memory set when storage is refused).
 * Everything is off while INVITE_TO_APP_ENABLED (constants/appLinks.ts) is false.
 */

import { Platform } from 'react-native';

import { INVITE_TO_APP_ENABLED } from '../constants/appLinks';
import {
  claimMoment,
  dismissBanner,
  inviteAllowed,
  openInApp,
  type InviteContext,
  type InviteMoment,
  type KeyValueStore,
} from '../utils/inviteMoments';
import { detectStorePlatform, storeLinkFor } from '../utils/storeLink';

export type InviteToastListener = (moment: InviteMoment | null) => void;

const memory = new Set<string>();
const listeners = new Set<InviteToastListener>();

function browserStore(kind: 'localStorage' | 'sessionStorage'): KeyValueStore | null {
  try {
    return typeof window !== 'undefined' ? window[kind] : null;
  } catch {
    return null; // storage blocked (private mode / policy)
  }
}

function context(): InviteContext {
  return {
    enabled: INVITE_TO_APP_ENABLED,
    platform: Platform.OS,
    local: browserStore('localStorage'),
    session: browserStore('sessionStorage'),
    memory,
    now: Date.now(),
  };
}

/** The banner may show: switch on and not closed within the last 7 days. */
export function isInviteBannerAllowed(): boolean {
  return inviteAllowed(context());
}

const bannerClosedListeners = new Set<() => void>();

/** Every mounted banner (the chat's and the no-venue screen's stay mounted together in the stack) hides when one is closed. */
export function subscribeBannerClosed(listener: () => void): () => void {
  bannerClosedListeners.add(listener);
  return () => {
    bannerClosedListeners.delete(listener);
  };
}

/** The X of the banner: it stays closed for 7 days. */
export function closeInviteBanner(): void {
  dismissBanner(context());
  bannerClosedListeners.forEach((listener) => listener());
}

/** true at most once per browser session per moment, never while the banner is dismissed (consumes it). */
export function claimInviteMoment(moment: InviteMoment): boolean {
  return claimMoment(context(), moment);
}

export function subscribeInviteToast(listener: InviteToastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitInviteToast(moment: InviteMoment): void {
  listeners.forEach((listener) => listener(moment));
}

/** "Abrir en JChat": the deep link of the current URL, the store of the system if the app does not take over. */
export function openAppFromWeb(): void {
  if (typeof window === 'undefined') return;
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const storeUrl = storeLinkFor(detectStorePlatform(nav?.userAgent ?? '', nav?.maxTouchPoints ?? 0));
  openInApp(
    { href: window.location.href, storeUrl },
    {
      setLocation: (url) => window.location.assign(url),
      isVisible: () => document.visibilityState === 'visible',
      schedule: (fn, ms) => {
        window.setTimeout(fn, ms);
      },
    },
  );
}
