/**
 * JChat 3.0 — entering a venue by link (QR) on the web build: hermetic (local/hermetic.ts), nothing leaves 127.0.0.1.
 *
 * The forms (decided in Fase 2) that make sense on localhost, where the venue comes from `?venue=` (the *.jchat.cloud subdomain
 * itself is covered by the pure parser tests, mobile/scripts/entry-url.test.mjs, because a test cannot own that DNS name):
 *   /?venue=<venue>              → resolve_venue_entry { p_venue }
 *   /<mesa>-<código>?venue=…     → resolve_venue_entry { p_venue, p_label, p_code }
 *   /c/<token>?venue=…           → resolve_venue_entry { p_token, p_venue }
 *   /t/<token>?venue=…           → resolve_table_qr { p_token } then resolve_venue_entry { p_venue }
 * Then the same link opened WITHOUT a session: it is saved (jchat.pendingEntry.v1), the person signs in (a synthetic account answered by
 * the harness), and the venue must open — also when the sign-in is followed by the age confirmation or the onboarding.
 *
 * Run: cd e2e && npx playwright test -c local.config.ts local/entry-flows.spec.ts
 */
import { expect, test, type Page } from '@playwright/test';
import { baseOptions, ENTRY_ROW, enterChat, ME } from './fixtures';
import { hermetic, ROOM_ID, signInSynthetic, VENUE, type Hermetic, type HermeticOptions } from './hermetic';

test.use({ locale: 'es-MX' });

const PENDING_KEY = 'jchat.pendingEntry.v1';
const TOKEN = 'tokenDePrueba123';

async function grantPosition(page: Page) {
  await page.addInitScript(() => {
    const position = { coords: { latitude: 26.083048, longitude: -80.223725, accuracy: 10 }, timestamp: Date.now() };
    navigator.geolocation.getCurrentPosition = (ok) => ok(position as GeolocationPosition);
  });
}

/** In the venue's room: the route, the entry gate ("Entrar") and, once tapped, the room's own header. */
async function inTheRoom(page: Page) {
  await expect(page).toHaveURL(new RegExp(`/room/${ROOM_ID}`), { timeout: 30_000 });
  await enterChat(page);
  await expect(page.getByText('Bar Sintético').locator('visible=true').first()).toBeVisible({ timeout: 30_000 });
}
const calls = (h: Hermetic, name: string) => h.rpcCalls.filter((c) => c.name === name).map((c) => c.body);
/** The app asks the server for the same entry more than once (preview + bridge + chat): what matters is that EVERY ask is the right one. */
const everyCall = (h: Hermetic, name: string, expected: Record<string, unknown>) => {
  const list = calls(h, name);
  expect(list.length, `${name} was asked`).toBeGreaterThanOrEqual(1);
  for (const body of list) expect(body).toEqual(expected);
};

async function openSignedIn(page: Page, path: string, extra: HermeticOptions = {}) {
  const h = await hermetic(page, baseOptions(extra));
  await signInSynthetic(page);
  await grantPosition(page);
  await page.goto(path, { waitUntil: 'load' });
  return h;
}

/** Welcome → Log in → email → sign in as the synthetic account. */
async function signInThroughTheForm(page: Page) {
  await page.getByRole('button', { name: /Iniciar sesión|Log in/ }).click();
  await page.getByRole('button', { name: /Continuar con email|Continue with email/ }).click();
  await page.locator('input[type="email"]').fill('sintetico@example.test');
  await page.locator('input[type="password"]').fill('contrasena-sintetica');
  await page.getByRole('button', { name: /^(Entrar|Iniciar sesión|Sign in)$/ }).click();
}

test.describe('signed in: each link form asks the server for the right thing and opens the venue', () => {
  test('/?venue=<venue>', async ({ page }) => {
    const h = await openSignedIn(page, `/?venue=${VENUE}`);
    await inTheRoom(page);
    everyCall(h, 'resolve_venue_entry', { p_venue: VENUE });
    expect(h.forbidden()).toEqual([]);
    expect(h.blocked).toEqual([]);
  });

  test('/<mesa>-<código>?venue=<venue>: the table label and code travel to the server', async ({ page }) => {
    const h = await openSignedIn(page, `/5-k3f9?venue=${VENUE}`, { rpcs: { resolve_venue_entry: [{ ...ENTRY_ROW, table_label: '5' }] } });
    await inTheRoom(page);
    everyCall(h, 'resolve_venue_entry', { p_venue: VENUE, p_label: '5', p_code: 'k3f9' });
  });

  test('/c/<token>?venue=<venue>: the room QR token', async ({ page }) => {
    const h = await openSignedIn(page, `/c/${TOKEN}?venue=${VENUE}`);
    await inTheRoom(page);
    everyCall(h, 'resolve_venue_entry', { p_token: TOKEN, p_venue: VENUE });
  });

  test('/t/<token>?venue=<venue>: the table QR token goes through resolve_table_qr first', async ({ page }) => {
    const h = await openSignedIn(page, `/t/${TOKEN}?venue=${VENUE}`, {
      rpcs: { resolve_table_qr: [{ business_slug: VENUE, table_label: 'T4' }], resolve_venue_entry: [{ ...ENTRY_ROW, table_label: null }] },
    });
    await inTheRoom(page);
    everyCall(h, 'resolve_table_qr', { p_token: TOKEN });
    everyCall(h, 'resolve_venue_entry', { p_venue: VENUE });
  });

  test('a table QR whose code the server rejects is "not recognized": nobody is let in', async ({ page }) => {
    await openSignedIn(page, `/8-zzzz?venue=${VENUE}`, { rpcs: { resolve_venue_entry: [] } });
    await expect(page.getByText(/QR/i).first()).toBeVisible({ timeout: 20_000 });
    expect(page.url()).not.toContain('/room/');
  });

  test('a reserved subdomain (?venue=www) is not an entry: no resolve call, no room', async ({ page }) => {
    const h = await openSignedIn(page, '/?venue=www');
    await page.waitForTimeout(3000);
    expect(calls(h, 'resolve_venue_entry')).toEqual([]);
    expect(page.url()).not.toContain('/room/');
  });
});

test.describe('opened WITHOUT a session, then signing in', () => {
  async function anonymous(page: Page, extra: HermeticOptions = {}) {
    const h = await hermetic(page, baseOptions(extra));
    await grantPosition(page);
    await page.goto(`/?venue=${VENUE}`, { waitUntil: 'load' });
    // The link is saved before anybody is signed in, and the address bar is cleaned.
    await expect(page.getByTestId('entry-card')).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate((k) => window.localStorage.getItem(k), PENDING_KEY)).not.toBeNull();
    expect(new URL(page.url()).search).toBe('');
    return h;
  }

  test('sign in → the venue opens (the saved link is used once and then cleared)', async ({ page }) => {
    const h = await anonymous(page);
    await signInThroughTheForm(page);
    await inTheRoom(page);
    expect(await page.evaluate((k) => window.localStorage.getItem(k), PENDING_KEY)).toBeNull();
    expect(calls(h, 'resolve_venue_entry').length).toBeGreaterThanOrEqual(1);
    expect(h.forbidden()).toEqual([]);
  });

  test('a new account: onboarding first (the saved link survives it), then the venue opens', async ({ page }) => {
    let onboarded = false;
    await anonymous(page, {
      tables: { users: () => [{ ...ME, onboarding_completed: onboarded }] },
      onWrite: (method, table) => { if (table === 'users' && method === 'PATCH') onboarded = true; },
    });
    await signInThroughTheForm(page);
    await expect(page).toHaveURL(/Onboarding/, { timeout: 20_000 });
    expect(await page.evaluate((k) => window.localStorage.getItem(k), PENDING_KEY)).not.toBeNull();
    await page.getByRole('button', { name: /Omitir/ }).click();
    await inTheRoom(page);
  });

  test('the age confirmation sits between sign-in and the venue: after confirming, the venue opens', async ({ page }) => {
    let confirmed = false;
    await anonymous(page, {
      tables: { users: () => [{ ...ME, age_confirmed_at: confirmed ? '2026-01-01T00:00:00Z' : null }] },
      rpcs: { confirm_age: () => { confirmed = true; return { ok: true, status: 'confirmed' }; } },
    });
    await signInThroughTheForm(page);
    await expect(page).toHaveURL(/ConfirmAge/, { timeout: 20_000 });
    expect(await page.evaluate((k) => window.localStorage.getItem(k), PENDING_KEY)).not.toBeNull();
    await page.getByPlaceholder('DD').fill('15');
    await page.getByPlaceholder('MM').fill('06');
    await page.getByPlaceholder('AAAA').fill('1990');
    await page.getByRole('checkbox').first().click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: 'Sí, continuar' }).click();
    await inTheRoom(page);
  });
});

test('a link older than 2 hours is dropped: it must not hijack a later session', async ({ page }) => {
  const h = await hermetic(page, baseOptions());
  await signInSynthetic(page);
  await grantPosition(page);
  await page.addInitScript(([key, venue]) => {
    const old = Date.now() - 3 * 60 * 60 * 1000;
    window.localStorage.setItem(key, JSON.stringify({ target: { kind: 'venue', venue }, savedAt: old }));
  }, [PENDING_KEY, VENUE] as const);
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  expect(calls(h, 'resolve_venue_entry')).toEqual([]);
  expect(page.url()).not.toContain('/room/');
  expect(await page.evaluate((k) => window.localStorage.getItem(k), PENDING_KEY)).toBeNull();
});

/**
 * The saved link lives in THIS browser's localStorage, but the e-mail confirmation (and the sign-in after it) can happen in another
 * browser: the Mail app's, an in-app browser, another profile. Fixed (fix/overnight-findings): the sign-up stores the pending entry in the
 * account (user_metadata.pending_entry + the scan time) and the first session, wherever it is, adopts it and clears it. A fresh browser
 * context has no localStorage of the first one, exactly like the other browser; the synthetic session carries what the sign-up stored.
 */
test('the e-mail confirmed and the sign-in done in ANOTHER browser still lands in the venue (the entry travels in the account)', async ({ browser }) => {
  const second = await browser.newContext({ locale: 'es-MX' });
  const b = await second.newPage();
  const hb = await hermetic(b, baseOptions());
  await signInSynthetic(b, { pending_entry: { target: { kind: 'venue', venue: VENUE }, savedAt: Date.now() - 5 * 60 * 1000 } });
  await grantPosition(b);
  await b.goto('/', { waitUntil: 'load' });
  await inTheRoom(b);
  expect(calls(hb, 'resolve_venue_entry').length).toBeGreaterThanOrEqual(1);
  // the account is cleaned: the entry is not adopted twice
  await expect.poll(() => hb.userUpdates.some((u) => JSON.stringify(u.data) === JSON.stringify({ pending_entry: null }))).toBe(true);
  await second.close();
});

test('an entry older than 2 h in the account is NOT adopted (still cleaned): it must not hijack a later session', async ({ browser }) => {
  const second = await browser.newContext({ locale: 'es-MX' });
  const b = await second.newPage();
  const hb = await hermetic(b, baseOptions());
  await signInSynthetic(b, { pending_entry: { target: { kind: 'venue', venue: VENUE }, savedAt: Date.now() - 3 * 60 * 60 * 1000 } });
  await grantPosition(b);
  await b.goto('/', { waitUntil: 'load' });
  await b.waitForTimeout(4000);
  expect(calls(hb, 'resolve_venue_entry')).toEqual([]);
  expect(b.url()).not.toContain('/room/');
  await expect.poll(() => hb.userUpdates.length).toBeGreaterThanOrEqual(1);
  await second.close();
});
