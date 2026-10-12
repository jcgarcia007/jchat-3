/**
 * JChat 3.0 — venue entry (QR) on the web build, anonymous.
 *
 * The REAL anonymous RPC resolve_venue_entry is called (read-only, public data). No login, no users created:
 * only the Welcome screen is checked. `?venue=` works because the build is served from localhost (a host
 * that is not *.jchat.cloud), which is what the web testing aid allows.
 *   /?venue=bar-xzx-omd2            → card "Vas a entrar a Bar XZX", address bar cleaned
 *   /8-zzzz?venue=bar-xzx-omd2      → "No reconocimos este QR" (wrong table code; the code is not a real one)
 *   /?venue=www                     → reserved subdomain: plain Welcome, no card
 */

import { expect, test } from '@playwright/test';

test.use({ locale: 'es-MX' });
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-390x844', 'phone viewport only');
});

const VENUE = 'bar-xzx-omd2';

async function waitForWelcome(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => (document.getElementById('root')?.innerText ?? '').trim().length > 0, undefined, {
    timeout: 30_000,
  });
}

test('?venue= shows the venue card on Welcome and cleans the address bar', async ({ page }, testInfo) => {
  await page.goto(`/?venue=${VENUE}`, { waitUntil: 'load' });
  await waitForWelcome(page);

  const card = page.getByTestId('entry-card');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText(/Vas a entrar a/i);
  await expect(card).toContainText(/Bar XZX/i);
  await expect(card).toContainText(/Inicia sesión o crea tu cuenta para entrar al chat/i);

  // The entry is gone from the address bar (React Navigation then writes its own route, e.g. /Welcome).
  const url = new URL(page.url());
  expect(url.search).toBe('');
  expect(url.pathname).not.toContain(VENUE);

  await page.screenshot({ path: `artifacts/entry-venue-${testInfo.project.name}.png` });
});

test('a table QR with a wrong code shows "No reconocimos este QR"', async ({ page }, testInfo) => {
  await page.goto(`/8-zzzz?venue=${VENUE}`, { waitUntil: 'load' });
  await waitForWelcome(page);

  await expect(page.getByTestId('entry-card-unrecognized')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('entry-card-unrecognized')).toContainText(/No reconocimos este QR/i);
  await expect(page.getByTestId('entry-card')).toHaveCount(0);
  // The normal flow continues: the Welcome buttons are still there.
  await expect(page.getByText(/Comenzar|Get started/i).first()).toBeVisible();

  await page.screenshot({ path: `artifacts/entry-unrecognized-${testInfo.project.name}.png` });
});

test('a reserved subdomain is not an entry: plain Welcome, no card', async ({ page }, testInfo) => {
  await page.goto('/?venue=www', { waitUntil: 'load' });
  await waitForWelcome(page);
  await page.waitForTimeout(4_000); // long enough for any (wrong) lookup to have shown a card

  await expect(page.getByTestId('entry-card')).toHaveCount(0);
  await expect(page.getByTestId('entry-card-unrecognized')).toHaveCount(0);
  await expect(page.getByText(/Comenzar|Get started/i).first()).toBeVisible();

  await page.screenshot({ path: `artifacts/entry-reserved-${testInfo.project.name}.png` });
});
