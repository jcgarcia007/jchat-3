/**
 * JChat 3.0 — Labels for Match notifications (Fase D7)
 *
 * match_* notification rows only carry ids (a discreet push never carries names), so the list
 * resolves them here: the other person's visible name (display_name / @username — never email),
 * the venue name, and whether Match is still enabled at that venue (rows of venues where it is
 * off are hidden by the caller).
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { isMatchEnabledForBusiness } from '../services/match';
import { isMatchNotificationType } from '../services/notifications';
import type { NotificationRow } from '../services/notifications';

export interface MatchNotificationLabels {
  /** user id → visible name. */
  userNames: Record<string, string>;
  /** business id → name. */
  businessNames: Record<string, string>;
  /** business ids where Match is enabled; null until resolved (caller shows rows meanwhile). */
  enabledBusinesses: Set<string> | null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

export function useMatchNotificationLabels(rows: NotificationRow[]): MatchNotificationLabels {
  const [labels, setLabels] = useState<MatchNotificationLabels>({
    userNames: {},
    businessNames: {},
    enabledBusinesses: null,
  });

  // Stable key of the ids that need resolving.
  const { userIds, businessIds, key } = useMemo(() => {
    const users = new Set<string>();
    const businesses = new Set<string>();
    for (const row of rows) {
      if (!isMatchNotificationType(row.type)) continue;
      const user = str(row.payload?.from_user_id) ?? str(row.payload?.other_user_id);
      const business = str(row.payload?.business_id);
      if (user) users.add(user);
      if (business) businesses.add(business);
    }
    const u = [...users].sort();
    const b = [...businesses].sort();
    return { userIds: u, businessIds: b, key: `${u.join(',')}|${b.join(',')}` };
  }, [rows]);

  useEffect(() => {
    if (!isSupabaseConfigured || key === '|') return;
    let alive = true;
    void (async () => {
      const [profiles, businesses, enabled] = await Promise.all([
        userIds.length
          ? supabase.from('public_profiles').select('id, display_name, username').in('id', userIds)
          : Promise.resolve({ data: [] as { id: string; display_name: string | null; username: string | null }[] }),
        businessIds.length
          ? supabase.from('businesses').select('id, name').in('id', businessIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        Promise.all(
          businessIds.map((id) =>
            isMatchEnabledForBusiness(id)
              .then((on) => (on ? id : null))
              // If we can't tell, keep the row visible rather than hide a real notification.
              .catch(() => id),
          ),
        ),
      ]);
      if (!alive) return;
      const userNames: Record<string, string> = {};
      for (const p of (profiles.data ?? []) as { id: string; display_name: string | null; username: string | null }[]) {
        const name = p.display_name?.trim() || (p.username ? `@${p.username}` : '');
        if (name) userNames[p.id] = name;
      }
      const businessNames: Record<string, string> = {};
      for (const b of (businesses.data ?? []) as { id: string; name: string }[]) businessNames[b.id] = b.name;
      setLabels({
        userNames,
        businessNames,
        enabledBusinesses: new Set(enabled.filter((id): id is string => id !== null)),
      });
    })();
    return () => {
      alive = false;
    };
  }, [key, userIds, businessIds]);

  return labels;
}
