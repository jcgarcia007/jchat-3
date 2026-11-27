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

/**
 * An owner-typed menu link is opened only when it is an `https://` link with a host: no `tel:`, `sms:`, `javascript:`, `http:`, another app's
 * scheme, text with spaces or control characters, no empty host (`https://`, `https:///path`) and no credentials (`https://user@host`).
 * Anything else behaves as if there were no external menu. Returns the trimmed text.
 *
 * Plain string checks on purpose, not `new URL(...)`: if `URL` throws or misbehaves in Hermes the `catch` would hide EVERY venue's external menu with
 * no visible error. The browser still parses the real URL when it opens it.
 */
export function safeExternalMenuUrl(raw: string | null | undefined): string | null {
  const text = raw?.trim();
  if (!text) return null;
  if (/[\s\u0000-\u001f\u007f]/.test(text)) return null;
  if (!/^https:\/\//i.test(text)) return null;
  const rest = text.slice('https://'.length);
  const authorityEnd = rest.search(/[/?#]/);
  const authority = authorityEnd === -1 ? rest : rest.slice(0, authorityEnd);
  if (!authority || authority.includes('@') || authority.includes('\\')) return null;
  return text;
}

export function venueMenuTarget(input: {
  platform: string;
  menuMode: string | null | undefined;
  slug: string | null | undefined;
  externalUrl: string | null | undefined;
}): VenueMenuTarget {
  const slug = input.slug?.trim() || null;
  const externalUrl = safeExternalMenuUrl(input.externalUrl);
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
