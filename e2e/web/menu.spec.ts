/**
 * JChat 3.0 — the venue menu on the web: a SHEET over the chat (feat/web-menu-sheet).
 *
 * Needs the saved session (e2e/.auth/web-session.json, git-ignored; `npm run web:session`): skipped without it.
 * Desktop (1280 px): the menu is a sheet INSIDE the 480 px app column, like on the phone — no side panel, the column
 * does not move (fix/web-menu-sheet-column); the PROFILE keeps its right-hand panel.
 * Bar XZX at 390 px: tapping 🍴 opens the menu sheet (an iframe of …/m/<slug>?embed=1), no new tab opens, and the chat
 * stays mounted behind it; ✕ closes the sheet and the chat is as it was. Nothing is ordered or paid.
 *
 * E2E_MENU_BASE_URL (optional): the menu base URL the web build was exported with (EXPO_PUBLIC_MENU_BASE_URL, e.g. a
 * local `next dev` at http://127.0.0.1:3100/m). When it is set the spec also checks that the framed menu really renders.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { enterVenue } from './enter-venue';

const SESSION = path.resolve(__dirname, '..', '.auth', 'web-session.json');
const MENU_BASE = (process.env.E2E_MENU_BASE_URL ?? 'https://jchat.cloud/m').replace(/\/+$/, '');

test.skip(!existsSync(SESSION), 'no saved web session (run: npm run web:session)');
// Tests whose title starts with "[desktop]" run at 1280 px; every other test at 390 px.
test.beforeEach(({}, testInfo) => {
  const desktop = testInfo.title.startsWith('[desktop]');
  test.skip(testInfo.project.name !== (desktop ? 'desktop-1280x800' : 'mobile-390x844'), desktop ? 'desktop viewport only' : 'phone viewport only');
});
test.use({
  storageState: existsSync(SESSION) ? SESSION : undefined,
  locale: 'es-MX',
  geolocation: { latitude: 26.083048, longitude: -80.223725 },
  permissions: ['geolocation'],
});

test('🍴 opens the menu sheet over the chat (no new tab) and ✕ returns to the chat', async ({ page, context }) => {
  await page.goto('/?venue=bar-xzx-omd2', { waitUntil: 'load' });
  await enterVenue(page);
  await expect(page.getByTestId('chat-more-button')).toBeVisible({ timeout: 30_000 });

  const pagesBefore = context.pages().length;
  await page.getByRole('button', { name: /Abrir menú|Open menu/i }).first().click();

  const sheet = page.getByTestId('menu-sheet');
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  const frame = page.locator('iframe');
  await expect(frame).toHaveAttribute('src', new RegExp(`^${MENU_BASE.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/[^?]+\\?embed=1$`));
  await expect(frame).toHaveAttribute('allow', /payment/);
  expect(context.pages().length, 'no new tab').toBe(pagesBefore);

  // The chat is still mounted behind the sheet (its top bar is in the DOM).
  await expect(page.getByTestId('chat-more-button')).toBeAttached();

  if (process.env.E2E_MENU_BASE_URL) {
    // A local Next serves the menu: the framed page renders (a heading / prices), the error state never shows.
    const inner = page.frameLocator('iframe');
    await expect(inner.locator('body')).not.toBeEmpty({ timeout: 20_000 });
    await expect(page.getByTestId('menu-sheet-error')).toHaveCount(0);
  }

  await page.getByTestId('menu-sheet-close').click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('chat-more-button')).toBeVisible();
  await expect(page.getByPlaceholder('Mensaje…')).toBeVisible();
});

test('order_placed from the framed menu closes the sheet and shows "Pedido enviado"; a message from another origin is ignored', async ({ page }) => {
  test.skip(!process.env.E2E_MENU_BASE_URL, 'needs the menu served from E2E_MENU_BASE_URL (a local next dev)');
  await page.goto('/?venue=bar-xzx-omd2', { waitUntil: 'load' });
  await enterVenue(page);
  await expect(page.getByTestId('chat-more-button')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Abrir menú|Open menu/i }).first().click();
  await expect(page.getByTestId('menu-sheet')).toBeVisible({ timeout: 10_000 });
  await expect(page.frameLocator('iframe').locator('body')).not.toBeEmpty({ timeout: 20_000 });

  // 1. The same shape from the page's OWN origin (not the menu's): ignored, the sheet stays.
  await page.evaluate(() => window.postMessage({ type: 'jchat:menu', event: 'order_placed' }, '*'));
  await page.waitForTimeout(500);
  await expect(page.getByTestId('menu-sheet')).toBeVisible();

  // 2. From the framed menu (the allowed origin): the sheet closes and the chat says "Pedido enviado".
  const frame = page.frames().find((f) => f.url().startsWith(process.env.E2E_MENU_BASE_URL as string));
  expect(frame, 'the menu frame').toBeTruthy();
  await frame!.evaluate(() => window.parent.postMessage({ type: 'jchat:menu', event: 'order_placed' }, '*'));
  await expect(page.getByTestId('menu-sheet')).toHaveCount(0);
  await expect(page.getByTestId('menu-order-sent')).toBeVisible();
  await expect(page.getByTestId('menu-order-sent')).toContainText(/Pedido enviado/);
  await expect(page.getByTestId('chat-more-button')).toBeVisible();
});

test('the framed menu says "ready" and accepts a table context only from its parent with a valid shape (nothing is ordered)', async ({ page }) => {
  test.skip(!process.env.E2E_MENU_BASE_URL, 'needs the menu served from E2E_MENU_BASE_URL (a local next dev)');
  const MENU_ORIGIN = new URL(process.env.E2E_MENU_BASE_URL as string).origin;
  await page.addInitScript(() => {
    (window as unknown as { __menuMsgs: unknown[] }).__menuMsgs = [];
    window.addEventListener('message', (e) => (window as unknown as { __menuMsgs: unknown[] }).__menuMsgs.push({ origin: e.origin, data: e.data }));
  });
  await page.goto('/?venue=bar-xzx-omd2', { waitUntil: 'load' });
  await enterVenue(page);
  await expect(page.getByTestId('chat-more-button')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Abrir menú|Open menu/i }).first().click();
  await expect(page.frameLocator('iframe').locator('body')).not.toBeEmpty({ timeout: 25_000 });

  // 1. The menu announces itself to the parent: exactly {type, event}, from the menu's own origin.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __menuMsgs: { data: { event?: string } }[] }).__menuMsgs.some((m) => m.data?.event === 'ready'))).toBe(true);
  const ready = await page.evaluate(() => (window as unknown as { __menuMsgs: { origin: string; data: unknown }[] }).__menuMsgs.find((m) => (m.data as { event?: string })?.event === 'ready'));
  expect(ready).toEqual({ origin: MENU_ORIGIN, data: { type: 'jchat:menu', event: 'ready' } });

  const frame = page.frames().find((f) => f.url().startsWith(MENU_ORIGIN) && f.url().includes('/m/'))!;
  const stored = () => frame.evaluate(() => sessionStorage.getItem('jchat.tableContext'));
  const send = (data: unknown) => page.evaluate(([d, origin]) => document.querySelector('iframe')!.contentWindow!.postMessage(d, origin as string), [data, MENU_ORIGIN] as const);

  // 2. Malformed contexts are ignored (bad token, extra keys, other event).
  await send({ type: 'jchat:menu', event: 'context', table: { token: 'https://evil.example/x', label: 'T8' } });
  await send({ type: 'jchat:menu', event: 'context', table: { token: 'test-venue-table-1a2b3c4d', label: 'T8' }, extra: 1 });
  await send({ type: 'jchat:menu', event: 'order_placed' });
  await page.waitForTimeout(600);
  expect(await stored()).toBeNull();

  // 3. A valid one from the parent is kept (this frame's own sessionStorage), with a synthetic token — never a real one.
  await send({ type: 'jchat:menu', event: 'context', table: { token: 'test-venue-table-1a2b3c4d', label: 'T8' } });
  await expect.poll(stored).toContain('"tableLabel":"T8"');

  // 4. The token is in no URL: not the page's, not the frame's.
  expect(page.url()).not.toContain('table');
  expect(frame.url()).not.toContain('test-venue-table');
});

/** The 480 px app column (WebFrame): the first near-full-height element that is 480 px wide. */
async function appColumn(page: Page) {
  return page.evaluate(() => {
    const el = Array.from(document.querySelectorAll<HTMLElement>('#root div')).find((e) => {
      const r = e.getBoundingClientRect();
      return Math.abs(r.width - 480) <= 1 && r.height >= window.innerHeight * 0.9;
    });
    const r = el?.getBoundingClientRect();
    return r ? { left: Math.round(r.left), right: Math.round(r.right) } : null;
  });
}

async function enterChat(page: Page) {
  await page.goto('/?venue=bar-xzx-omd2', { waitUntil: 'load' });
  await enterVenue(page);
  await expect(page.getByTestId('chat-more-button')).toBeVisible({ timeout: 30_000 });
}

test('[desktop] 🍴 opens the menu as a sheet INSIDE the 480 px column: no side panel, the column does not move, ✕ closes', async ({ page }) => {
  await enterChat(page);
  const before = await appColumn(page);
  expect(before, 'the 480 px column exists').not.toBeNull();

  await page.getByRole('button', { name: /Abrir menú|Open menu/i }).first().click();
  await expect(page.getByTestId('menu-sheet')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('menu-panel')).toHaveCount(0); // no right-hand panel
  await page.waitForTimeout(500); // the sheet slides up

  // The sheet content and its ✕ are inside the column; the column itself did not move.
  const inside = async (testId: string) => {
    const box = await page.getByTestId(testId).boundingBox();
    expect(box, testId).not.toBeNull();
    expect(box!.x, `${testId} left edge`).toBeGreaterThanOrEqual(before!.left - 1);
    expect(box!.x + box!.width, `${testId} right edge`).toBeLessThanOrEqual(before!.right + 1);
  };
  await inside('menu-sheet-content');
  await inside('menu-sheet-close');
  expect(await appColumn(page)).toEqual(before);

  await page.getByTestId('menu-sheet-close').click();
  await expect(page.getByTestId('menu-sheet')).toHaveCount(0);
  await expect(page.getByTestId('chat-more-button')).toBeVisible();
  await expect(page.getByPlaceholder('Mensaje…')).toBeVisible();
  expect(await appColumn(page)).toEqual(before);
  await page.screenshot({ path: 'artifacts/web-menu-sheet-column/1280-after-close.png' });
});

test('[desktop] the profile still opens as the right-hand panel and shifts the column', async ({ page }) => {
  await enterChat(page);
  const before = await appColumn(page);
  await page.getByTestId('chat-more-button').click();
  await page.getByTestId('more-my-profile').click();
  await expect(page.getByTestId('profile-panel')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('profile-sheet')).toHaveCount(0);
  const shifted = await appColumn(page);
  expect(shifted!.left, 'the column moved left to make room for the panel').toBeLessThan(before!.left);
  await page.getByTestId('profile-sheet-close').click();
  await expect(page.getByTestId('profile-panel')).toHaveCount(0);
  expect(await appColumn(page)).toEqual(before);
});

// ── claim_embedded_order (the order placed in the framed menu is claimed for the signed-in user) ───────────────────
// The RPC is MOCKED (page.route): nothing is ordered, paid or written; the framed menu's order_placed is simulated.
const ORDER_ID = '0b4895d0-5dc5-4c7f-8303-52748d0fe823'; // synthetic
const TRACKING = 'AbCdEfGhIjKlMnOpQrStUv12'; // synthetic

async function openMenuAndFrame(page: Page) {
  await enterChat(page);
  const roomId = page.url().match(/room\/([0-9a-f-]{36})/i)?.[1]; // read before the sheet route replaces the URL
  await page.getByRole('button', { name: /Abrir menú|Open menu/i }).first().click();
  await expect(page.getByTestId('menu-sheet')).toBeVisible({ timeout: 10_000 });
  await expect(page.frameLocator('iframe').locator('body')).not.toBeEmpty({ timeout: 25_000 });
  const frame = page.frames().find((f) => f.url().startsWith(new URL(process.env.E2E_MENU_BASE_URL as string).origin) && f.url().includes('/m/'))!;
  return { frame, roomId, post: (data: unknown) => frame.evaluate((d) => window.parent.postMessage(d, '*'), data) };
}

test('order_placed with a tracking code claims the order (RPC params), closes the sheet and opens the tracking screen', async ({ page }) => {
  test.skip(!process.env.E2E_MENU_BASE_URL, 'needs the menu served from E2E_MENU_BASE_URL (a local next dev)');
  const calls: unknown[] = [];
  await page.route('**/rest/v1/rpc/claim_embedded_order', async (route) => {
    calls.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ order_id: ORDER_ID, order_number: 188, status: 'confirmed', business_id: '00000000-0000-4000-8000-000000000001' }]) });
  });
  const { post, roomId } = await openMenuAndFrame(page);
  expect(roomId, 'the active room is in the chat URL').toBeTruthy();

  await post({ type: 'jchat:menu', event: 'order_placed', orderId: ORDER_ID, trackingCode: TRACKING });
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toEqual({ p_order_id: ORDER_ID, p_tracking_code: TRACKING, p_room_id: roomId });

  await expect(page.getByTestId('menu-sheet')).toHaveCount(0); // the sheet's route was replaced by the tracking screen
  await expect(page.getByTestId('menu-sheet-claim-failed')).toHaveCount(0);
  expect(page.url(), 'the tracking code is never in the URL').not.toContain(TRACKING);
  expect(page.url()).toMatch(/OrderTracking/i);
});

test('order_placed with only the tracking code (a real card payment: the menu does not know the id) sends p_order_id null and is not retried on invalid_claim', async ({ page }) => {
  test.skip(!process.env.E2E_MENU_BASE_URL, 'needs the menu served from E2E_MENU_BASE_URL (a local next dev)');
  const calls: unknown[] = [];
  await page.route('**/rest/v1/rpc/claim_embedded_order', async (route) => {
    calls.push(route.request().postDataJSON());
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '22023', message: 'invalid_claim', details: null, hint: null }) });
  });
  const { post, roomId } = await openMenuAndFrame(page);
  await post({ type: 'jchat:menu', event: 'order_placed', trackingCode: TRACKING });
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0]).toEqual({ p_order_id: null, p_tracking_code: TRACKING, p_room_id: roomId });
  // invalid_claim is final: the sheet stays open with the "could not link" notice.
  await expect(page.getByTestId('menu-sheet-claim-failed')).toBeVisible({ timeout: 10_000 });
});

test('a claim refused for good (invalid_claim) is not retried: the sheet stays open with the notice', async ({ page }) => {
  test.skip(!process.env.E2E_MENU_BASE_URL, 'needs the menu served from E2E_MENU_BASE_URL (a local next dev)');
  let calls = 0;
  await page.route('**/rest/v1/rpc/claim_embedded_order', async (route) => {
    calls += 1;
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '22023', message: 'invalid_claim', details: null, hint: null }) });
  });
  const { post } = await openMenuAndFrame(page);
  await post({ type: 'jchat:menu', event: 'order_placed', orderId: ORDER_ID, trackingCode: TRACKING });
  await expect(page.getByTestId('menu-sheet-claim-failed')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('menu-sheet-claim-failed')).toContainText(/No pudimos vincular tu pedido/);
  await expect(page.getByTestId('menu-sheet')).toBeVisible(); // still open, on the menu's own tracking page
  await page.waitForTimeout(2500); // a retry would have come by now
  expect(calls).toBe(1);
  expect(page.url()).not.toMatch(/OrderTracking/i);
});

test('card payment: the first attempt is refused (the webhook has not created the order yet), the retry links it', async ({ page }) => {
  test.skip(!process.env.E2E_MENU_BASE_URL, 'needs the menu served from E2E_MENU_BASE_URL (a local next dev)');
  const calls: unknown[] = [];
  await page.route('**/rest/v1/rpc/claim_embedded_order', async (route) => {
    calls.push(route.request().postDataJSON());
    if (calls.length === 1) {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'claim_not_allowed', details: null, hint: null }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ order_id: ORDER_ID, order_number: 188, status: 'confirmed', business_id: '00000000-0000-4000-8000-000000000001' }]) });
    }
  });
  const { post, roomId } = await openMenuAndFrame(page);
  await post({ type: 'jchat:menu', event: 'order_placed', trackingCode: TRACKING }); // a card payment: no order id
  await expect(page.getByTestId('menu-sheet-claiming')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId('menu-sheet-claiming')).toContainText(/Vinculando tu pedido/);
  await expect.poll(() => calls.length, { timeout: 10_000 }).toBe(2); // 2 s later
  expect(calls[0]).toEqual({ p_order_id: null, p_tracking_code: TRACKING, p_room_id: roomId });
  expect(calls[1]).toEqual(calls[0]);
  await expect(page.getByTestId('menu-sheet')).toHaveCount(0);
  await expect(page.getByTestId('menu-sheet-claim-failed')).toHaveCount(0);
  expect(page.url()).toMatch(/OrderTracking/i);
  expect(page.url()).not.toContain(TRACKING);
});

test('retries are bounded: still refused after 10 retries (~20 s) → the "could not link" notice', async ({ page }) => {
  test.skip(!process.env.E2E_MENU_BASE_URL, 'needs the menu served from E2E_MENU_BASE_URL (a local next dev)');
  test.setTimeout(60_000);
  let calls = 0;
  await page.route('**/rest/v1/rpc/claim_embedded_order', async (route) => {
    calls += 1;
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'claim_not_allowed', details: null, hint: null }) });
  });
  const { post } = await openMenuAndFrame(page);
  await post({ type: 'jchat:menu', event: 'order_placed', trackingCode: TRACKING });
  await expect(page.getByTestId('menu-sheet-claiming')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId('menu-sheet-claim-failed')).toBeVisible({ timeout: 35_000 });
  await expect(page.getByTestId('menu-sheet-claiming')).toHaveCount(0);
  expect(calls).toBe(11); // the first attempt + 10 retries
  await expect(page.getByTestId('menu-sheet')).toBeVisible();
});

test('order_placed without a tracking code (a tab order) closes as before and does not call the RPC', async ({ page }) => {
  test.skip(!process.env.E2E_MENU_BASE_URL, 'needs the menu served from E2E_MENU_BASE_URL (a local next dev)');
  let calls = 0;
  await page.route('**/rest/v1/rpc/claim_embedded_order', async (route) => {
    calls += 1;
    await route.abort();
  });
  const { post } = await openMenuAndFrame(page);
  await post({ type: 'jchat:menu', event: 'order_placed' });
  await expect(page.getByTestId('menu-sheet')).toHaveCount(0);
  await expect(page.getByTestId('menu-order-sent')).toBeVisible();
  expect(calls).toBe(0);
});

test('order_placed from another origin does not claim anything', async ({ page }) => {
  test.skip(!process.env.E2E_MENU_BASE_URL, 'needs the menu served from E2E_MENU_BASE_URL (a local next dev)');
  let calls = 0;
  await page.route('**/rest/v1/rpc/claim_embedded_order', async (route) => {
    calls += 1;
    await route.abort();
  });
  await openMenuAndFrame(page);
  // Posted from the app's OWN origin (not the menu's): ignored.
  await page.evaluate(([id, code]) => window.postMessage({ type: 'jchat:menu', event: 'order_placed', orderId: id, trackingCode: code }, '*'), [ORDER_ID, TRACKING]);
  await page.waitForTimeout(800);
  await expect(page.getByTestId('menu-sheet')).toBeVisible();
  expect(calls).toBe(0);
});
