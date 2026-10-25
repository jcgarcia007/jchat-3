/**
 * JChat 3.0 — useInviteMoment (web): `trigger('firstMessage' | 'finished')` shows the small "Abrir en JChat" notice ONCE per
 * browser session and never while the banner is dismissed (rules in utils/inviteMoments.ts). Off while INVITE_TO_APP_ENABLED
 * is false. The notice itself is drawn by components/web/InviteToastHost.web.tsx.
 */

import { useMemo } from 'react';

import { claimInviteMoment, emitInviteToast } from '../services/inviteState';
import type { InviteMoment } from '../utils/inviteMoments';

export interface InviteMomentApi {
  trigger: (moment: InviteMoment) => void;
}

export function useInviteMoment(): InviteMomentApi {
  return useMemo<InviteMomentApi>(
    () => ({
      trigger: (moment) => {
        if (claimInviteMoment(moment)) emitInviteToast(moment);
      },
    }),
    [],
  );
}
