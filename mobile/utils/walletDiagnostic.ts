/**
 * JChat 3.0 — wallet diagnostic of the gift's payment page (pure: no React, no Stripe, runs in Node tests).
 *
 * Apple Pay / Google Pay come from Stripe's Express Checkout Element, which decides by itself whether a wallet can be shown. When it
 * shows nothing there is no way to tell why, so in TEST mode only (publishable key `pk_test_…`) the page prints one small line with what
 * Stripe answered, and logs the same to the console. In live mode (`pk_live_…`) NOTHING is drawn or logged.
 *
 * Even in test mode the line only shows when the address carries `?stripe_diag=1` (it is remembered for the tab in sessionStorage, because the
 * router rewrites the address): a normal test-mode visit sees nothing.
 *
 * Nothing in here ever sees the key itself beyond its prefix, nor the PaymentIntent's client secret.
 */

import type { WalletAvailability } from './giftPaymentFlow';

/** How long to wait for Stripe's answer before saying there was none. */
export const WALLET_DIAG_TIMEOUT_MS = 5000;

/** sessionStorage key where `?stripe_diag=1` is remembered for the tab (set by captureWebEntry, read by the form). */
export const STRIPE_DIAG_STORAGE_KEY = 'jchat.stripeDiag';

/** The diagnostic was asked for: the address carries `stripe_diag=1` (any position in the query), or this tab remembered it. */
export function stripeDiagRequested(search: string | null | undefined, remembered: string | null | undefined): boolean {
  return /(?:^|[?&])stripe_diag=1(?:&|#|$)/.test(search ?? '') || remembered === '1';
}

/** True ONLY for a test-mode publishable key. Anything else (live, empty, malformed) draws and logs nothing. */
export function isStripeTestKey(publishableKey: string | null | undefined): boolean {
  return typeof publishableKey === 'string' && publishableKey.startsWith('pk_test_');
}

export type WalletDiag = { kind: 'methods'; methods: string[] } | { kind: 'timeout' } | { kind: 'error'; type: string; message: string };

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

const KEY_RE = /\b(?:sk|rk|pk|whsec|sb_secret|sb_publishable)_[A-Za-z0-9_]{6,}|\b(?:pi|seti)_[A-Za-z0-9]+_secret_[A-Za-z0-9]+/g;
/** The `type` and `message` of a Stripe `loaderror`, safe to draw and log: anything that looks like a key or a client secret is replaced, and it is cut short. */
export function safeErrorParts(error: { type?: unknown; message?: unknown } | null | undefined): { type: string; message: string } {
  const clean = (v: unknown, max: number) => String(v ?? '').replace(KEY_RE, '[redacted]').replace(/\s+/g, ' ').trim().slice(0, max);
  return { type: clean(error?.type, 40) || 'error', message: clean(error?.message, 140) };
}

/** The parts of the visible line: which i18n key to use and the wallet list to put in it. Null when nothing must be drawn. */
export function diagLineParts(testKey: boolean, diag: WalletDiag | null): { key: 'wallets' | 'noReply' | 'error'; list?: string[]; type?: string; message?: string } | null {
  if (!testKey || !diag) return null;
  if (diag.kind === 'timeout') return { key: 'noReply' };
  if (diag.kind === 'error') return { key: 'error', type: diag.type, message: diag.message };
  return { key: 'wallets', list: diag.methods };
}
