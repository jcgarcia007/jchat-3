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

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=oauth_failed`);
}
