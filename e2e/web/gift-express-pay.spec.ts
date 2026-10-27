/**
 * JChat 3.0 — R5: Apple Pay / Google Pay on the gift's full-screen payment page (feat/web-express-pay).
 *
 * Stripe's Express Checkout Element sits between the summary and the card form, inside the same Elements. This spec checks OUR side
 * with a Stripe.js stand-in (fake-stripe.ts): with a wallet the button and the "o con tarjeta" separator are drawn in the right
 * order; without a wallet NEITHER is; the wallet's `confirm` event runs the SAME payment function as the Pay button (one
 * confirmPayment, the busy lock, the attempt counter, event.paymentFailed() on a refusal); the wallet's `cancel` is not an attempt.
 * Nothing real is paid or written: the whole games network is simulated (games-mock.ts), gift_available / gift_offer_create /
 * gift_offer_cancel and the `payments` Edge Function are answered here.
 *
 * Run: cd e2e && npx playwright test -c web.config.ts web/gift-express-pay.spec.ts --project=webkit-390
 * (needs the Expo web export in mobile/dist-web and the saved session).
 */
import { expect, test, type Page } from '@playwright/test';
import { FAKE_STRIPE } from './fake-stripe';
import { assertNothingLeaked, hasSession, messageRecord, mockGamesNetwork, PERSON_ID, SESSION, VENUE, watchRealtime } from './games-mock';

test.skip(!hasSession, 'no saved web session (run: npm run web:session)');
test.use({
  storageState: hasSession ? SESSION : undefined,
  locale: 'es-MX',
  geolocation: { latitude: 26.083048, longitude: -80.223725 },
  permissions: ['geolocation'],
});

async function prepare(page: Page, wallet: 'apple' | 'google' | 'none') {
  await page.addInitScript((w) => { (window as unknown as { __wallet: string }).__wallet = w; }, wallet);
  const mock = await mockGamesNetwork(page, {
    gift_available: true,
    gift_offer_create: { id: '00000000-0000-4000-8000-0000000000a1', subtotal_cents: 500 },
    gift_offer_cancel: null,
  });
  await page.route(/js\.stripe\.com\//, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_STRIPE }));
  await page.route(/\/functions\/v1\/payments/, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ clientSecret: 'pi_fake_secret_fake', publishableKey: 'pk_test_fake', serverTotalCents: 540 }),
    });
  });
  return mock;
}

async function openPayPage(page: Page) {
  const injector = await watchRealtime(page);
  await page.goto(`/?venue=${VENUE}`, { waitUntil: 'load' });
  const enter = page.getByTestId('chat-enter');
  await enter.waitFor({ state: 'visible', timeout: 30_000 });
  await enter.click();
  await expect(page.getByTestId('chat-more-button')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  await expect.poll(() => injector() !== null, { timeout: 15_000 }).toBe(true);
  const roomId = page.url().match(/room\/([0-9a-f-]{36})/i)?.[1] ?? '00000000-0000-4000-8000-0000000000f1';
  injector()!.send(messageRecord(roomId, PERSON_ID, { body: 'Hola desde la barra' }));
  const avatar = page.getByTestId(`chat-message-avatar-${PERSON_ID}`);
  await avatar.waitFor({ state: 'attached', timeout: 15_000 });
  await avatar.click({ timeout: 15_000 });
  await page.getByTestId('quick-card-gift').click({ timeout: 10_000 });
  await page.getByRole('button', { name: /^Añadir un / }).first().click({ timeout: 20_000 });
  await page.getByRole('button', { name: /^Enviar regalo/ }).click();
  await expect(page.getByTestId('gift-pay-page')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('iframe[data-fake-stripe]')).toBeVisible();
  await page.waitForTimeout(400); // the fake wallet reports its availability after 50 ms
}

const win = <T>(page: Page, fn: () => T) => page.evaluate(fn);
const calls = (page: Page) => win(page, () => (window as unknown as { __confirmCalls: number }).__confirmCalls);
const failed = (page: Page) => win(page, () => (window as unknown as { __paymentFailedCalls: number }).__paymentFailedCalls);
const setResults = (page: Page, results: string[]) => page.evaluate((r) => { (window as unknown as { __confirmResults: string[] }).__confirmResults = r; }, results);
const fire = (page: Page, name: 'confirm' | 'cancel') => page.evaluate((n) => (window as unknown as { __fireWallet: (x: string) => void }).__fireWallet(n), name);

test('with a wallet: summary → wallet button → "o con tarjeta" → card form → Pagar, in that order', async ({ page }) => {
  const mock = await prepare(page, 'apple');
  await openPayPage(page);
  const wallet = page.locator('[data-fake-wallet]');
  await expect(wallet).toBeVisible();
  await expect(page.getByTestId('gift-wallet-or')).toBeVisible();
  await expect(page.getByTestId('gift-wallet-or')).toContainText('o con tarjeta');
  const y = async (loc: ReturnType<Page['locator']>) => (await loc.boundingBox())!.y;
  const summary = await y(page.getByText(/^Total$/));
  const walletY = await y(wallet);
  const orY = await y(page.getByTestId('gift-wallet-or'));
  const cardY = await y(page.locator('iframe[data-fake-stripe]'));
  const payY = await y(page.getByTestId('gift-pay'));
  expect(summary, 'the wallet is BELOW the summary').toBeLessThan(walletY);
  expect(walletY, '"o con tarjeta" under the wallet').toBeLessThan(orY);
  expect(orY, 'the card form under the separator').toBeLessThan(cardY);
  expect(cardY, 'Pagar after the card').toBeLessThan(payY);
  expect(assertNothingLeaked(mock)).toEqual([]);
});

test('Google Pay shows the same way; WITHOUT a wallet neither the button nor the separator is drawn, only the card', async ({ page }) => {
  const mock = await prepare(page, 'google');
  await openPayPage(page);
  await expect(page.locator('[data-fake-wallet="google"]')).toBeVisible();
  await expect(page.getByTestId('gift-wallet-or')).toBeVisible();
  expect(assertNothingLeaked(mock)).toEqual([]);

  const page2 = await page.context().newPage();
  const mock2 = await prepare(page2, 'none');
  await openPayPage(page2);
  await expect(page2.locator('[data-fake-wallet]')).toHaveCount(0);
  await expect(page2.getByTestId('gift-wallet-or')).toHaveCount(0);
  await expect(page2.getByText('o con tarjeta')).toHaveCount(0);
  await expect(page2.locator('iframe[data-fake-stripe]')).toBeVisible();
  await expect(page2.getByTestId('gift-pay')).toBeVisible();
  expect(assertNothingLeaked(mock2)).toEqual([]);
});

test('the wallet confirm runs the SAME payment function: one confirmPayment, the busy lock, then a refusal counts and closes the sheet', async ({ page }) => {
  const mock = await prepare(page, 'apple');
  await openPayPage(page);
  await setResults(page, ['pending']);
  await fire(page, 'confirm');
  expect(await calls(page)).toBe(1);
  // busy: Pagar is locked, a second wallet confirm does nothing
  await expect(page.getByTestId('gift-pay')).toBeDisabled();
  await fire(page, 'confirm');
  expect(await calls(page), 'no second confirmPayment while one is running').toBe(1);
  // the bank refuses
  await page.evaluate(() => (window as unknown as { __resolveConfirm: (k: string) => void }).__resolveConfirm('declined'));
  await expect(page.getByRole('alert')).toContainText('Te quedan 2 intentos');
  expect(await failed(page), 'event.paymentFailed() told the wallet sheet').toBe(1);
  await expect(page.getByTestId('gift-pay')).toBeEnabled();
  // the card path reaches the same counter: a refused card now says 1 left
  await setResults(page, ['declined']);
  await page.getByTestId('gift-pay').click();
  await expect(page.getByRole('alert')).toContainText('Te queda 1 intento');
  expect(await calls(page), 'one wallet confirmation + one card confirmation (the duplicate never ran)').toBe(2);
  expect(assertNothingLeaked(mock)).toEqual([]);
  expect(mock.unknownRpcs).toEqual([]);
});

test('closing the wallet sheet (cancel) is not an attempt: the next refused card still has 2 left', async ({ page }) => {
  const mock = await prepare(page, 'google');
  await openPayPage(page);
  await fire(page, 'cancel');
  await fire(page, 'cancel');
  expect(await calls(page), 'cancel never reaches confirmPayment').toBe(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await setResults(page, ['declined']);
  await page.getByTestId('gift-pay').click();
  await expect(page.getByRole('alert')).toContainText('Te quedan 2 intentos');
  // and a wallet that finally works puts the card on hold: the page closes like the card path does
  await setResults(page, ['held']);
  await fire(page, 'confirm');
  await expect(page.getByTestId('gift-pay-page')).toHaveCount(0, { timeout: 10_000 });
  expect(assertNothingLeaked(mock)).toEqual([]);
});
