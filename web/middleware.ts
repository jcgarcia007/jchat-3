/**
 * JChat 3.0 — Web auth middleware
 * Refreshes the Supabase auth session on every request so Server Components
 * (e.g. the dashboard auth gate) always see a valid, non-expired session.
 * Follows the @supabase/ssr App Router pattern. Does NOT gate routes itself —
 * route protection lives in the relevant layout (dashboard/layout.tsx).
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { LANG_COOKIE, LANG_COOKIE_MAX_AGE, parseLangParam } from './lib/langParam';

export async function middleware(request: NextRequest) {
  // `?lang=es|en` sets the language cookie. It is also written on the request so that this very
  // render (i18n/request.ts reads the cookie) is already served in that language.
  const langParam = parseLangParam(request.nextUrl.searchParams.get('lang'));
  if (langParam) request.cookies.set(LANG_COOKIE, langParam);
  const withLang = (res: NextResponse) => {
    if (langParam) {
      res.cookies.set(LANG_COOKIE, langParam, { path: '/', maxAge: LANG_COOKIE_MAX_AGE, sameSite: 'lax' });
    }
    return res;
  };

  let response = withLang(NextResponse.next({ request }));

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
        response = withLang(NextResponse.next({ request }));
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
