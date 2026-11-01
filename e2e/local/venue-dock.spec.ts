/**
 * JChat 3.0 — the VenueDock on the web build: hermetic (local/hermetic.ts), nothing leaves 127.0.0.1.
 *
 * With a venue session (entered through the venue's link and the "Entrar" gate) the "Estás en {local}" card shows on the screens that play the part
 * of the tab screens on the web (the signed-in home, Messages, Offers) and is NOT on screen inside the venue chat. The chat's arrow only minimizes:
 * the session stays and the card is there afterwards. "Salir" opens the confirmation; Cancelar keeps the session, "Salir del local" ends it.
 * (The Map / Profile tabs and DMChat are devices-only routes: their placement is pinned by mobile/scripts/venue-bar-placement.test.mjs and the
 * Android emulator run.)
 *
 * Run: cd e2e && npx playwright test -c local.config.ts local/venue-dock.spec.ts
 */
import { expect, test, type Page } from '@playwright/test';
import { enterChat, openVenue } from './fixtures';

test.use({ locale: 'es-MX' });

const dock = (page: Page) => page.getByTestId('venue-dock');

/** In the venue chat, past the entry gate. */
async function intoTheChat(page: Page) {
  await openVenue(page);
  await enterChat(page);
  await expect(dock(page)).toHaveCount(0); // never over the chat itself
}

/** The chat's arrow. */
async function tapArrow(page: Page) {
  await page.getByRole('button', { name: /^(Atrás|Volver|Back)$/ }).first().click();
}

test('the chat arrow only minimizes: the card "Estás en {local}" shows on the home, Messages and Offers, and the session stays', async ({ page }) => {
  await intoTheChat(page);
  await tapArrow(page);

  await expect(dock(page)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('venue-dock-name')).toHaveText('Bar Sintético');
  await expect(page.getByTestId('venue-dock-back')).toBeVisible();
  await expect(page.getByTestId('venue-dock-leave')).toBeVisible();

  await page.getByTestId('web-open-messages').click();
  await expect(dock(page)).toBeVisible({ timeout: 20_000 });

  await page.goBack();
  await page.getByTestId('web-open-offers').click();
  await expect(dock(page)).toBeVisible({ timeout: 20_000 });
});

test('"Volver al chat" reopens the venue chat, where the card is not shown', async ({ page }) => {
  await intoTheChat(page);
  await tapArrow(page);
  await page.getByTestId('venue-dock-back').click();
  await expect(page.getByTestId('chat-more-button')).toBeVisible({ timeout: 20_000 });
  await expect(dock(page)).toHaveCount(0);
});

test('Salir asks first: Cancelar keeps the session; "Salir del local" ends it and the card goes away', async ({ page }) => {
  await intoTheChat(page);
  await tapArrow(page);
  await expect(dock(page)).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('venue-dock-leave').click();
  await expect(page.getByText('¿Salir de Bar Sintético?')).toBeVisible();
  await expect(page.getByText('Se perderá toda la conversación del local. Para volver tendrás que escanear el QR o estar dentro del local.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByText('¿Salir de Bar Sintético?')).toHaveCount(0);
  await expect(dock(page)).toBeVisible(); // Cancelar did not end anything

  await page.getByTestId('venue-dock-leave').click();
  await page.getByRole('button', { name: 'Salir del local' }).click();
  await expect(dock(page)).toHaveCount(0, { timeout: 20_000 });
});

test('the chat menu\'s "Salir del local" asks through the same confirmation', async ({ page }) => {
  await intoTheChat(page);
  await page.getByTestId('chat-more-button').click();
  await page.getByTestId('venue-leave').click();
  await expect(page.getByText('¿Salir de Bar Sintético?')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByTestId('chat-more-button')).toBeVisible(); // still in the chat
});
