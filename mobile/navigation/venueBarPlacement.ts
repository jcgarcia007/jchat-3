/**
 * JChat 3.0 — where the HomeStatusBar ("Estás en {local} · Volver" and "N pedidos en curso") shows (pure: runs in
 * Node tests).
 *
 *   'tabs'     — the Map tab: the venue session and the orders in progress.
 *   'detached' — an open DM conversation (DMChat): only the venue session.
 *   'hidden'   — everywhere else: Profile, Messages (the list), Nearby, Offers, the DM inbox, the chat itself…
 *
 * The orders segment follows the same rule: it is part of the same bar, so it is only on the Map.
 * `routeName` is the focused LEAF route (navigationRef.getCurrentRoute() already resolves nested stacks).
 */

export type VenueBarPlacement = 'tabs' | 'detached' | 'hidden';

export function venueBarPlacement(routeName: string | null): VenueBarPlacement {
  if (routeName === 'Map') return 'tabs';
  if (routeName === 'DMChat') return 'detached';
  return 'hidden';
}
