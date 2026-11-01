/**
 * JChat 3.0 — where the VenueDock (the "Estás en {local}" card and the orders in progress) shows (pure: runs in Node tests).
 *
 *   'dock'   — the screens that have the tab bar (Map, Nearby, Offers, Messages, Profile) and, on the web, which has no tabs, the screens that
 *              play their part: the signed-in home (`Tabs` = WebNoVenueScreen), WebMessages and WebOffers. The card sits right above the tab bar
 *              (on the web, at the bottom of the page).
 *   'hidden' — everywhere else: the venue chat itself, an open DM (DMChat), the DM inbox, a post, someone else's profile stacked over a tab,
 *              settings, payments, orders, menus, Match…
 *
 * `routeName` is the focused LEAF route (navigationRef.getCurrentRoute() already resolves nested stacks). Names are exact, never prefixes.
 */

export type VenueBarPlacement = 'dock' | 'hidden';

const DOCK_ROUTES: ReadonlySet<string> = new Set(['Map', 'Nearby', 'Offers', 'Messages', 'Profile', 'Tabs', 'WebMessages', 'WebOffers']);

export function venueBarPlacement(routeName: string | null): VenueBarPlacement {
  return routeName !== null && DOCK_ROUTES.has(routeName) ? 'dock' : 'hidden';
}
