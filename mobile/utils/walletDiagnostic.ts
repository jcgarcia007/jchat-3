/**
 * JChat 3.0 — wallet diagnostic of the gift's payment page (pure: no React, no Stripe, runs in Node tests).
 *
 * Apple Pay / Google Pay come from Stripe's Express Checkout Element, which decides by itself whether a wallet can be shown. When it
 * shows nothing there is no way to tell why, so in TEST mode only (publishable key `pk_test_…`) the page prints one small line with what
 * Stripe answered, and logs the same to the console. In live mode (`pk_live_…`) NOTHING is drawn or logged.
 *
 * Nothing in here ever sees the key itself beyond its prefix, nor the PaymentIntent's client secret.
 */

import type { WalletAvailability } from './giftPaymentFlow';

/** How long to wait for Stripe's answer before saying there was none. */
export const WALLET_DIAG_TIMEOUT_MS = 5000;

/** True ONLY for a test-mode publishable key. Anything else (live, empty, malformed) draws and logs nothing. */
export function isStripeTestKey(publishableKey: string | null | undefined): boolean {
  return typeof publishableKey === 'string' && publishableKey.startsWith('pk_test_');
}

export type WalletDiag = { kind: 'methods'; methods: string[] } | { kind: 'timeout' };

/** Names of the wallets Stripe says are available, from the element's `ready` event (`availablePaymentMethods`: name → boolean). */
export function methodsFromReady(available: Partial<Record<string, boolean>> | null | undefined): string[] {
  if (!available) return [];
  return Object.keys(available).filter((name) => available[name] === true).sort();
}

/** Same, from the `availablepaymentmethodschange` event (`paymentMethods`: name → { available }). */
export function methodsFromChange(paymentMethods: WalletAvailability | null | undefined): string[] {
  if (!paymentMethods) return [];
  return (Object.keys(paymentMethods) as (keyof WalletAvailability)[])
    .filter((name) => paymentMethods[name]?.available === true)
    .sort();
}

/** The parts of the visible line: which i18n key to use and the wallet list to put in it. Null when nothing must be drawn. */
export function diagLineParts(testKey: boolean, diag: WalletDiag | null): { key: 'wallets' | 'noReply'; list?: string[] } | null {
  if (!testKey || !diag) return null;
  return diag.kind === 'timeout' ? { key: 'noReply' } : { key: 'wallets', list: diag.methods };
}
