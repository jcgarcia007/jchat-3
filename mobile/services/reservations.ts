/**
 * JChat 3.0 — the signed-in customer's own reservations ("My reservations").
 *
 * Reads are limited by RLS (reservations_customer_select: the customer sees their own) and the update by
 * reservations_customer_update + the reservations_customer_guard trigger (a customer can only change status to
 * 'cancelled'). The read still filters on user_id: a venue owner's policy would otherwise also return the venue's
 * reservations made by other people.
 */

import { supabase, isSupabaseConfigured } from './supabase';

type EmbeddedBusiness = {
  name: string | null;
  logo_url: string | null;
  address: string | null;
  timezone?: string | null;
  lat?: number | null;
  lng?: number | null;
} | null;

export interface MyReservationRow {
  id: string;
  business_id: string;
  reserved_at: string;
  party_size: number;
  status: string;
  is_waitlist: boolean;
  /** Request chip KEYS ("birthday,terrace"), or free text on reservations made before the keyboard-free flow (utils/reservationFlow.parseRequests). */
  special_requests?: string | null;
  /** Why the venue rejected it (a key of utils/reservationStatus REJECT_REASON_KEYS); only on status 'rejected'. */
  status_reason?: string | null;
  /** Joined venue (PostgREST may return one object or a one-element array). */
  businesses?: EmbeddedBusiness | EmbeddedBusiness[];
}

export interface ReservationBusiness {
  name: string;
  logoUrl: string | null;
  address: string | null;
  /** The venue's IANA zone (the card writes dates and times in it). */
  timezone: string | null;
  lat: number | null;
  lng: number | null;
}

/** The venue of a reservation, flattened. */
export function reservationBusiness(row: Pick<MyReservationRow, 'businesses'>): ReservationBusiness {
  const embedded = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses;
  return {
    name: embedded?.name ?? '',
    logoUrl: embedded?.logo_url ?? null,
    address: embedded?.address ?? null,
    timezone: embedded?.timezone ?? null,
    lat: typeof embedded?.lat === 'number' ? embedded.lat : null,
    lng: typeof embedded?.lng === 'number' ? embedded.lng : null,
  };
}

const RESERVATION_COLUMNS = 'id, business_id, reserved_at, party_size, status, status_reason, is_waitlist, special_requests, businesses(name, logo_url, address, timezone, lat, lng)';

/** The customer's reservations, most recent first (reserved_at desc). */
export async function listMyReservations(): Promise<MyReservationRow[]> {
  if (!isSupabaseConfigured) return [];
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return [];
  const { data, error } = await supabase
    .from('reservations')
    .select(RESERVATION_COLUMNS)
    .eq('user_id', userId)
    .order('reserved_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as MyReservationRow[];
}

/** Why a cancellation failed (the screen shows one translated message; the code is for the log). */
export class ReservationCancelError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'ReservationCancelError';
    this.code = code;
  }
}

/**
 * Cancels one of the customer's reservations (status = 'cancelled'). The server decides: the guard trigger answers
 * customer_cannot_change_status for anything else, and RLS hides rows that are not theirs (no row comes back).
 * Resolves with the status the server now has.
 */
export async function cancelMyReservation(id: string): Promise<string> {
  if (!isSupabaseConfigured) throw new ReservationCancelError('not_configured');
  const { data, error } = await supabase
    .from('reservations')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select('id, status')
    .maybeSingle();
  if (error) {
    const code = /customer_cannot_change_status/.test(error.message ?? '') ? 'customer_cannot_change_status' : error.code ?? 'update_failed';
    throw new ReservationCancelError(code);
  }
  if (!data) throw new ReservationCancelError('not_found');
  return (data as { status: string }).status;
}

/**
 * The reservations that can be on the "Your next reservation" card: pending or confirmed, from two hours ago on, nearest first.
 * The card re-checks the window itself (utils/nextReservation.pickNext), this only keeps the read small.
 */
export async function listActiveReservations(nowMs: number = Date.now()): Promise<MyReservationRow[]> {
  if (!isSupabaseConfigured) return [];
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return [];
  const since = new Date(nowMs - 2 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('reservations')
    .select(RESERVATION_COLUMNS)
    .eq('user_id', userId)
    .in('status', ['pending', 'confirmed'])
    .gt('reserved_at', since)
    .order('reserved_at', { ascending: true })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as unknown as MyReservationRow[];
}
