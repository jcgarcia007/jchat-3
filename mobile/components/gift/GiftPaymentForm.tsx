/**
 * JChat 3.0 — GiftPaymentForm (iOS / Android): renders nothing. Devices hold the card with the native PaymentSheet
 * (services/stripe.ts holdGiftPayment). The web variant (GiftPaymentForm.web.tsx) confirms the PaymentIntent with Stripe.js.
 */

export interface GiftPaymentFormProps {
  clientSecret: string;
  publishableKey: string;
  /** The total the server priced, in cents. */
  totalCents: number;
  /** The card is on hold: the offer is on its way to the recipient. */
  onHeld: () => void;
  /** True while the card is being confirmed (the caller must not close / cancel then). */
  onBusyChange?: (busy: boolean) => void;
  /** Web: refusals the server has already counted for this offer (0 for a new one): the "N attempts left" counter starts from it. */
  initialFailures?: number;
  /** Web: the fine print under the Pay button (what is authorized now, when it is charged or released). */
  note?: string;
}

export function GiftPaymentForm(_props: GiftPaymentFormProps): null {
  return null;
}

export default GiftPaymentForm;
