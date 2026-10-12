/**
 * JChat 3.0 — "the profile is open as a side panel" (web, wide screens). Tiny external store: the profile
 * screen sets it while it shows the right-hand panel, WebFrame reads it to shift the phone-width column to
 * the left so the chat stays visible and usable next to the panel.
 */

import { useSyncExternalStore } from 'react';

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
