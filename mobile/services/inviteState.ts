/**
 * JChat 3.0 — invite-to-the-app state (iOS / Android): nothing. The invite surfaces exist only on the web
 * (services/inviteState.web.ts); on devices every function here answers "no" and does nothing, so no caller needs a
 * platform check.
 */

import type { InviteMoment } from '../utils/inviteMoments';

export type InviteToastListener = (moment: InviteMoment | null) => void;

export function isInviteBannerAllowed(): boolean {
  return false;
}

export function closeInviteBanner(): void {
  /* devices have no banner */
}

export function subscribeBannerClosed(_listener: () => void): () => void {
  return () => undefined;
}

/** Always false on devices. */
export function claimInviteMoment(_moment: InviteMoment): boolean {
  return false;
}

export function subscribeInviteToast(_listener: InviteToastListener): () => void {
  return () => undefined;
}

export function emitInviteToast(_moment: InviteMoment): void {
  /* devices have no notices */
}

export function openAppFromWeb(): void {
  /* devices ARE the app */
}
