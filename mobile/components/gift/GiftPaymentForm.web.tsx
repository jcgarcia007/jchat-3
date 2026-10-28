/**
 * JChat 3.0 — GiftPaymentForm (web): the card form of a gift, Stripe.js PaymentElement over the PaymentIntent that
 * payments/gift_hold already created (the SAME one the app confirms with its native PaymentSheet).
 *
 *   - The amount is the server's (`totalCents` is shown, never sent); this form only confirms the card.
 *   - confirmPayment({ redirect: 'if_required' }): cards confirm in place (3-D Secure opens Stripe's own frame). The
 *     PaymentIntent has capture_method 'manual', so success is `requires_capture` = "card on hold" (utils/giftPaymentResult):
 *     NOTHING is charged now, only if the recipient accepts.
 *   - Apple Pay / Google Pay (R5): Stripe's Express Checkout Element sits ABOVE the card form, inside the SAME Elements (same
 *     PaymentIntent, same manual-capture hold, same fine print). It needs the page's domain registered with Stripe (every
 *     {local}.jchat.cloud, on the PLATFORM account: gift_hold makes destination charges); on a browser / domain without a wallet
 *     Stripe reports none, and neither the button nor the "or with card" separator is drawn. Link, PayPal, Amazon Pay and Klarna
 *     are off (the PaymentIntent is card only). Card data never touches our code (Stripe's iframe).
 *   - ONE function (`confirm`) confirms the payment for the Pay button and for the wallet's `confirm` event: same busy flag
 *     (the page cannot be left meanwhile), same attempt counter, same outcome table (utils/giftPaymentFlow.ts). A refused wallet
 *     payment counts like a refused card (the server counts payment_intent.payment_failed either way); closing the wallet sheet
 *     (`cancel`) is not an attempt.
 *   - `loadStripe` comes from '@stripe/stripe-js/pure': Stripe.js is downloaded only when this form is opened.
 * Colors come from the theme tokens (no new hex).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { loadStripe } from '@stripe/stripe-js/pure';
import type { Appearance } from '@stripe/stripe-js';
import { Elements, ExpressCheckoutElement, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { StripeExpressCheckoutElementConfirmEvent, StripeExpressCheckoutElementOptions } from '@stripe/stripe-js';

import { Spinner } from '../common/Spinner';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { formatCents } from '../../utils/currency';
import { giftPaymentOutcome, stripeLocale } from '../../utils/giftPaymentResult';
import { nextGiftStep, walletAvailable } from '../../utils/giftPaymentFlow';
import { STRIPE_DIAG_STORAGE_KEY, WALLET_DIAG_TIMEOUT_MS, diagLineParts, isStripeTestKey, methodsFromChange, methodsFromReady, safeErrorParts, stripeDiagRequested, type WalletDiag } from '../../utils/walletDiagnostic';
import type { GiftPaymentFormProps } from './GiftPaymentForm';

export type { GiftPaymentFormProps } from './GiftPaymentForm';

type Colors = ReturnType<typeof useThemeColors>;

/** px kept free under the Pay button when the form is scrolled into view (the keyboard's autofill bar), and the page header's height. */
const AUTOFILL_BAR_ROOM = 72;
const HEADER_ROOM = 72;

/**
 * Only Apple Pay and Google Pay (both are the PaymentIntent's `card` type). Everything else is off. The buttons carry no call to
 * action ('plain'): what happens is a HOLD, not a purchase. One column, no overflow menu.
 *
 * NEVER put `layout.maxRows` next to `layout.overflow: 'never'`: with the real Stripe.js that combination makes the element fire NEITHER
 * `ready` NOR `loaderror` (it just stays silent), so the wallet never shows. Found with a probe against the real Stripe.js on WebKit and
 * Chromium (e2e/real/ece-real-stripe.spec.ts); `overflow: 'auto'` or no `maxRows` both answer. One column + no overflow menu is enough.
 */
const WALLET_OPTIONS: StripeExpressCheckoutElementOptions = {
  paymentMethods: { applePay: 'auto', googlePay: 'auto', link: 'never', paypal: 'never', amazonPay: 'never', klarna: 'never' },
  buttonType: { applePay: 'plain', googlePay: 'plain' },
  buttonHeight: 48,
  layout: { maxColumns: 1, overflow: 'never' },
};

/** `?stripe_diag=1` in the address, or remembered for this tab by captureWebEntry. */
function diagRequested(): boolean {
  try {
    return stripeDiagRequested(window.location.search, window.sessionStorage.getItem(STRIPE_DIAG_STORAGE_KEY));
  } catch {
    return false;
  }
}

function CardForm({ totalCents, onHeld, onBusyChange, note, initialFailures = 0, publishableKey }: Pick<GiftPaymentFormProps, 'totalCents' | 'onHeld' | 'onBusyChange' | 'note' | 'initialFailures' | 'publishableKey'>): React.ReactElement {
  const c = useThemeColors();
  const { t } = useTranslation('chat');
  const stripe = useStripe();
  const elements = useElements();
  const formRef = useRef<View>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (focusTimer.current) clearTimeout(focusTimer.current); }, []);

  // TEST MODE ONLY (pk_test_…) AND only when asked for (`?stripe_diag=1`, remembered for the tab): what Stripe's Express Checkout Element answered
  // about the wallets, drawn as one small line and logged. With a live key, or without the flag, nothing is drawn or logged. Only the wallet
  // names go out: never the key, the client secret or anything of the customer.
  const testKey = isStripeTestKey(publishableKey) && diagRequested();
  const [walletDiag, setWalletDiag] = useState<WalletDiag | null>(null);
  useEffect(() => {
    if (!testKey) return undefined;
    const timer = setTimeout(() => {
      setWalletDiag((current) => current ?? { kind: 'timeout' });
      console.info('[GiftPaymentForm] Stripe test · no answer from the wallet element in 5 s');
    }, WALLET_DIAG_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [testKey]);
  const reportLoadError = (error: { type?: unknown; message?: unknown } | null | undefined) => {
    if (!testKey) return;
    const parts = safeErrorParts(error);
    console.info(`[GiftPaymentForm] Stripe test · loaderror · ${parts.type} ${parts.message}`);
    setWalletDiag({ kind: 'error', type: parts.type, message: parts.message });
  };
  const reportWallets = (source: 'ready' | 'availablepaymentmethodschange', methods: string[]) => {
    if (!testKey) return;
    console.info(`[GiftPaymentForm] Stripe test · ${source} · wallets: ${methods.length ? methods.join(', ') : 'none'}`);
    setWalletDiag({ kind: 'methods', methods });
  };

  // The card field lives in Stripe's iframe, so the page never sees its focus: Stripe's own 'focus' event is the signal. The keyboard
  // takes a moment to slide in; once the visual viewport has settled the form (field + Pay button) is scrolled into view inside the
  // page's ONE ScrollView, leaving room under the Pay button for the keyboard's autofill bar. A form taller than what is visible
  // aligns its top instead, so the card field is never the part that is cut.
  const revealForm = () => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => {
      const node = formRef.current as unknown as HTMLElement | null;
      if (!node?.scrollIntoView) return;
      const visible = window.visualViewport?.height ?? window.innerHeight;
      node.style.scrollMarginBottom = `${AUTOFILL_BAR_ROOM}px`;
      node.scrollIntoView({ block: node.getBoundingClientRect().height + AUTOFILL_BAR_ROOM > visible - HEADER_ROOM ? 'start' : 'end', behavior: 'smooth' });
    }, 300);
  };
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  // Refusals counted by the server (3 close the offer), started from what the server already counted (a reopened offer).
  // `closed` = the offer no longer takes a payment. Refs mirror them so the wallet's confirm event (attached once) never reads a stale value.
  const [declines, setDeclines] = useState(initialFailures);
  const [closed, setClosed] = useState(false);
  const declinesRef = useRef(initialFailures);
  const closedRef = useRef(false);
  const busyRef = useRef(false);
  const [walletReady, setWalletReady] = useState(false);

  // Tell the sheet while the card is being confirmed (it must not close then), and release it if this form goes away.
  const busy = paying || processing;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  /**
   * THE payment function: the Pay button and the wallet's `confirm` event both call it. Returns what the wallet needs to know:
   * 'held' / 'processing' (the payment is in Stripe's hands), 'busy' (another confirmation is already running: this call is a
   * duplicate and is ignored — the wallet sheet must NOT be told it failed) or 'failed' (a refusal, a closed offer, an error → the
   * wallet sheet must be told with event.paymentFailed()). There is NO await before stripe.confirmPayment: Apple Pay opens its sheet from the person's
   * tap, and Safari only allows that inside the user gesture.
   *
   * elements.submit(): Stripe's Express Checkout examples call it before creating a PaymentIntent (the "deferred" flow). Here the
   * PaymentIntent already exists and Elements was created with its clientSecret, so, as in the card path, confirmPayment({ elements })
   * runs directly. If a real Apple Pay test shows Stripe asking for it, add `await elements.submit()` AFTER the wallet's authorisation
   * (inside onConfirm), never before the tap. Doc: https://docs.stripe.com/elements/express-checkout-element/accept-a-payment?payment-ui=elements
   */
  const confirm = async (): Promise<'held' | 'processing' | 'busy' | 'failed'> => {
    if (busyRef.current) return 'busy';
    if (!stripe || !elements || closedRef.current) return 'failed';
    busyRef.current = true;
    setPaying(true);
    setMessage(null);
    try {
      const result = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: { return_url: window.location.href },
      });
      const step = nextGiftStep(giftPaymentOutcome(result), declinesRef.current);
      switch (step.kind) {
        case 'held':
          onHeld();
          return 'held';
        case 'processing':
          setProcessing(true);
          setMessage(t('gift.payProcessing'));
          return 'processing';
        case 'closed':
          closedRef.current = true;
          setClosed(true);
          setMessage(t('gift.payClosed'));
          return 'failed';
        case 'retry': {
          declinesRef.current = step.declines;
          setDeclines(step.declines);
          if (step.exhausted) {
            closedRef.current = true;
            setClosed(true);
            setMessage(t('gift.payNoAttemptsLeft'));
          } else {
            const base = step.message ?? t('gift.errors.generic');
            setMessage(step.counted ? `${base} ${t('gift.payAttemptsLeft', { count: step.left })}` : base);
          }
          return 'failed';
        }
        default:
          console.error('[GiftPaymentForm] confirmPayment failed:', step.code);
          setMessage(t('gift.errors.generic'));
          return 'failed';
      }
    } catch {
      console.error('[GiftPaymentForm] confirmPayment threw');
      setMessage(t('gift.errors.generic'));
      return 'failed';
    } finally {
      busyRef.current = false;
      setPaying(false);
    }
  };

  // Wallet: the person authorised in the Apple Pay / Google Pay sheet → the same confirm. A failure closes the sheet with Stripe's error.
  const onWalletConfirm = (event: StripeExpressCheckoutElementConfirmEvent) => {
    void confirm().then((outcome) => {
      if (outcome === 'failed') event.paymentFailed({ reason: 'fail' });
    });
  };
  // The person closed the wallet sheet: nothing was confirmed, so nothing is counted and nothing changes.
  const onWalletCancel = () => undefined;

  const disabled = !stripe || !elements || paying || processing || closed;
  return (
    <View ref={formRef} style={styles.form}>
      {/* Mounted even while hidden: the element has to exist for Stripe to say whether a wallet is available at all. */}
      <View testID="gift-wallet" style={walletReady ? styles.wallet : styles.walletHidden} pointerEvents={disabled ? 'none' : 'auto'}>
        <ExpressCheckoutElement
          options={WALLET_OPTIONS}
          onReady={({ availablePaymentMethods }) => reportWallets('ready', methodsFromReady(availablePaymentMethods))}
          onLoadError={({ error }) => reportLoadError(error)}
          onAvailablePaymentMethodsChange={({ paymentMethods }) => {
            setWalletReady(walletAvailable(paymentMethods));
            reportWallets('availablepaymentmethodschange', methodsFromChange(paymentMethods));
          }}
          onConfirm={onWalletConfirm}
          onCancel={onWalletCancel}
        />
      </View>
      {walletReady ? (
        <View testID="gift-wallet-or" style={styles.orRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={[styles.orLine, { backgroundColor: c.borderSubtle }]} />
          <Text style={[styles.orText, { color: c.textSecondary }]}>{t('gift.payOrCard')}</Text>
          <View style={[styles.orLine, { backgroundColor: c.borderSubtle }]} />
        </View>
      ) : null}
      <PaymentElement options={CARD_ONLY_OPTIONS} onFocus={revealForm} />
      {message ? (
        <Text accessibilityRole="alert" style={[styles.message, { color: processing ? c.textSecondary : c.dangerText }]}>
          {message}
        </Text>
      ) : null}
      <Pressable
        testID="gift-pay"
        onPress={() => void confirm()}
        disabled={disabled}
        accessibilityRole="button"
        style={({ pressed }) => [styles.payBtn, { backgroundColor: c.brandFill, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}
      >
        {paying ? <Spinner color={palette.onBrand} /> : <Text style={[styles.payLabel, { color: palette.onBrand }]}>{t('gift.payButton', { amount: formatCents(totalCents) })}</Text>}
      </Pressable>
      {!note ? null : <Text style={[styles.fine, { color: c.textSecondary }]}>{note}</Text>}
      {(() => {
        const parts = diagLineParts(testKey, walletDiag);
        if (!parts) return null;
        const text = parts.key === 'noReply'
          ? t('gift.diag.noReply')
          : parts.key === 'error'
            ? t('gift.diag.error', { type: parts.type, message: parts.message })
            : t('gift.diag.wallets', { list: parts.list && parts.list.length ? parts.list.join(', ') : t('gift.diag.none') });
        return <Text testID="gift-wallet-diag" style={[styles.fine, { color: c.textSecondary }]}>{text}</Text>;
      })()}
    </View>
  );
}

/**
 * The gift is CARD ONLY. The PaymentIntent is `payment_method_types: ['card']`, but Stripe includes Link in card integrations
 * (https://docs.stripe.com/payments/link/link-payment-integrations), and with Link come its Instant Bank Payments: a "Bank" tab with
 * a cash-back badge. `wallets.link: 'never'` keeps Link out of THIS form. Only the gift's PaymentElement gets it: the order checkouts
 * are other code and are not touched. (`as const`: no extra type import.)
 */
const CARD_ONLY_OPTIONS = { wallets: { applePay: 'never', googlePay: 'never', link: 'never' } } as const;

/** Stripe's Elements appearance from the app's theme tokens. */
function appearanceFor(c: Colors): Appearance {
  return {
    theme: 'stripe',
    variables: {
      colorPrimary: palette.brand,
      colorBackground: c.bgSurface,
      colorText: c.textPrimary,
      colorDanger: c.dangerText,
      borderRadius: '12px',
    },
  };
}

export function GiftPaymentForm({ clientSecret, publishableKey, totalCents, onHeld, onBusyChange, note, initialFailures }: GiftPaymentFormProps): React.ReactElement {
  const c = useThemeColors();
  const { i18n } = useTranslation('chat');
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);
  const options = useMemo(
    () => ({ clientSecret, locale: stripeLocale(i18n.language), appearance: appearanceFor(c) }),
    [clientSecret, i18n.language, c],
  );
  return (
    <Elements stripe={stripePromise} options={options}>
      <CardForm totalCents={totalCents} onHeld={onHeld} onBusyChange={onBusyChange} note={note} initialFailures={initialFailures} publishableKey={publishableKey} />
    </Elements>
  );
}

export default GiftPaymentForm;

const styles = StyleSheet.create({
  form: { gap: 12, paddingVertical: 4 },
  wallet: { minHeight: 48 },
  // Not display:none — Stripe needs the element laid out to report which wallets exist.
  walletHidden: { height: 0, overflow: 'hidden', opacity: 0 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth },
  orText: { fontSize: 13 },
  message: { fontSize: 13, lineHeight: 18 },
  payBtn: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  payLabel: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  fine: { fontSize: 12, textAlign: 'center' },
});
