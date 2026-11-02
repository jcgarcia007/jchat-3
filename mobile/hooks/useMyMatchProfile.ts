/**
 * JChat 3.0 — my Match profile, as the screens that show its state need it: my photos (with their moderation status) and my gender / seeking, read again
 * every time the screen regains focus (so a photo approved meanwhile shows up without reopening the app) and summarized by utils/matchProfileState.
 * match_photos is not in the realtime publication, so a photo in review is polled (every 5 s, at most 2 min) while the screen is focused.
 * Used by Settings ("Mi perfil de Match: Completo / En revisión / Incompleto"), the profile screen and the Match deck.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { useAuth } from '../context/AuthContext';
import { fetchMyMatchPhotos, fetchMyMatchPrefs, type MyMatchPrefs } from '../services/matchProfile';
import type { MatchPhoto } from '../services/matchTypes';
import { PHOTO_POLL_MS, shouldPollPhotos, summarizeMatchProfile, type MatchProfileSummary } from '../utils/matchProfileState';

export interface MyMatchProfile {
  loading: boolean;
  /** true when the last read failed (the previous values, if any, stay on screen). */
  failed: boolean;
  prefs: MyMatchPrefs;
  photos: MatchPhoto[];
  summary: MatchProfileSummary;
  reload: () => Promise<void>;
}

const NO_PREFS: MyMatchPrefs = { gender: null, seeking: null, available: true };

export function useMyMatchProfile(): MyMatchProfile {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [prefs, setPrefs] = useState<MyMatchPrefs>(NO_PREFS);
  const [photos, setPhotos] = useState<MatchPhoto[]>([]);
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const request = ++requestRef.current;
    try {
      const [nextPrefs, nextPhotos] = await Promise.all([fetchMyMatchPrefs(userId), fetchMyMatchPhotos(userId)]);
      if (request !== requestRef.current) return; // a newer read is on its way
      setPrefs(nextPrefs);
      setPhotos(nextPhotos);
      setFailed(false);
    } catch {
      if (request === requestRef.current) setFailed(true);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [userId]);

  // Pending photos: how many there are, and since when the screen has been waiting for a verdict.
  const pendingRef = useRef(0);
  const waitingSinceRef = useRef(0);
  useEffect(() => {
    const pending = photos.filter((p) => p.status === 'pending').length;
    if (pending > pendingRef.current) waitingSinceRef.current = Date.now();
    pendingRef.current = pending;
  }, [photos]);

  useFocusEffect(
    useCallback(() => {
      waitingSinceRef.current = Date.now();
      void reload();
      const timer = setInterval(() => {
        if (shouldPollPhotos(pendingRef.current, Date.now() - waitingSinceRef.current)) void reload();
      }, PHOTO_POLL_MS);
      return () => clearInterval(timer);
    }, [reload]),
  );

  const summary = useMemo(
    () => summarizeMatchProfile({ gender: prefs.gender, seeking: prefs.seeking, photos, prefsAvailable: prefs.available }),
    [prefs, photos],
  );

  return { loading, failed, prefs, photos, summary, reload };
}
