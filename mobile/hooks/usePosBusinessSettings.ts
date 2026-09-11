/**
 * usePosBusinessSettings — Tab POS F6
 *
 * Hook wrapper around posBusinessSettings() with module-level per-session cache.
 * The first call for a given businessId makes the RPC; subsequent calls in the
 * same JS process (same app session) return the cached value instantly.
 *
 * Cache is intentionally NOT a React ref or Context: the same app session almost
 * never switches business, so a Map<businessId, settings> keyed at module scope
 * is the simplest approach with zero coupling between screens.
 */

import { useState, useEffect } from 'react';
import { posBusinessSettings, type PosBusinessSettings } from '../services/pos';

// Module-level cache: survives re-renders and navigation, cleared on app restart.
const _cache = new Map<string, PosBusinessSettings>();

export interface UsePosBusinessSettingsResult {
  settings: PosBusinessSettings | null;
  loading:  boolean;
}

/**
 * Returns the POS business settings for `businessId`.
 * `loading` is true only on the first call for a given businessId (cache miss).
 * On error or null response, falls back to stripe mode (safe default).
 */
export function usePosBusinessSettings(
  businessId: string | null | undefined,
): UsePosBusinessSettingsResult {
  const [settings, setSettings] = useState<PosBusinessSettings | null>(
    businessId ? (_cache.get(businessId) ?? null) : null,
  );
  const [loading, setLoading] = useState<boolean>(
    !!(businessId && !_cache.has(businessId)),
  );

  useEffect(() => {
    if (!businessId) {
      setSettings(null);
      setLoading(false);
      return;
    }
    const cached = _cache.get(businessId);
    if (cached) {
      setSettings(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    posBusinessSettings(businessId).then((s) => {
      if (cancelled) return;
      if (s) _cache.set(businessId, s);
      setSettings(s);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [businessId]);

  return { settings, loading };
}
