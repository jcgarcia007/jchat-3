/**
 * JChat 3.0 — /business/verify is ONE screen (fix/verify-review-only): verification in v1 = manual approval by an administrator.
 *   (1) status pending → "We received your business… an administrator will review it" + button to the dashboard
 *   (2) status verified → "Your business is already verified" + button to the dashboard
 *   (3) the old wizard never shows: no "Step", "Selfie", "Stripe Identity" or "Skip".
 * Runs against the simulated backend of dashboard.config.ts (web/fake-supabase.mjs): nothing reaches production, nothing is
 * written. Run: cd e2e && npx playwright test -c dashboard.config.ts
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

const PENDING = '00000000-0000-4000-8000-0000000000b2';
const VERIFIED = '00000000-0000-4000-8000-0000000000b1';

async function noOldWizard(page: import('@playwright/test').Page) {
  for (const word of [/\bstep\b/i, /selfie/i, /stripe identity/i, /skip/i, /testing/i]) {
    await expect(page.getByText(word), String(word)).toHaveCount(0);
  }
  await expect(page.getByRole('button', { name: /skip|submit|refresh status/i })).toHaveCount(0);
}

test('a pending business sees the "in review" screen', async ({ page, context }) => {
  await context.addCookies([sessionCookie()]);
  await page.goto(`/business/verify?id=${PENDING}`, { waitUntil: 'load' });
  await expect(page.getByText(/An administrator will review it within 24 hours/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Go to my dashboard' })).toBeVisible();
  await expect(page.getByText(/already verified/i)).toHaveCount(0);
  await noOldWizard(page);
});

test('a verified business sees "already verified"', async ({ page, context }) => {
  await context.addCookies([sessionCookie()]);
  await page.goto(`/business/verify?id=${VERIFIED}`, { waitUntil: 'load' });
  await expect(page.getByText('Your business is already verified')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Go to my dashboard' })).toBeVisible();
  await expect(page.getByText(/will review it/i)).toHaveCount(0);
  await noOldWizard(page);
});

test('the Spanish screen reads the same and has no old-wizard words either', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'es-MX', bypassCSP: true, baseURL: 'http://127.0.0.1:3102' });
  await context.addCookies([sessionCookie()]);
  const page = await context.newPage();
  await page.goto(`/business/verify?id=${PENDING}`, { waitUntil: 'load' });
  await expect(page.getByText(/Un administrador lo revisará en menos de 24 h/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Ir a mi dashboard' })).toBeVisible();
  for (const word of [/\bpaso\b/i, /selfie/i, /stripe identity/i, /skip/i]) await expect(page.getByText(word)).toHaveCount(0);
  await context.close();
});
