/**
 * Web stub for @stripe/stripe-react-native (Metro alias, web only — see metro.config.js).
 * Payments on web are not part of v1; every native call rejects with a stable error code.
 * Covers the exports the app imports: StripeProvider, initStripe, initPaymentSheet,
 * presentPaymentSheet, plus useStripe for hook consumers.
 */

import React from 'react';

const unavailable = (): Promise<never> =>
  Promise.reject(new Error('stripe_native_unavailable_web'));

export function StripeProvider({ children }: { children?: React.ReactNode }): React.ReactElement {
  return <>{children}</>;
}

export const initStripe = unavailable;
export const initPaymentSheet = unavailable;
export const presentPaymentSheet = unavailable;

export function useStripe() {
  return { initPaymentSheet, presentPaymentSheet };
}
