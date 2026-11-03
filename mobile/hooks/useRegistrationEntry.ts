/**
 * JChat 3.0 — opens the sign-up form unless this device was rejected for age in the last 24 h (audit B2-13).
 * While blocked it shows the same neutral dialog as the rejection itself (no age, no requirement stated) and does not navigate.
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { hasActiveAgeRejection } from '../services/ageRejection';
import { showAlert } from '../utils/dialog';

export function useRegistrationEntry(open: () => void): () => void {
  const { t } = useTranslation('auth');
  return useCallback(() => {
    void hasActiveAgeRejection().then((blocked) => {
      if (blocked) showAlert(t('register.alerts.ageTitle'), t('register.alerts.ageMessage'));
      else open();
    });
  }, [open, t]);
}
