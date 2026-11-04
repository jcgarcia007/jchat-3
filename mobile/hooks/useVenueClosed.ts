/**
 * Is this venue CLOSED right now? (B9-3.) Reads the venue's weekly hours and time zone once and re-evaluates every minute with the
 * shared clock of utils/hours.ts, so the cart notices the closing time passing while it is open. The SERVER is the authority (it answers
 * `venue_closed` to a quote / payment / order); this only lets the cart say so early. Unknown hours or a failed read are NOT "closed".
 */

import { useEffect, useState } from 'react';

import { isSupabaseConfigured, supabase } from '../services/supabase';
import { getOpenStatus } from '../utils/hours';

const RECHECK_MS = 60_000;

export function useVenueClosed(businessId: string | null | undefined): boolean {
  const [venue, setVenue] = useState<{ hours: unknown; timezone: string | null } | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    setVenue(null);
    setClosed(false);
    if (!businessId || !isSupabaseConfigured) return undefined;
    let alive = true;
    void supabase
      .from('businesses')
      .select('hours, timezone')
      .eq('id', businessId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          console.warn('[venue-hours] read failed:', error.message);
          return;
        }
        if (data) setVenue({ hours: data.hours ?? null, timezone: (data.timezone as string | null) ?? null });
      });
    return () => {
      alive = false;
    };
  }, [businessId]);

  useEffect(() => {
    if (!venue) {
      setClosed(false);
      return undefined;
    }
    const evaluate = () => setClosed(getOpenStatus(venue.hours, new Date(), venue.timezone) === 'closed');
    evaluate();
    const timer = setInterval(evaluate, RECHECK_MS);
    return () => clearInterval(timer);
  }, [venue]);

  return closed;
}
