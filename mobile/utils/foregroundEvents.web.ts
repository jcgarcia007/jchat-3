/**
 * JChat 3.0 — "the page is usable again" events (web): the tab becomes visible again (visibilitychange) or the
 * browser regains the network (`online`). Both mean the Realtime socket may have died meanwhile (a sleeping
 * laptop, a phone with the tab in the background, a Wi-Fi change), so the chat resubscribes and catches up.
 */

export type ForegroundReason = 'foreground' | 'online';

export function subscribeForeground(listener: (reason: ForegroundReason) => void): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => undefined;
  const onVisibility = () => {
    if (document.visibilityState === 'visible') listener('foreground');
  };
  const onOnline = () => listener('online');
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', onOnline);
  };
}
