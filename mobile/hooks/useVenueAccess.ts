/**
 * JChat 3.0 — useVenueAccess
 *
 * Golden rule: what this person may order at the venue (server verdict, venue_order_access).
 * `viewOnly` = outside the area with pick-up off → the menu can be browsed but nothing can be added.
 * Until the first answer arrives it is NOT view-only (the server still rejects at quote time).
 */

import { useEffect, useState } from 'react';
import { fetchVenueAccess, readVenueCoords, type VenueAccess } from '../services/venueAccess';

export function useVenueAccess(businessId: string | null | undefined): { access: VenueAccess | null; viewOnly: boolean } {
  const [access, setAccess] = useState<VenueAccess | null>(null);

  useEffect(() => {
    if (!businessId) return;
    let alive = true;
    void readVenueCoords()
      .then((coords) => fetchVenueAccess(businessId, coords))
      .then((result) => {
        if (alive) setAccess(result);
      });
    return () => {
      alive = false;
    };
  }, [businessId]);

  return { access, viewOnly: access !== null && access.allowedTypes.length === 0 };
}
