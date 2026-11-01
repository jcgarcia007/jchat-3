/**
 * JChat 3.0 — reads of a business for the BusinessPreviewCard (the card that opens from a map pin and from "Ver local" in Offers).
 *
 * One list of columns and one row → card mapper, shared by the Map's bulk load (every verified business) and the single read by id (Offers). Nothing
 * here writes; RLS decides what each person sees.
 */

import { isSupabaseConfigured, supabase } from './supabase';
import type { HoursMap } from '../utils/hours';

/** The columns the card needs. The Map and Offers read exactly these. */
export const BUSINESS_CARD_COLUMNS =
  'id, name, category, icon_emoji, icon_url, logo_url, lat, lng, status, address, cover_url, hours, slug, description, geofence_radius_m';

export interface CardBusiness {
  id: string;
  name: string;
  category: string;
  icon_emoji: string;
  icon_url: string | null;
  logo_url: string | null;
  lat: number;
  lng: number;
  status: string;
  address: string;
  cover_url: string | null;
  hours: HoursMap | null;
  slug: string | null;
  description: string | null;
  geofence_radius_m: number | null;
}

/** A row of `businesses` as the card wants it (defaults for the columns that may be empty), or null when it has no position. */
export function toCardBusiness(row: Partial<CardBusiness> & { id?: string }): CardBusiness | null {
  if (typeof row.id !== 'string' || typeof row.lat !== 'number' || typeof row.lng !== 'number') return null;
  return {
    id: row.id,
    name: row.name ?? '',
    category: row.category ?? '',
    icon_emoji: row.icon_emoji ?? '📍',
    icon_url: row.icon_url ?? null,
    logo_url: row.logo_url ?? null,
    lat: row.lat,
    lng: row.lng,
    status: row.status ?? 'verified',
    address: row.address ?? '',
    cover_url: row.cover_url ?? null,
    hours: row.hours ?? null,
    slug: row.slug ?? null,
    description: row.description ?? null,
    geofence_radius_m: typeof row.geofence_radius_m === 'number' ? row.geofence_radius_m : null,
  };
}

/** One business by id (one read), or null when it does not exist, has no position or is not visible. Throws on a failed request. */
export async function fetchBusinessForCard(businessId: string): Promise<CardBusiness | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.from('businesses').select(BUSINESS_CARD_COLUMNS).eq('id', businessId).maybeSingle();
  if (error) throw error;
  return data ? toCardBusiness(data as Partial<CardBusiness>) : null;
}

/** A business's main room id (is_main first, else the lowest sort): ChatRoom expects a ROOM id. */
export async function resolveMainRoomId(businessId: string): Promise<string | null> {
  if (!isSupabaseConfigured) return businessId;
  const { data } = await supabase
    .from('rooms')
    .select('id, is_main, sort')
    .eq('business_id', businessId)
    .order('is_main', { ascending: false })
    .order('sort', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
