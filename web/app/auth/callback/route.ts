/**
 * JChat 3.0 — OAuth callback handler
 * Completes the PKCE flow for OAuth sign-in (e.g. Google): exchanges the
 * `?code` for a session, persists it via cookies, then redirects to `next`
 * (defaults to /dashboard). On failure, bounces back to /auth/login.
 *
 * GET /auth/callback?code=...&next=/dashboard
 */

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isSafeRedirectPath } from '@/lib/redirect';
import { confirmAgeUrl, isAgeConfirmed } from '@/lib/age';

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Validate ?next= as a safe internal path (rejects //evil.com, schemes) — open-redirect (W2).
  const rawNext = searchParams.get('next');
  const next = isSafeRedirectPath(rawNext) ? rawNext : '/dashboard';

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // 18+ gate: OAuth (Google/Apple) and email-confirmation links land here.
      const { data: { user } } = await supabase.auth.getUser();
      if (user && !(await isAgeConfirmed(supabase, user.id))) {
        return NextResponse.redirect(`${origin}${confirmAgeUrl(next)}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=oauth_failed`);
}
