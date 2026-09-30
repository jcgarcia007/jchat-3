import { isSupabaseConfigured, supabase } from './supabase';

export interface OfferBusiness {
  id: string;
  name: string;
  slug: string;
  icon_emoji: string | null;
  status: string;
}

export interface ActiveOffer {
  id: string;
  business_id: string;
  room_id: string | null;
  main_room_id: string | null;
  title: string;
  description: string | null;
  discount: string | null;
  type: string | null;
  code: string | null;
  expires_at: string | null;
  start_at: string | null;
  business: OfferBusiness;
}

interface OfferQueryRow {
  id: string;
  business_id: string;
  room_id: string | null;
  title: string;
  description: string | null;
  discount: string | null;
  type: string | null;
  code: string | null;
  expires_at: string | null;
  start_at: string | null;
  businesses: OfferBusiness | OfferBusiness[];
}

export async function fetchActiveOffers(): Promise<ActiveOffer[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('offers')
    .select(`
      id,
      business_id,
      room_id,
      title,
      description,
      discount,
      type,
      code,
      expires_at,
      start_at,
      businesses!inner(id, name, slug, icon_emoji, status)
    `)
    .eq('is_active', true)
    .eq('businesses.status', 'verified')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const now = Date.now();
  const rows = ((data ?? []) as unknown as OfferQueryRow[]).filter((offer) => {
    const hasStarted = !offer.start_at || new Date(offer.start_at).getTime() <= now;
    const hasNotEnded = !offer.expires_at || new Date(offer.expires_at).getTime() > now;
    return hasStarted && hasNotEnded;
  });

  const businessIds = [...new Set(rows.map((offer) => offer.business_id))];
  const roomsResult = businessIds.length > 0
    ? await supabase
      .from('rooms')
      .select('id, business_id, is_main, sort')
      .in('business_id', businessIds)
      .order('is_main', { ascending: false })
      .order('sort', { ascending: true })
    : { data: [], error: null };

  if (roomsResult.error) throw roomsResult.error;

  const mainRooms = new Map<string, string>();
  (roomsResult.data ?? []).forEach((room: { id: string; business_id: string }) => {
    if (!mainRooms.has(room.business_id)) mainRooms.set(room.business_id, room.id);
  });

  return rows.map((offer) => ({
    id: offer.id,
    business_id: offer.business_id,
    room_id: offer.room_id,
    main_room_id: mainRooms.get(offer.business_id) ?? null,
    title: offer.title,
    description: offer.description,
    discount: offer.discount,
    type: offer.type,
    code: offer.code,
    expires_at: offer.expires_at,
    start_at: offer.start_at,
    business: Array.isArray(offer.businesses) ? offer.businesses[0] : offer.businesses,
  }));
}
