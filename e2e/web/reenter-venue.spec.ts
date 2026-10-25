/**
 * JChat 3.0 — re-entering a venue on the web (fix/web-reenter-venue).
 *
 * The entry QR / link is consumed once (EntryBridge clears the pending entry before opening the chat) and the entry
 * gate's "Cancelar" goes back to WebNoVenueScreen, where there was nothing to tap: only a refresh brought the entry back.
 * Now that screen offers "Entrar al chat de {local}" (the remembered entry goes through the same gate and geofence)
 * and "Ver el menú" (the chat's MenuSheet, without entering the chat).
 *
 * Needs the saved session (e2e/.auth/web-session.json): skipped without it. Phone viewport. The entry is NEVER
 * accepted: only the gate is looked at and cancelled, so nothing is written to the server (no join, no message).
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const SESSION = path.resolve(__dirname, '..', '.auth', 'web-session.json');
const VENUE = 'bar-xzx-omd2';

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

const gateEnter = (page: Page) => page.getByText('Entrar al chat', { exact: true }).first();
const gateCancel = (page: Page) => page.getByRole('button', { name: /^(Cancelar|Ahora no)$/ }).first();

test('Cancelar at the entry gate → "Entrar al chat de {local}" → the gate is back; "Ver el menú" opens the sheet', async ({ page }) => {
  await page.goto(`/?venue=${VENUE}`, { waitUntil: 'load' });

  // 1. The entry notice (gate). Look at it, do NOT accept it.
  await expect(gateEnter(page)).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'artifacts/web-reenter/1-entry-gate.png' });

  // 2. Cancelar → the root screen, which used to be a dead end.
  await gateCancel(page).click();
  const noVenue = page.getByTestId('web-no-venue');
  await expect(noVenue).toBeVisible({ timeout: 15_000 });
  const enter = page.getByTestId('web-enter-venue');
  await expect(enter).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('web-venue-name')).toHaveText('Bar XZX', { timeout: 15_000 });
  await expect(enter).toHaveText(/Entrar al chat de Bar XZX/);
  // The table code / venue entry never shows up in any text of the page or in its address.
  expect(page.url()).not.toContain(VENUE);
  expect(page.url()).not.toMatch(/[?&]venue=/);
  await page.screenshot({ path: 'artifacts/web-reenter/2-offer-after-cancel.png' });

  // 3. The offer works as many times as needed: tap it → the entry notice reappears (not accepted again).
  await enter.click();
  await expect(gateEnter(page)).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'artifacts/web-reenter/3-gate-again.png' });
  await gateCancel(page).click();
  await expect(page.getByTestId('web-enter-venue')).toBeVisible({ timeout: 15_000 });

  // 4. "Ver el menú" opens the menu sheet without entering the chat.
  const menu = page.getByTestId('web-view-menu');
  await expect(menu).toBeVisible({ timeout: 15_000 });
  await menu.click();
  await expect(page.locator('iframe')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1200); // the sheet slides in
  await page.screenshot({ path: 'artifacts/web-reenter/4-menu-sheet.png' });
});

test('without any entry (no ?venue, no venue host) the screen is exactly as before', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  const noVenue = page.getByTestId('web-no-venue');
  await expect(noVenue).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('web-enter-venue')).toHaveCount(0);
  await expect(page.getByTestId('web-view-menu')).toHaveCount(0);
  await expect(page.getByTestId('web-venue-name')).toHaveCount(0);
  // W3: "Descargar la app" is hidden until INVITE_TO_APP_ENABLED (mobile/constants/appLinks.ts) is true, so there is no dead store link.
  await expect(page.getByTestId('web-download-app')).toHaveCount(0);
  await expect(page.getByTestId('web-my-profile')).toBeVisible();
  await page.screenshot({ path: 'artifacts/web-reenter/5-no-entry-as-before.png' });
});
