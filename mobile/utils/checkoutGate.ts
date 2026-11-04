/**
 * Should the checkout refuse to take an order right now? (B9-3.) Two independent signals, either one blocks:
 *  - the venue's clock: its weekly hours read in ITS time zone say CLOSED (unknown hours are not "closed");
 *  - the server: quote_order / create_payment_intent answered 409 `venue_closed` (the server is the authority).
 */

import { getOpenStatus } from './hours';

export const VENUE_CLOSED_CODE = 'venue_closed';

export type CheckoutGateInput = {
  hours: unknown;
  timezone: string | null | undefined;
  now: Date;
  /** Error code of the last server answer to a quote / payment (e.g. 'venue_closed'), if any. */
  serverCode?: string | null;
};

export function venueBlocksCheckout({ hours, timezone, now, serverCode }: CheckoutGateInput): boolean {
  if (typeof serverCode === 'string' && serverCode.toLowerCase() === VENUE_CLOSED_CODE) return true;
  return getOpenStatus(hours, now, timezone) === 'closed';
}
