/**
 * JChat 3.0 — captureWebEntry (web): runs ONCE when App.tsx loads, before the NavigationContainer mounts.
 *
 * Reads window.location, and if it is a venue entry (https://<venue>.jchat.cloud/, /<mesa>-<código>, /c/<token>;
 * on localhost / *.vercel.app also ?venue=<venue>) saves it as the pending entry and cleans the address bar.
 * Without the cleanup React Navigation cannot map `/8-k3f9` to any screen and falls back to the initial one,
 * losing the entry. Only the entry path and the `venue` query parameter are removed: any other query / hash
 * (an OAuth return, for instance) is kept for whoever reads it.
 */

import { savePendingEntry } from '../services/venueEntry';
import { parseEntryUrl } from './entryUrl';
import { STRIPE_DIAG_STORAGE_KEY, stripeDiagRequested } from './walletDiagnostic';

export function captureWebEntry(): void {
  if (typeof window === 'undefined' || !window.location) return;
  // `?stripe_diag=1` turns on the test-mode wallet line of the gift page for this tab (the router rewrites the address later).
  try {
    if (stripeDiagRequested(window.location.search, null)) window.sessionStorage.setItem(STRIPE_DIAG_STORAGE_KEY, '1');
  } catch {
    // storage blocked: the flag simply is not remembered
  }
  const target = parseEntryUrl(window.location.href, { allowVenueQuery: true });
  if (!target) return;

  void savePendingEntry(target);

  const url = new URL(window.location.href);
  url.searchParams.delete('venue');
  const query = url.searchParams.toString();
  window.history.replaceState(null, '', `/${query ? `?${query}` : ''}${url.hash}`);
}
