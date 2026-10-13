/**
 * JChat 3.0 — the venue menu on the web: a SHEET over the chat (feat/web-menu-sheet).
 *
 * Needs the saved session (e2e/.auth/web-session.json, git-ignored; `npm run web:session`): skipped without it.
 * Bar XZX at 390 px: tapping 🍴 opens the menu sheet (an iframe of …/m/<slug>?embed=1), no new tab opens, and the chat
 * stays mounted behind it; ✕ closes the sheet and the chat is as it was. Nothing is ordered or paid.
 *
 * E2E_MENU_BASE_URL (optional): the menu base URL the web build was exported with (EXPO_PUBLIC_MENU_BASE_URL, e.g. a
 * local `next dev` at http://127.0.0.1:3100/m). When it is set the spec also checks that the framed menu really renders.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const SESSION = path.resolve(__dirname, '..', '.auth', 'web-session.json');
const MENU_BASE = (process.env.E2E_MENU_BASE_URL ?? 'https://jchat.cloud/m').replace(/\/+$/, '');

test.skip(!existsSync(SESSION), 'no saved web session (run: npm run web:session)');
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-390x844', 'phone viewport only');
});
test.use({
  storageState: existsSync(SESSION) ? SESSION : undefined,
  locale: 'es-MX',
  geolocation: { latitude: 26.083048, longitude: -80.223725 },
  permissions: ['geolocation'],
});

test('🍴 opens the menu sheet over the chat (no new tab) and ✕ returns to the chat', async ({ page, context }) => {
  await page.goto('/?venue=bar-xzx-omd2', { waitUntil: 'load' });
  await page.getByText('Entrar al chat').first().click({ timeout: 30_000 });
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
  await page.getByText('Entrar al chat').first().click({ timeout: 30_000 });
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
  await page.getByText('Entrar al chat').first().click({ timeout: 30_000 });
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
