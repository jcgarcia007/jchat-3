/**
 * Synthetic data for the hermetic specs: one venue ("Bar Sintético"), its main room, a small menu, the signed-in user and one other
 * person. Everything is invented; nothing here is, or was copied from, production data.
 */

import { expect, type Page } from '@playwright/test';
import { BUSINESS_ID, hermetic, OTHER_ID, ROOM_ID, signInSynthetic, USER_ID, VENUE, type Hermetic, type HermeticOptions } from './hermetic';

export const OWNER_ID = '00000000-0000-4000-8000-0000000000a0';
export const CATEGORY_ID = '00000000-0000-4000-8000-0000000000c1';
export const ITEM_ID = '00000000-0000-4000-8000-0000000000c9';
export const OFFER_ID = '00000000-0000-4000-8000-0000000000a9';

const MINUTE = 60_000;

export const ME = {
  id: USER_ID,
  username: 'sintetico',
  display_name: 'Sintético',
  avatar_url: null,
  language: 'es',
  settings: {},
  age_confirmed_at: '2026-01-01T00:00:00Z',
  is_verified: false,
  onboarding_completed: true,
};
export const OTHER = { id: OTHER_ID, username: 'otra_persona', display_name: 'Otra Persona', avatar_url: 'https://127.0.0.1:1/avatar-otra.jpg' };

export const BUSINESS = {
  id: BUSINESS_ID,
  name: 'Bar Sintético',
  icon_emoji: '🍷',
  icon_url: null,
  menu_enabled: true,
  owner_id: OWNER_ID,
  slug: VENUE,
  menu_mode: 'native',
  external_menu_url: null,
  subdomain: null,
  status: 'verified',
};

export const MAIN_ROOM = {
  id: ROOM_ID,
  business_id: BUSINESS_ID,
  parent_room_id: null,
  name: 'Main',
  chat_theme_id: 1,
  is_main: true,
  is_password_protected: false,
  sort: 0,
  description: null,
  is_active: true,
};

export const MENU_CATEGORY = { id: CATEGORY_ID, business_id: BUSINESS_ID, name: 'Para picar', sort: 0, is_published: true, icon_url: null };
export const MENU_ITEM = {
  id: ITEM_ID,
  category_id: CATEGORY_ID,
  business_id: BUSINESS_ID,
  name: 'Mini Corn Dogs',
  description: null,
  price_cents: 500,
  photo_url: null,
  image_url: null,
  staff_details: null,
  staff_details_alt: null,
  dietary_tags: [],
  id_required: false,
  badge: null,
  is_available: true,
  is_published: true,
  stock_count: null,
  options: {},
  sort: 0,
  menu_item_modifier_groups: [{ count: 0 }],
};

export const ENTRY_ROW = {
  business_id: BUSINESS_ID,
  business_name: BUSINESS.name,
  business_slug: VENUE,
  logo_url: null,
  room_id: ROOM_ID,
  table_label: null,
  table_qr_token: null,
};

/** A gift offer as `gift_offer_view` answers it. */
export function offerView(overrides: Record<string, unknown> = {}) {
  return {
    id: OFFER_ID,
    business_id: BUSINESS_ID,
    status: 'held',
    is_sender: false,
    from: { id: OTHER_ID, name: OTHER.display_name, avatar_url: null },
    to: { id: USER_ID, name: ME.display_name, avatar_url: null },
    items: [{ menu_item_id: ITEM_ID, name: MENU_ITEM.name, description: null, qty: 1, id_required: false }],
    item_count: 1,
    note: null,
    expires_at: new Date(Date.now() + 14 * MINUTE).toISOString(),
    table_label: null,
    total_cents: null,
    order_id: null,
    ...overrides,
  };
}

/** The default tables and RPCs every spec needs to get into the venue's chat. Specs add to / override them. */
export function baseOptions(extra: HermeticOptions = {}): HermeticOptions {
  return {
    tables: {
      users: [ME],
      public_profiles: [ME, OTHER],
      businesses: [BUSINESS],
      rooms: [MAIN_ROOM],
      menu_categories: [MENU_CATEGORY],
      menu_items: [MENU_ITEM],
      ...(extra.tables ?? {}),
    },
    rpcs: {
      my_active_orders: [],
      resolve_venue_entry: [ENTRY_ROW],
      check_geofence_and_join_room: [{ access_granted: true, is_owner: false, distance_m: 5, reason: 'inside_radius' }],
      venue_session_resume: false,
      gift_available: true,
      my_block_relations: [],
      is_banned_from_room: false,
      match_enabled_for_business: false,
      match_get_activity: { super_left: 5, likes: [], liked_me: [], matches: [] },
      // The presence filter (migration 243): by default it confirms everybody it was asked about.
      venue_present_users: (body: Record<string, unknown>) => (body.p_user_ids as string[]) ?? [],
      tod_enabled_for_business: false,
      ...(extra.rpcs ?? {}),
    },
  };
}

/** Signs the synthetic user in, installs the harness and opens the venue's entry link. */
export async function openVenue(page: Page, extra: HermeticOptions = {}, query = ''): Promise<Hermetic> {
  const h = await hermetic(page, baseOptions(extra));
  await signInSynthetic(page);
  await page.addInitScript(() => {
    // Granted position (the app asks for it at the entry): inside the synthetic venue.
    const position = { coords: { latitude: 26.083048, longitude: -80.223725, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() };
    navigator.geolocation.getCurrentPosition = (ok) => ok(position as GeolocationPosition);
    navigator.geolocation.watchPosition = (ok) => { ok(position as GeolocationPosition); return 1; };
  });
  await page.goto(`/?venue=${VENUE}${query}`, { waitUntil: 'load' });
  return h;
}

/** Taps "Entrar" and waits for the chat. */
export async function enterChat(page: Page) {
  const enter = page.getByTestId('chat-enter');
  await enter.waitFor({ state: 'visible', timeout: 30_000 });
  await enter.click();
  await expect(page.getByTestId('chat-more-button')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
}
