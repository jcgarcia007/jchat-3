/**
 * "Salir del local" always asks first: leaving ends the venue session and the venue's conversation is gone. Both entries to it (the chat's menu and the
 * Salir button of the VenueDock) go through this one function; the caller runs `leaveVenue` only when it resolves true.
 */

import i18n from 'i18next';
import { confirm } from './dialog';

/** Resolves true when the person confirms leaving {businessName}, false on Cancel or dismissal. */
export function confirmLeaveVenue(businessName: string): Promise<boolean> {
  const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, { ns: 'chat', ...options }) as string;
  return confirm(t('venueSession.leaveConfirmTitle', { business: businessName }), t('venueSession.leaveConfirmBody'), {
    confirmText: t('venueSession.leave'),
    cancelText: t('venueSession.leaveCancel'),
    destructive: true,
  });
}
