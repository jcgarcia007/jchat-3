/**
 * JChat 3.0 — "the profile is open as a side panel" (web, wide screens). Tiny external store: the profile
 * screen sets it while it shows the right-hand panel, WebFrame reads it to shift the phone-width column to
 * the left so the chat stays visible and usable next to the panel.
 */

import { useSyncExternalStore } from 'react';

/** Browser widths from which the profile opens as a side panel instead of a sheet. */
export const PROFILE_PANEL_MIN_WIDTH = 900;
/** Width of the side panel (px). */
export const PROFILE_PANEL_WIDTH = 420;

let open = false;
const listeners = new Set<() => void>();

export function setProfilePanelOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useProfilePanelOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => false);
}

/** Pure: a panel (not a sheet) on this browser width? */
export function isProfilePanelWidth(width: number): boolean {
  return width >= PROFILE_PANEL_MIN_WIDTH;
}
