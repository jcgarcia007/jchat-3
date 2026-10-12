/**
 * JChat 3.0 — usePendingEntryPreview: what the Welcome / Login screens show about a pending venue entry.
 *
 * Reads the pending entry (it does NOT consume it: EntryBridge does that after login) and resolves it with the
 * anonymous RPC (public data only: name, logo, table). Re-runs when a new entry is saved while the screen is open.
 *   none         — nothing pending (or the lookup failed offline: the normal flow just continues, no card)
 *   ready        — the venue (and table) behind the QR
 *   unrecognized — the QR does not resolve (wrong table code, unknown or inactive venue)
 */

import { useEffect, useState } from 'react';

import { loadPendingEntry, resolveEntry, subscribePendingEntry, type ResolvedEntry } from '../services/venueEntry';

export type EntryPreview =
  | { status: 'none' }
  | { status: 'ready'; entry: ResolvedEntry }
  | { status: 'unrecognized' };

export function usePendingEntryPreview(): EntryPreview {
  const [preview, setPreview] = useState<EntryPreview>({ status: 'none' });

  useEffect(() => {
    let run = 0;
    const refresh = async () => {
      const current = ++run;
      const target = await loadPendingEntry();
      if (current !== run) return;
      if (!target) {
        setPreview({ status: 'none' });
        return;
      }
      try {
        const entry = await resolveEntry(target);
        if (current === run) setPreview(entry ? { status: 'ready', entry } : { status: 'unrecognized' });
      } catch {
        if (current === run) setPreview({ status: 'none' });
      }
    };
    void refresh();
    const unsubscribe = subscribePendingEntry(() => void refresh());
    return () => {
      run += 1;
      unsubscribe();
    };
  }, []);

  return preview;
}
