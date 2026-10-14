/**
 * JChat 3.0 — which checkout path the public menu (/m/<slug>) uses: the SIGNED-IN one (payments EF, order owned by
 * the cookie's user) or the GUEST one (guest-pay EF, order with a guest tracking code).
 *
 * Why the embedded menu is guest-only: since the web runs on <local>.jchat.cloud, the iframe jchat.cloud/m/<slug>?embed=1
 * is the SAME SITE as the app and the browser sends it the jchat.cloud session cookies. With a session the checkout
 * took the signed-in path: the order was created with the cookie's user_id (possibly ANOTHER account, e.g. the owner
 * in the dashboard), WITHOUT guest_tracking_code, so the framing app could not claim it (no room, no notification,
 * no tracking). In embed mode the framed menu therefore never reads the cookie session at all: the order is always a
 * guest order (guest-pay) and the framing app links it to ITS signed-in user (claim_embedded_order) with the tracking
 * code sent in `order_placed`. Outside embed mode nothing changes.
 *
 * Embed mode comes from `?embed=1` (see isEmbedSearch). The server decides it too: /m/[slug] reads its data without
 * the visitor's cookies when embedded (lib/supabase/server.ts createSupabaseAnonServerClient), and in the browser the
 * Supabase client of an embedded page holds no session (lib/supabase.ts), so there is nothing for a modified client to
 * pick up from the cookie.
 */

export type CheckoutPath = 'guest' | 'authenticated';

/** True for a query string that puts the menu in embed mode (exactly `embed=1`). */
export function isEmbedSearch(search: string | null | undefined): boolean {
  if (!search) return false;
  try {
    return new URLSearchParams(search).get('embed') === '1';
  } catch {
    return false;
  }
}

/**
 * The path for an order. `embed` always wins: an embedded menu ignores any session, so `hasSession` may be whatever
 * the (never consulted) cookie would say.
 */
export function decideCheckoutPath({ embed, hasSession }: { embed: boolean; hasSession: boolean }): CheckoutPath {
  if (embed) return 'guest';
  return hasSession ? 'authenticated' : 'guest';
}
