/**
 * JChat 3.0 — where the venue's menu button (🍴, "Menú" of the + panel, "Ordenar" of an offer…) leads (pure).
 *
 *   web   — the web build has no native Stripe and its embedded menu (an iframe of jchat.cloud) is blocked by that
 *           site's frame protection, so the PUBLIC menu opens in a new browser tab ('web-tab'); an owner-configured
 *           external menu still opens its own URL ('external'). Without a slug (and no external URL) there is
 *           nothing to open: 'none' (the button is hidden).
 *   native — unchanged: external URL → 'external'; menu_mode 'web' with a slug → 'screen-web-preview'; otherwise
 *            the native menu ('screen-menu').
 */

import { PUBLIC_MENU_BASE_URL } from '../constants/appLinks';

export type VenueMenuKind = 'web-tab' | 'external' | 'screen-web-preview' | 'screen-menu' | 'none';

export interface VenueMenuTarget {
  kind: VenueMenuKind;
  url?: string;
}

export function publicMenuUrl(slug: string): string {
  return `${PUBLIC_MENU_BASE_URL}/${encodeURIComponent(slug)}`;
}

export function venueMenuTarget(input: {
  platform: string;
  menuMode: string | null | undefined;
  slug: string | null | undefined;
  externalUrl: string | null | undefined;
}): VenueMenuTarget {
  const slug = input.slug?.trim() || null;
  const externalUrl = input.externalUrl?.trim() || null;
  const external = input.menuMode === 'external' && externalUrl ? ({ kind: 'external', url: externalUrl } as const) : null;

  if (input.platform === 'web') {
    if (external) return external;
    if (slug) return { kind: 'web-tab', url: publicMenuUrl(slug) };
    return { kind: 'none' };
  }
  if (external) return external;
  if (input.menuMode === 'web' && slug) return { kind: 'screen-web-preview' };
  return { kind: 'screen-menu' };
}
