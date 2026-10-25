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
  /** The person went back without paying (the caller cancels the unpaid offer). */
  onCancel: () => void;
  /** True while the card is being confirmed (the caller must not close / cancel then). */
  onBusyChange?: (busy: boolean) => void;
  /** Web: short heading of the card step ("Pagar Mini Corn Dogs · $X"); the form falls back to its generic title. */
  title?: string;
  /** Web: the on-screen keyboard is open, so the fine print folds away to leave room for the card field and the buttons. */
  compact?: boolean;
  /** Web: pixel cap of the card field area; past it the field scrolls on its own so the Hold / Back buttons are never pushed out of sight. */
  fieldMaxHeight?: number;
}

export function GiftPaymentForm(_props: GiftPaymentFormProps): null {
  return null;
}

export default GiftPaymentForm;
