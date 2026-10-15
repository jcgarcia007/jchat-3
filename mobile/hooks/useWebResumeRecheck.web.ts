/**
 * JChat 3.0 — web: re-check the venue presence when the network comes back (`online`) or the page is restored from the
 * back-forward cache (`pageshow`). Coming back to the tab (`visibilitychange` → visible) is already delivered as an AppState
 * 'active' change by react-native-web (its AppState is built on that event), so the gate handles it; this adds the rest.
 * The decision (visible, online, throttle) is the pure shouldResumeRecheck; the check itself is the callback's.
 */
import { useEffect, useRef } from 'react';

import { shouldResumeRecheck, type ResumeTrigger } from '../utils/resumeRecheck';
import type { WebResumeRecheckArgs } from './useWebResumeRecheck';

export function useWebResumeRecheck({ onResume, enabled, ageMs, minGapMs }: WebResumeRecheckArgs): void {
  const callbackRef = useRef(onResume);
  callbackRef.current = onResume;
  const ageRef = useRef(ageMs);
  ageRef.current = ageMs;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    const consider = (trigger: ResumeTrigger, persisted?: boolean): void => {
      const run = shouldResumeRecheck({
        trigger,
        visible: document.visibilityState === 'visible',
        online: navigator.onLine !== false,
        sinceLastCheckMs: ageRef.current(),
        minGapMs,
        persisted,
      });
      if (run) callbackRef.current();
    };

    const onOnline = (): void => consider('online');
    const onPageShow = (event: PageTransitionEvent): void => consider('pageshow', event.persisted);

    window.addEventListener('online', onOnline);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [enabled, minGapMs]);
}
