/**
 * JChat 3.0 — useInviteMoment (iOS / Android): a constant no-op. The web variant (useInviteMoment.web.ts) shows the notice.
 */

import type { InviteMoment } from '../utils/inviteMoments';

export interface InviteMomentApi {
  trigger: (moment: InviteMoment) => void;
}

const NOOP: InviteMomentApi = { trigger: () => undefined };

export function useInviteMoment(): InviteMomentApi {
  return NOOP;
}
