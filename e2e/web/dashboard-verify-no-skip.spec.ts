/**
 * JChat 3.0 — /business/verify has no "Skip for now (Testing)" button (fix/verify-no-test-skip).
 *
 * It used to show a dashed button on both steps that let an owner go on without Stripe Identity or the code + selfie review.
 * Runs against the simulated backend of dashboard.config.ts (web/fake-supabase.mjs): nothing reaches production, nothing is
 * written. Step 1 is the screen an owner lands on; step 2 is covered by the source-level guard
 * (web/scripts/verify-no-test-skip.test.mjs), because reaching it needs a server-confirmed identity approval.
 * Run: cd e2e && npx playwright test -c dashboard.config.ts
 */
import { expect, test } from '@playwright/test';

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function sessionCookie() {
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600;
  const user = { id: '00000000-0000-4000-8000-0000000000a1', aud: 'authenticated', role: 'authenticated', email: 'owner@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  const jwt = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: user.id, role: 'authenticated', aud: 'authenticated', exp })}.${b64url('signature')}`;
  const session = { access_token: jwt, refresh_token: 'synthetic-refresh', expires_in: 86400, expires_at: exp, token_type: 'bearer', user };
  return { name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: 'http://127.0.0.1:3102' };
}

test.use({ locale: 'en-US', bypassCSP: true });

test('step 1 of the owner verification offers no way to skip it', async ({ page, context }) => {
  await context.addCookies([sessionCookie()]);
  await page.goto('/business/verify?id=00000000-0000-4000-8000-0000000000b1', { waitUntil: 'load' });

  await expect(page.getByRole('heading', { name: /Step 1/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: /refresh status/i })).toBeVisible();

  await expect(page.getByText(/skip/i)).toHaveCount(0);
  await expect(page.getByText(/testing/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /skip/i })).toHaveCount(0);
});
