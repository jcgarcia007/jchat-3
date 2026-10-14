/**
 * JChat 3.0 — the framed menu (/m/<slug>?embed=1) orders as a GUEST whatever session cookie the browser holds
 * (fix/web-menu-embed-guest-checkout). Against a LOCAL Next (default http://127.0.0.1:3100; WEB_NEXT=1 starts it).
 *
 * Since the web runs on <local>.jchat.cloud the iframe is same-site with the app and receives the session cookies.
 * Here a synthetic Supabase session cookie (fake JWT, fake user, `auth/v1/user` mocked) is set for the Next origin and
 * the checkout is driven up to the payment call. NOTHING is paid: guest-pay / payments are mocked and the Stripe
 * Payment Element is never mounted.
 *
 *   embed + session cookie  → guest-pay is called, payments is NOT, the cookie's account is never asked
 *                             (no auth/v1/user), and no request carries the cookie's token;
 *   no embed + session      → payments (signed-in path) is called, guest-pay is NOT (behaviour unchanged).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type Request } from '@playwright/test';

const NEXT_BASE = (process.env.E2E_NEXT_BASE ?? 'http://127.0.0.1:3100').replace(/\/+$/, '');
const SLUG = process.env.E2E_MENU_SLUG ?? 'bar-xzx-omd2';

// Supabase project ref → the cookie name @supabase/ssr reads (sb-<ref>-auth-token).
const envFile = readFileSync(path.resolve(__dirname, '..', '..', 'web', '.env.local'), 'utf8');
const SUPABASE_URL = /^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m.exec(envFile)?.[1]?.trim() ?? '';
const REF = new URL(SUPABASE_URL).hostname.split('.')[0];

const b64url = (v: unknown) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const FAKE_USER_ID = '00000000-0000-4000-8000-0000000000c1'; // synthetic: another account than any guest
const EXP = Math.floor(Date.now() / 1000) + 24 * 3600;
const FAKE_TOKEN = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: FAKE_USER_ID, role: 'authenticated', aud: 'authenticated', exp: EXP })}.${b64url('sig')}`;
const FAKE_SESSION = {
  access_token: FAKE_TOKEN,
  token_type: 'bearer',
  expires_in: 86400,
  expires_at: EXP,
  refresh_token: 'synthetic-refresh-token',
  user: { id: FAKE_USER_ID, aud: 'authenticated', role: 'authenticated', email: 'otra-cuenta@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
};

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-390x844', 'phone viewport only');
});
test.use({
  locale: 'es-MX',
  geolocation: { latitude: 26.083048, longitude: -80.223725 },
  permissions: ['geolocation'],
});

interface Seen {
  guestPay: number;
  payments: number;
  authUser: number;
  guestPayAuthHeader: string | null;
  tokenLeaks: string[];
}

/** The synthetic Supabase session cookie of ANOTHER account, for the Next origin. */
const setSessionCookie = (page: Page) =>
  page.context().addCookies([{ name: `sb-${REF}-auth-token`, value: `base64-${b64url(FAKE_SESSION)}`, url: NEXT_BASE }]);

/** Mocks everything that would charge or create anything. */
async function arm(page: Page): Promise<Seen> {
  const seen: Seen = { guestPay: 0, payments: 0, authUser: 0, guestPayAuthHeader: null, tokenLeaks: [] };
  page.on('request', (req: Request) => {
    const url = req.url();
    if (!url.startsWith(SUPABASE_URL)) return;
    if ((req.headers()['authorization'] ?? '').includes(FAKE_TOKEN)) seen.tokenLeaks.push(url.replace(SUPABASE_URL, ''));
  });
  // hCaptcha: a fake widget that answers instantly (no network, no challenge).
  await page.route(/https:\/\/js\.hcaptcha\.com\/1\/api\.js/, async (route) => {
    const onload = new URL(route.request().url()).searchParams.get('onload');
    const script = `window.hcaptcha={render:function(){return 'w1'},execute:function(){return Promise.resolve({response:'test-captcha-token',key:'k'})},reset:function(){},remove:function(){},getResponse:function(){return 'test-captcha-token'},getRespKey:function(){return 'k'},setData:function(){},close:function(){}};${onload ? `if(window['${onload}'])window['${onload}']();` : ''}`;
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: script });
  });
  await page.route('**/auth/v1/user', async (route) => {
    seen.authUser += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_SESSION.user) });
  });
  await page.route('**/functions/v1/guest-pay', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    seen.guestPay += 1;
    seen.guestPayAuthHeader = route.request().headers()['authorization'] ?? null;
    // Stops right before paying: the call is what is under test.
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'test_stop_before_payment' }) });
  });
  await page.route('**/functions/v1/payments', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    seen.payments += 1;
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'test_stop_before_payment' }) });
  });
  return seen;
}

/** Adds the first item, opens the cart and walks to the checkout step (the payment call is mocked). */
async function goToCheckout(page: Page, url: string, beforeCheckout?: () => Promise<unknown>) {
  await page.goto(url, { waitUntil: 'load' });
  // The SSR HTML is clickable before hydration, and an early click is lost: retry until the cart shows the item.
  await expect(async () => {
    await page.getByRole('button', { name: /^Agregar (?!a favoritos)/i }).first().click({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /Carrito\s*·\s*1/ })).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  await beforeCheckout?.();
  await page.getByRole('button', { name: /Carrito/ }).first().click();
  await page.getByRole('button', { name: /^Continuar/i }).first().click();
  await page.getByRole('button', { name: /En la barra/ }).first().click(); // pick-up at the bar (no table)
  await page.getByRole('button', { name: /Ir a pagar/ }).first().click();
}

test('embedded + a session cookie of ANOTHER account → guest-pay, never the signed-in path, cookie never read', async ({ page }) => {
  const seen = await arm(page);
  await setSessionCookie(page); // the iframe is same-site with the app: the cookie arrives with the very first request
  await goToCheckout(page, `${NEXT_BASE}/m/${SLUG}?embed=1`);
  await expect.poll(() => seen.guestPay, { timeout: 30_000 }).toBeGreaterThan(0);
  await page.screenshot({ path: 'artifacts/web-embed-guest/embed-with-cookie-checkout.png' });
  expect(seen.payments, 'the signed-in payments EF is never called in embed mode').toBe(0);
  expect(seen.authUser, 'the cookie account is never asked for (no auth/v1/user)').toBe(0);
  expect(seen.tokenLeaks, 'no Supabase request carries the cookie token').toEqual([]);
  expect(seen.guestPayAuthHeader ?? '', 'guest-pay is called with the anon key, not the cookie token').not.toContain(FAKE_TOKEN);
});

test('NOT embedded + a session cookie → the signed-in path (payments), unchanged', async ({ page }) => {
  const seen = await arm(page);
  // The synthetic token is not a real session, so the SERVER render (which forwards the cookie to the API) would be
  // refused with it. The page is therefore loaded first and the cookie is set once it is interactive: the browser client
  // re-reads the cookie on every auth call, which is what the checkout does.
  await goToCheckout(page, `${NEXT_BASE}/m/${SLUG}`, () => setSessionCookie(page));
  await expect.poll(() => seen.payments, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(seen.guestPay, 'no guest-pay when there is a session and the menu is not embedded').toBe(0);
  expect(seen.authUser).toBeGreaterThan(0);
});
