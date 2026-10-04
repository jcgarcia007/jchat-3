/**
 * JChat 3.0 — "Leave the venue" confirmation (Match, Fase D1)
 *
 * Shared by the chat's ⋯ menu and the Match screen. Confirms, calls match_leave_venue (which
 * deletes everything of mine at the venue server-side), clears the shared presence state and
 * remembers the opt-out so the entry notice shows Match switched off next time. The caller
 * decides where to navigate in onLeft (leaving the venue means leaving its chat too).
 */

import { Alert } from 'react-native';
import i18n from '../i18n';
import { matchLeaveVenue, setMatchOptIn } from '../services/match';
import { resetMatchPresence } from '../services/matchPresence';

interface ConfirmLeaveArgs {
  businessId: string;
  businessName: string;
  onLeft: () => void;
}

export function confirmLeaveVenue({ businessId, businessName, onLeft }: ConfirmLeaveArgs): void {
  const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, { ns: 'match', ...options }) as string;
  Alert.alert(t('leave.title', { business: businessName }), t('leave.body'), [
    { text: t('leave.cancel'), style: 'cancel' },
    {
      text: t('leave.confirm'),
      style: 'destructive',
      onPress: () => {
        void (async () => {
          try {
            await matchLeaveVenue(businessId);
            await setMatchOptIn(businessId, false);
            resetMatchPresence();
            onLeft();
          } catch {
            Alert.alert(t('leave.error'));
          }
        })();
      },
    },
  ]);
}
