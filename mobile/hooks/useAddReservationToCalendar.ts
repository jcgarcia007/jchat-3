/**
 * JChat 3.0 — useAddReservationToCalendar (M3, part D): the tap handler shared by the next-reservation card and My reservations.
 * Builds the event (utils/reservationCalendar) with the translated texts and opens the system editor (services/reservationCalendar).
 * Returns a message to show when something failed; null when it worked or the user closed the editor.
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { reservationBusiness, type MyReservationRow } from '../services/reservations';
import { addReservationToCalendar } from '../services/reservationCalendar';
import { parseRequests } from '../utils/reservationFlow';
import { buildReservationEvent } from '../utils/reservationCalendar';

export function useAddReservationToCalendar(): (row: MyReservationRow) => Promise<string | null> {
  const { t } = useTranslation('reservations');
  return useCallback(async (row: MyReservationRow) => {
    const business = reservationBusiness(row);
    const name = business.name || t('venueFallback');
    const parsed = parseRequests(row.special_requests);
    const requests = parsed.keys.length > 0 ? parsed.keys.map((k) => t(`request.${k}`)) : parsed.legacy ? [parsed.legacy] : [];
    const event = buildReservationEvent({
      businessName: business.name,
      address: business.address,
      reservedAt: row.reserved_at,
      timezone: business.timezone,
      title: t('calendar.eventTitle', { business: name }),
      people: t('people', { count: row.party_size }),
      requests,
      requestsLabel: t('requestsLabel'),
    });
    if (!event) return t('calendar.error');
    try {
      const result = await addReservationToCalendar(event);
      return result === 'denied' ? t('calendar.denied') : null;
    } catch (e) {
      console.warn('[reservation-calendar] error:', e);
      return t('calendar.error');
    }
  }, [t]);
}
