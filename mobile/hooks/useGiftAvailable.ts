/**
 * JChat 3.0 — useGiftAvailable
 *
 * Whether I can send `otherUserId` a gift RIGHT NOW (both present at my current venue, no block):
 * asks the server (gift_available) and re-asks whenever `refreshKey` changes (screens pass a focus
 * counter). Without a venue session (not in a venue) it is always false.
 */

import { useEffect, useState } from 'react';
import { giftAvailable } from '../services/giftOffers';
import { useVenueSession } from '../context/VenueSessionContext';

export function useGiftAvailable(otherUserId: string | null | undefined, refreshKey = 0): { available: boolean; businessId: string | null } {
  const { session } = useVenueSession();
  const businessId = session?.businessId ?? null;
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!businessId || !otherUserId) {
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
