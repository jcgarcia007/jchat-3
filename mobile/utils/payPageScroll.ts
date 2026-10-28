/**
 * JChat 3.0 — where the gift payment page scrolls when a card field is focused (pure: no React, no DOM; runs in Node tests).
 *
 * With the keyboard open the visible part of the page is short. The card form (Stripe's iframe, with country and postal code under the
 * card number) and the Pay button have to be above the keyboard AND its autofill bar when they fit. When they do not fit, the FOCUSED field
 * wins: the form is aligned to the top of the visible area and Pay is simply scrolled to afterwards.
 *
 * All numbers are in the same coordinate space (layout-viewport px, as getBoundingClientRect returns them):
 *   viewTop     the top of the scroller (just under the page header)
 *   viewBottom  the bottom of what the person can see (the scroller's bottom, never below the visual viewport)
 *   cardTop     the top of the card field area (the PaymentElement)
 *   payBottom   the bottom of the Pay button
 *   room        px kept free under Pay for the keyboard's autofill bar
 *   margin      px of air above the card field when it is aligned to the top
 */

export interface RevealInput {
  viewTop: number;
  viewBottom: number;
  cardTop: number;
  payBottom: number;
  room: number;
  margin: number;
}

export interface RevealPlan {
  /** `both` = field and Pay end up visible; `field` = they do not fit, the field has priority; `none` = already fine, do not move. */
  mode: 'both' | 'field' | 'none';
  /** How many px to scroll the scroller (positive = down). */
  delta: number;
}

export function planReveal(input: RevealInput): RevealPlan {
  const { viewTop, viewBottom, cardTop, payBottom, room, margin } = input;
  const limit = viewBottom - room; // Pay must end above this line
  const top = viewTop + margin; // the field must start below this line
  const fits = payBottom - cardTop <= limit - top;

  if (fits) {
    if (cardTop >= top && payBottom <= limit) return { mode: 'none', delta: 0 };
    // Bring Pay up to the limit (scrolling down); they fit, so the field then stays below the top.
    const down = payBottom - limit;
    if (down > 0) return { mode: 'both', delta: down };
    return { mode: 'both', delta: cardTop - top }; // the field is above the top: scroll up just enough (Pay then stays above the limit)
  }
  return { mode: 'field', delta: cardTop - top };
}
