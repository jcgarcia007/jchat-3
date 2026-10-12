/**
 * JChat 3.0 — where the venue's menu button (🍴, "Menú" of the + panel, "Ordenar" of an offer…) leads (pure).
 *
 *   web   — the venue's PUBLIC menu page opens in a SHEET over the chat ('web-sheet': an iframe of <menu>/<slug>?embed=1;
 *           the site allows framing of /m/* by our own domains only, and the page has its own ordering and payment
 *           flow). An owner-configured external menu still opens its own URL ('external'). Without a slug (and no
 *           external URL) there is nothing to open: 'none' (the button is hidden).
 *   native — unchanged: external URL → 'external'; menu_mode 'web' with a slug → 'screen-web-preview'; otherwise
 *            the native menu ('screen-menu').
 */

import { PUBLIC_MENU_BASE_URL } from '../constants/appLinks';

export type VenueMenuKind = 'web-sheet' | 'external' | 'screen-web-preview' | 'screen-menu' | 'none';

export interface VenueMenuTarget {
  kind: VenueMenuKind;
  url?: string;
}

export function publicMenuUrl(slug: string): string {
  return `${PUBLIC_MENU_BASE_URL}/${encodeURIComponent(slug)}`;
}

/** The same page for the sheet's iframe. */
export function embeddedMenuUrl(slug: string): string {
  return `${publicMenuUrl(slug)}?embed=1`;
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
    if (slug) return { kind: 'web-sheet', url: embeddedMenuUrl(slug) };
    return { kind: 'none' };
  }
  if (external) return external;
  if (input.menuMode === 'web' && slug) return { kind: 'screen-web-preview' };
  return { kind: 'screen-menu' };
}
