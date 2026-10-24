/**
 * JChat 3.0 — D-13: can the "Entrar" button of an offer be used?
 *
 * On devices it always can (it opens the venue's chat as before). On the web the chat is only reached through the
 * venue's QR (door + location check), so the button works only while there is an ACTIVE venue session for that
 * same business; otherwise it is shown grey and disabled with a hint to scan the QR.
 */

export interface OfferEntryInput {
  platform: string;
  /** businessId of the active venue session, or null / undefined without one. */
  activeBusinessId: string | null | undefined;
  /** business_id of the offer's venue. */
  offerBusinessId: string;
}

export function canEnterOffer({ platform, activeBusinessId, offerBusinessId }: OfferEntryInput): boolean {
  if (platform !== 'web') return true;
  return !!activeBusinessId && activeBusinessId === offerBusinessId;
}
