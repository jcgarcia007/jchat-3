/**
 * JChat 3.0 — GiftPayPage (iOS / Android): renders nothing. Devices hold the card with the native PaymentSheet
 * (services/stripe.ts holdGiftPayment), opened straight from GiftSheet's "Send" button, exactly as before: this file only exists so
 * the web variant (GiftPayPage.web.tsx, the full-screen card page) has a native twin. GiftSheet never reaches it on devices
 * (it renders it only on the web, when the server's PaymentIntent is ready).
 */

import type { GiftHoldParams } from '../../utils/giftHold';

export interface GiftPayPageProps {
  recipientName: string;
  venueName: string;
  /** The gifted products, already shortened ("A, B +1"). */
  itemsSummary: string;
  itemCount: number;
  payParams: GiftHoldParams;
  /** The fine print under the Pay button (holdNote). */
  note: string;
  /** The arrow: cancel the unpaid offer and go back to the chat. */
  onBack: () => void;
  /** The card is on hold. */
  onHeld: () => void;
  onBusyChange?: (busy: boolean) => void;
}

export function GiftPayPage(_props: GiftPayPageProps): null {
  return null;
}

export default GiftPayPage;
