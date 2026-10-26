/**
 * JChat 3.0 — GiftPaymentForm (web): the card form of a gift, Stripe.js PaymentElement over the PaymentIntent that
 * payments/gift_hold already created (the SAME one the app confirms with its native PaymentSheet).
 *
 *   - The amount is the server's (`totalCents` is shown, never sent); this form only confirms the card.
 *   - confirmPayment({ redirect: 'if_required' }): cards confirm in place (3-D Secure opens Stripe's own frame). The
 *     PaymentIntent has capture_method 'manual', so success is `requires_capture` = "card on hold" (utils/giftPaymentResult):
 *     NOTHING is charged now, only if the recipient accepts.
 *   - First version = card only: Apple Pay / Google Pay need the domain registered with Stripe (every {local}.jchat.cloud),
 *     so Stripe simply does not show them here. Card data never touches our code (Stripe's iframe).
 *   - `loadStripe` comes from '@stripe/stripe-js/pure': Stripe.js is downloaded only when this form is opened.
 * Colors come from the theme tokens (no new hex).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { loadStripe } from '@stripe/stripe-js/pure';
import type { Appearance } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';

import { Spinner } from '../common/Spinner';
import { useThemeColors } from '../../theme/colors';
import { palette } from '../../theme/tokens';
import { formatCents } from '../../utils/currency';
import { GIFT_MAX_PAYMENT_ATTEMPTS, giftPaymentOutcome, stripeLocale } from '../../utils/giftPaymentResult';
import type { GiftPaymentFormProps } from './GiftPaymentForm';

export type { GiftPaymentFormProps } from './GiftPaymentForm';

type Colors = ReturnType<typeof useThemeColors>;

/** px kept free under the Pay button when the form is scrolled into view (the keyboard's autofill bar), and the page header's height. */
const AUTOFILL_BAR_ROOM = 72;
const HEADER_ROOM = 72;

function CardForm({ totalCents, onHeld, onBusyChange, note }: Pick<GiftPaymentFormProps, 'totalCents' | 'onHeld' | 'onBusyChange' | 'note'>): React.ReactElement {
  const c = useThemeColors();
  const { t } = useTranslation('chat');
  const stripe = useStripe();
  const elements = useElements();
  const formRef = useRef<View>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (focusTimer.current) clearTimeout(focusTimer.current); }, []);

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
  // Refusals counted by the server (3 close the offer). `closed` = the offer no longer takes a card.
  const [declines, setDeclines] = useState(0);
  const [closed, setClosed] = useState(false);

  // Tell the sheet while the card is being confirmed (it must not close then), and release it if this form goes away.
  const busy = paying || processing;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  const pay = async () => {
    if (!stripe || !elements || paying || processing) return;
    setPaying(true);
    setMessage(null);
    try {
      const result = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: { return_url: window.location.href },
      });
      const outcome = giftPaymentOutcome(result);
      if (outcome.kind === 'held') {
        onHeld();
      } else if (outcome.kind === 'processing') {
        setProcessing(true);
        setMessage(t('gift.payProcessing'));
      } else if (outcome.kind === 'closed') {
        setClosed(true);
        setMessage(t('gift.payClosed'));
      } else if (outcome.kind === 'retry') {
        const used = outcome.declined ? declines + 1 : declines;
        const left = GIFT_MAX_PAYMENT_ATTEMPTS - used;
        setDeclines(used);
        if (outcome.declined && left <= 0) {
          setClosed(true);
          setMessage(t('gift.payNoAttemptsLeft'));
        } else {
          const base = outcome.message ?? t('gift.errors.generic');
          setMessage(outcome.declined ? `${base} ${t('gift.payAttemptsLeft', { count: left })}` : base);
        }
      } else {
        console.error('[GiftPaymentForm] confirmPayment failed:', outcome.code);
        setMessage(t('gift.errors.generic'));
      }
    } catch {
      console.error('[GiftPaymentForm] confirmPayment threw');
      setMessage(t('gift.errors.generic'));
    } finally {
      setPaying(false);
    }
  };

  const disabled = !stripe || !elements || paying || processing || closed;
  return (
    <View ref={formRef} style={styles.form}>
      <PaymentElement onFocus={revealForm} />
      {message ? (
        <Text accessibilityRole="alert" style={[styles.message, { color: processing ? c.textSecondary : c.danger }]}>
          {message}
        </Text>
      ) : null}
      <Pressable
        testID="gift-pay"
        onPress={() => void pay()}
        disabled={disabled}
        accessibilityRole="button"
        style={({ pressed }) => [styles.payBtn, { backgroundColor: c.brandFill, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}
      >
        {paying ? <Spinner color={palette.onBrand} /> : <Text style={[styles.payLabel, { color: palette.onBrand }]}>{t('gift.payButton', { amount: formatCents(totalCents) })}</Text>}
      </Pressable>
      {!note ? null : <Text style={[styles.fine, { color: c.textSecondary }]}>{note}</Text>}
    </View>
  );
}

/** Stripe's Elements appearance from the app's theme tokens. */
function appearanceFor(c: Colors): Appearance {
  return {
    theme: 'stripe',
    variables: {
      colorPrimary: palette.brand,
      colorBackground: c.bgSurface,
      colorText: c.textPrimary,
      colorDanger: c.danger,
      borderRadius: '12px',
    },
  };
}

export function GiftPaymentForm({ clientSecret, publishableKey, totalCents, onHeld, onBusyChange, note }: GiftPaymentFormProps): React.ReactElement {
  const c = useThemeColors();
  const { i18n } = useTranslation('chat');
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);
  const options = useMemo(
    () => ({ clientSecret, locale: stripeLocale(i18n.language), appearance: appearanceFor(c) }),
    [clientSecret, i18n.language, c],
  );
  return (
    <Elements stripe={stripePromise} options={options}>
      <CardForm totalCents={totalCents} onHeld={onHeld} onBusyChange={onBusyChange} note={note} />
    </Elements>
  );
}

export default GiftPaymentForm;

const styles = StyleSheet.create({
  form: { gap: 12, paddingVertical: 4 },
  message: { fontSize: 13, lineHeight: 18 },
  payBtn: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  payLabel: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  fine: { fontSize: 12, textAlign: 'center' },
});
