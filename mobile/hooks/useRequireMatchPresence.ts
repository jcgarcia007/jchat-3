/**
 * JChat 3.0 — Require Match presence (Fase D7)
 *
 * Match only exists while the person is at the venue. A Match screen that needs the venue calls
 * this hook: if there is no live presence for `businessId` (the chat that feeds the heartbeat is
 * gone, presence expired, …) it shows a notice and goes back instead of showing stale data.
 *
 *  - mode 'active':  presence must be 'active' (profiles, activity, "it's a match").
 *  - mode 'present': any live check-in state is fine (Match home shows verifying/denied itself);
 *    only 'idle' (no heartbeat at all) or another venue is rejected.
 *
 * The server enforces this too (not_present / not_in_same_venue); this is the friendly UX layer.
 */

import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useMatchPresenceState } from '../services/matchPresence';

export function useRequireMatchPresence(businessId: string, mode: 'active' | 'present'): void {
  const navigation = useNavigation();
  const { t } = useTranslation('match');
  const presence = useMatchPresenceState();
  const leftRef = useRef(false);

  const sameVenue = presence.businessId === businessId;
  const ok = sameVenue && (mode === 'active' ? presence.status === 'active' : presence.status !== 'idle');

  useEffect(() => {
    if (ok || leftRef.current) return;
    leftRef.current = true;
    Alert.alert(t('presence.requiredTitle'), t('presence.required'));
    if (navigation.canGoBack()) navigation.goBack();
    else (navigation as unknown as { navigate: (name: string) => void }).navigate('Tabs');
  }, [ok, navigation, t]);
}
