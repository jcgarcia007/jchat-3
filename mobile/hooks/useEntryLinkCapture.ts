/**
 * JChat 3.0 — useEntryLinkCapture (iOS / Android): saves the venue-entry URL that opened the app.
 *
 * Mounted once in App.tsx, under the providers and outside the NavigationContainer. The cold-start URL
 * (Linking.getInitialURL) and the ones that arrive with the app open (Linking 'url' event) go through
 * parseEntryUrl; a valid entry is stored as the pending entry (survives the login) and EntryBridge consumes it
 * when the person is signed in. Anything else is ignored here: AuthContext.handleAuthUrl still owns
 * `://confirm`, and `jchat://room/:id` / `post/:id` stay with React Navigation's linking.
 *
 * Web does not use this hook: its entry is captured once at load by utils/captureWebEntry.web.ts.
 */

import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';

import { savePendingEntry } from '../services/venueEntry';
import { parseEntryUrl } from '../utils/entryUrl';

function capture(url: string | null): void {
  if (!url) return;
  const target = parseEntryUrl(url); // never allowVenueQuery in native
  if (target) void savePendingEntry(target);
}

export function useEntryLinkCapture(): void {
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    let cancelled = false;
    void Linking.getInitialURL().then((url) => {
      if (!cancelled) capture(url);
    });
    const subscription = Linking.addEventListener('url', ({ url }) => capture(url));
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);
}
