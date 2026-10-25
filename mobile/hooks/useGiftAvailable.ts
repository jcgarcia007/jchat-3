/**
 * JChat 3.0 — useGiftAvailable
 *
 * Whether I can send `otherUserId` a gift RIGHT NOW (both present at my current venue, no block):
 * asks the server (gift_available) and re-asks whenever `refreshKey` changes (screens pass a focus
 * counter). Without a venue session (not in a venue) it is always false.
 */

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { giftAvailable } from '../services/giftOffers';
import { useVenueSession } from '../context/VenueSessionContext';
import { WEB_GIFTS_ENABLED } from '../constants/features';

/** The web has no way to pay a gift until WEB_GIFTS_ENABLED (constants/features.ts): it never offers it. Devices: never off. */
const GIFTS_OFF_ON_THIS_PLATFORM = Platform.OS === 'web' && !WEB_GIFTS_ENABLED;

export function useGiftAvailable(otherUserId: string | null | undefined, refreshKey = 0): { available: boolean; businessId: string | null } {
  const { session } = useVenueSession();
  const businessId = session?.businessId ?? null;
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (GIFTS_OFF_ON_THIS_PLATFORM || !businessId || !otherUserId) {
      setAvailable(false);
      return;
    }
    let alive = true;
    void giftAvailable(businessId, otherUserId).then((ok) => {
      if (alive) setAvailable(ok);
    });
    return () => {
      alive = false;
    };
  }, [businessId, otherUserId, refreshKey]);

  return { available, businessId };
}
