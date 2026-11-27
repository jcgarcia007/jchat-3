/**
 * JChat 3.0 — Web auth middleware
 * Refreshes the Supabase auth session on every request so Server Components
 * (e.g. the dashboard auth gate) always see a valid, non-expired session.
 * Follows the @supabase/ssr App Router pattern. Does NOT gate routes itself —
 * route protection lives in the relevant layout (dashboard/layout.tsx).
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { buildStrictCsp, generateNonce, isEmbeddablePath, STRICT_CSP_REPORT_ONLY_ENABLED } from './lib/csp';
import { frameAncestorsForEmbed } from './lib/embedOrigins';
import { LANG_COOKIE, LANG_COOKIE_MAX_AGE, parseLangParam } from './lib/langParam';

// Strict, nonce-based CSP in REPORT-ONLY mode (Lote 3). The policy that is enforced is next.config.ts `buildCsp`, untouched.
const STRICT_CSP_HEADER = 'Content-Security-Policy-Report-Only';

export async function middleware(request: NextRequest) {
  // `?lang=es|en` sets the language cookie. It is also written on the request so that this very
  // render (i18n/request.ts reads the cookie) is already served in that language.
  const langParam = parseLangParam(request.nextUrl.searchParams.get('lang'));
  if (langParam) request.cookies.set(LANG_COOKIE, langParam);

  // One nonce per request. The policy goes on the REQUEST (Next reads the nonce from `content-security-policy[-report-only]`
  // and puts it on its own <script>s) and on the RESPONSE (what the browser evaluates). `x-nonce` lets server components read it.
  // Off by default (see STRICT_CSP_REPORT_ONLY_ENABLED in lib/csp.ts): then none of this exists and the middleware is the one of cbcdc1b6.
  const nonce = STRICT_CSP_REPORT_ONLY_ENABLED ? generateNonce() : null;
  const isProduction = process.env.NODE_ENV === 'production';
  const strictCsp =
    nonce === null
      ? null
      : buildStrictCsp({
          nonce,
          frameAncestors: isEmbeddablePath(request.nextUrl.pathname) ? frameAncestorsForEmbed(isProduction) : "'none'",
          isDev: process.env.NODE_ENV === 'development',
        });

  // Request headers are copied at call time: `request.cookies.set` (here and in `setAll`) rewrites the `cookie` header.
  const nextWithCsp = () => {
    if (nonce === null || strictCsp === null) return NextResponse.next({ request });
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set(STRICT_CSP_HEADER, strictCsp);
    // REQUEST only: on Vercel Next did not put the nonce on its own <script>s when only the -report-only request header was present
    // (the JSON-LD, read from x-nonce, did get it). `content-security-policy` is the header Next's docs use for this. The RESPONSE keeps
    // the enforced policy from next.config.ts: this middleware must never write `Content-Security-Policy` on it (a test pins that).
    requestHeaders.set('Content-Security-Policy', strictCsp);
    return NextResponse.next({ request: { headers: requestHeaders } });
  };

  const withLang = (res: NextResponse) => {
    if (strictCsp !== null) res.headers.set(STRICT_CSP_HEADER, strictCsp);
    if (langParam) {
      res.cookies.set(LANG_COOKIE, langParam, { path: '/', maxAge: LANG_COOKIE_MAX_AGE, sameSite: 'lax' });
    }
    return res;
  };

  let response = withLang(nextWithCsp());

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Unconfigured (no backend env): skip session handling entirely.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = withLang(nextWithCsp());
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Touch the session to trigger a token refresh when needed.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Run on all paths except static assets, image files and /.well-known/.
  matcher: [
    // `.well-known/` (AASA / assetlinks) must answer 200 straight from public/ with no session work.
    '/((?!_next/static|_next/image|favicon.ico|\\.well-known/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
