/**
 * JChat 3.0 — "Add to calendar" for a reservation (M3, part D). Pure: builds the event the system calendar editor opens prefilled.
 * The native call lives in services/reservationCalendar.ts. Texts come in already translated (the caller owns i18n).
 *
 * Title "Reservation at {venue}", 2 hours long, the venue's address as the place, notes with the party size and the requests.
 * The event keeps the VENUE's time zone, so a guest travelling sees the right hour.
 */

export const EVENT_DURATION_MS = 2 * 60 * 60 * 1000;

export interface ReservationEventInput {
  /** Venue name ("" when unknown: the caller passes its fallback). */
  businessName: string;
  address: string | null | undefined;
  /** ISO instant of the reservation. */
  reservedAt: string;
  /** IANA zone of the venue; null falls back to the device zone. */
  timezone: string | null | undefined;
  /** Already translated: "Reservation at {{business}}". */
  title: string;
  /** Already translated: "4 people". */
  people: string;
  /** Already translated request chips ("Terrace", …) and/or the old free text. */
  requests: readonly string[];
  /** Already translated label for the requests line ("Requests"). */
  requestsLabel: string;
}

export interface ReservationCalendarEvent {
  title: string;
  startDate: string;
  endDate: string;
  location?: string;
  notes: string;
  timeZone?: string;
}

/** True when `tz` is an IANA zone this runtime knows (so a bad value never reaches the native call). */
function validZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The event for a reservation, or null when the instant is not a valid date. */
export function buildReservationEvent(input: ReservationEventInput): ReservationCalendarEvent | null {
  const start = new Date(input.reservedAt);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + EVENT_DURATION_MS);
  const address = input.address?.trim();
  const requests = input.requests.map((r) => r.trim()).filter(Boolean);
  const notes = [input.people, requests.length > 0 ? `${input.requestsLabel}: ${requests.join(', ')}` : null].filter(Boolean).join('\n');
  const event: ReservationCalendarEvent = {
    title: input.title,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    notes,
  };
  if (address) event.location = input.businessName ? `${input.businessName}, ${address}` : address;
  else if (input.businessName) event.location = input.businessName;
  if (validZone(input.timezone)) event.timeZone = input.timezone;
  return event;
}
