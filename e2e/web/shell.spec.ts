/**
 * JChat 3.0 — the web is only for the venue (F3b): no bottom tabs, no map, no "volver al chat" bar.
 *
 * No login: the unauthenticated start is checked. A signed-in web session lands on WebNoVenueScreen (no tabs
 * either: the tabs live in navigation/rootTabs.tsx, which the web build never resolves).
 *   - "/" without a pending entry and without a session → the normal Welcome, with no tab bar, no venue bar.
 *   - the Map is never loaded in the web build (no MapScreen chunk is requested).
 */

import { expect, test } from '@playwright/test';

test.use({ locale: 'es-MX' });

test('web start: Welcome, no tab bar, no venue bar, no Map chunk', async ({ page }, testInfo) => {
  const requested: string[] = [];
  page.on('request', (req) => requested.push(req.url()));

  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => (document.getElementById('root')?.innerText ?? '').trim().length > 0, undefined, { timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(2500);

  await expect(page.getByText(/Comenzar|Get started/i).first()).toBeVisible();
  await expect(page.getByTestId('tab-bar')).toHaveCount(0);
  await expect(page.getByTestId('venue-home-bar')).toHaveCount(0);
  await expect(page.getByTestId('web-no-venue')).toHaveCount(0); // signed-in root: not for anonymous visitors
  expect(requested.filter((url) => /MapScreen/.test(url)), 'the Map must never load on the web').toEqual([]);

  await page.screenshot({ path: `artifacts/shell-${testInfo.project.name}.png` });
});
