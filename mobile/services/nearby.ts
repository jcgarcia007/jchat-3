import { isSupabaseConfigured, supabase } from './supabase';

interface HoursEntry {
  open: string;
  close: string;
  closed?: boolean;
}

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type BusinessHours = Partial<Record<DayKey, HoursEntry>>;

export interface NearbyBusiness {
  id: string;
  name: string;
  slug: string;
  category: string;
  address: string | null;
  icon_emoji: string | null;
  hours: BusinessHours | null;
  room_count: number;
  main_room_id?: string | null;
  /** Present only after a real distance source is connected. */
  distanceLabel?: string | null;
  /** Present only after a live presence source is connected. */
  active_users?: number | null;
}

const DEMO_BUSINESSES: NearbyBusiness[] = [
  {
    id: 'demo-1',
    name: 'The Blue Note',
    slug: 'the-blue-note',
    category: 'Bar & Lounge',
    address: '123 Main St',
    icon_emoji: '🎵',
    hours: {
      mon: { open: '17:00', close: '02:00' }, tue: { open: '17:00', close: '02:00' },
      wed: { open: '17:00', close: '02:00' }, thu: { open: '17:00', close: '02:00' },
      fri: { open: '16:00', close: '03:00' }, sat: { open: '14:00', close: '03:00' },
      sun: { open: '14:00', close: '00:00' },
    },
    room_count: 3,
  },
  {
    id: 'demo-2',
    name: 'Rooftop Garden',
    slug: 'rooftop-garden',
    category: 'Restaurant',
    address: '456 Oak Ave',
    icon_emoji: '🌿',
    hours: {
      mon: { open: '11:00', close: '22:00' }, tue: { open: '11:00', close: '22:00' },
      wed: { open: '11:00', close: '22:00' }, thu: { open: '11:00', close: '22:00' },
      fri: { open: '11:00', close: '23:00' }, sat: { open: '10:00', close: '23:00' },
      sun: { closed: true, open: '00:00', close: '00:00' },
    },
    room_count: 2,
  },
  {
    id: 'demo-3',
    name: 'Neon Club',
    slug: 'neon-club',
    category: 'Nightclub',
    address: '789 Electric Blvd',
    icon_emoji: '🌟',
    hours: {
      mon: { closed: true, open: '00:00', close: '00:00' },
      tue: { closed: true, open: '00:00', close: '00:00' },
      wed: { closed: true, open: '00:00', close: '00:00' },
      thu: { open: '22:00', close: '05:00' }, fri: { open: '22:00', close: '06:00' },
      sat: { open: '22:00', close: '06:00' },
      sun: { closed: true, open: '00:00', close: '00:00' },
    },
    room_count: 5,
  },
  {
    id: 'demo-4',
    name: 'Coffee House Co.',
    slug: 'coffee-house-co',
    category: 'Café',
    address: '321 Brew Street',
    icon_emoji: '☕',
    hours: {
      mon: { open: '07:00', close: '20:00' }, tue: { open: '07:00', close: '20:00' },
      wed: { open: '07:00', close: '20:00' }, thu: { open: '07:00', close: '20:00' },
      fri: { open: '07:00', close: '21:00' }, sat: { open: '08:00', close: '21:00' },
      sun: { open: '08:00', close: '18:00' },
    },
    room_count: 1,
  },
  {
    id: 'demo-5',
    name: 'Sports Arena Bar',
    slug: 'sports-arena-bar',
    category: 'Sports Bar',
    address: '55 Stadium Way',
    icon_emoji: '🏟️',
    hours: {
      mon: { open: '12:00', close: '01:00' }, tue: { open: '12:00', close: '01:00' },
      wed: { open: '12:00', close: '01:00' }, thu: { open: '12:00', close: '02:00' },
      fri: { open: '12:00', close: '03:00' }, sat: { open: '11:00', close: '03:00' },
      sun: { open: '11:00', close: '00:00' },
    },
    room_count: 4,
  },
];

const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function isOpenNow(hours: BusinessHours | null): boolean {
  if (!hours) return false;
  const entry = hours[DAY_KEYS[new Date().getDay()]];
  if (!entry || entry.closed) return false;

  const now = new Date();
  const [openH, openM] = entry.open.split(':').map(Number);
  const [closeH, closeM] = entry.close.split(':').map(Number);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = openH * 60 + openM;
  let closeMinutes = closeH * 60 + closeM;
  if (closeMinutes < openMinutes) closeMinutes += 24 * 60;
  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}

export function nearbyCategories(businesses: NearbyBusiness[]): string[] {
  return [...new Set(businesses.map((business) => business.category))].sort();
}

export function filterNearbyBusinesses(
  businesses: NearbyBusiness[],
  searchQuery: string,
  selectedCategory: string | null,
): NearbyBusiness[] {
  const query = searchQuery.trim().toLocaleLowerCase();
  return businesses.filter((business) => {
    const matchesSearch = !query
      || business.name.toLocaleLowerCase().includes(query)
      || business.category.toLocaleLowerCase().includes(query);
    return matchesSearch && (!selectedCategory || business.category === selectedCategory);
  });
}

export async function fetchBusinesses(): Promise<NearbyBusiness[]> {
  if (!isSupabaseConfigured) return DEMO_BUSINESSES;

  const { data: businesses, error } = await supabase
    .from('businesses')
    .select('id, name, slug, category, address, icon_emoji, hours')
    .eq('status', 'verified')
    .order('name');

  if (error || !businesses) {
    console.warn('[nearby] fetchBusinesses error:', error?.message);
    return [];
  }

  const ids = businesses.map((business: { id: string }) => business.id);
  const roomRows = ids.length > 0
    ? await supabase
      .from('rooms')
      .select('id, business_id, is_main, sort')
      .in('business_id', ids)
      .order('is_main', { ascending: false })
      .order('sort', { ascending: true })
    : { data: [] };

  const countMap: Record<string, number> = {};
  const mainRoomMap: Record<string, string> = {};
  (roomRows.data ?? []).forEach((room: { id: string; business_id: string; is_main: boolean }) => {
    countMap[room.business_id] = (countMap[room.business_id] ?? 0) + 1;
    if (!mainRoomMap[room.business_id]) mainRoomMap[room.business_id] = room.id;
  });

  return businesses.map((business: {
    id: string;
    name: string;
    slug: string;
    category: string;
    address: string | null;
    icon_emoji: string | null;
    hours: unknown;
  }) => ({
    id: business.id,
    name: business.name,
    slug: business.slug,
    category: business.category,
    address: business.address,
    icon_emoji: business.icon_emoji,
    hours: (business.hours as BusinessHours) ?? null,
    room_count: countMap[business.id] ?? 0,
    main_room_id: mainRoomMap[business.id] ?? null,
  }));
}
