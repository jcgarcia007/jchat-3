/**
 * JChat 3.0 — the venue menu on the web (fix/web-venue-menu).
 *
 * Needs the saved session (e2e/.auth/web-session.json, git-ignored; `npm run web:session`): it is skipped without it.
 * Bar XZX at 390 px: tapping 🍴 opens the PUBLIC menu (https://jchat.cloud/m/…) in a NEW tab and the chat tab stays in
 * the chat. Nothing is ordered or paid: the new tab is only checked for its URL and closed.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const SESSION = path.resolve(__dirname, '..', '.auth', 'web-session.json');

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

test('🍴 opens the public menu in a new tab and the chat tab stays in the chat', async ({ page, context }) => {
  await page.goto('/?venue=bar-xzx-omd2', { waitUntil: 'load' });
  await page.getByText('Entrar al chat').first().click({ timeout: 30_000 });
  await expect(page.getByTestId('chat-more-button')).toBeVisible({ timeout: 30_000 });

  const menuButton = page.getByRole('button', { name: /Abrir menú|Open menu/i }).first();
  await expect(menuButton).toBeVisible();

  const [menuTab] = await Promise.all([context.waitForEvent('page', { timeout: 15_000 }), menuButton.click()]);
  expect(menuTab.url()).toMatch(/^https:\/\/jchat\.cloud\/m\//);
  expect(menuTab.url()).not.toContain('app=1');
  await menuTab.close();

  // The original tab is still the chat (no navigation happened there).
  await expect(page.getByTestId('chat-more-button')).toBeVisible();
  await expect(page.getByPlaceholder('Mensaje…')).toBeVisible();
});
