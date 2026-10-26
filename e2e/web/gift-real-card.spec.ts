/**
 * JChat 3.0 — the gift's card step with Stripe's REAL PaymentElement (the keyboard is still simulated: Playwright's WebKit has none).
 *
 * OPT-IN: this spec WRITES real test data (one gift offer from `test` to `test1` at Bar XZX and one Stripe TEST-mode PaymentIntent,
 * a manual-capture authorization nobody confirms). It cancels the offer with "Volver" at the end. Run it only with the owner's
 * authorization, at most twice an hour (the server allows 3 gift offers per hour per sender), and never against a Stripe key that is
 * not pk_test_ (the spec stops if the server answers anything else).
 *
 *   cd e2e && GIFT_REAL=1 npx playwright test -c web.config.ts web/gift-real-card.spec.ts --project=webkit-390
 *
 * Needs the Expo web export in mobile/dist-web, the saved session of `test`, and `test1` present in the venue.
 */
import { expect, test, type Page } from '@playwright/test';
import { hasSession, SESSION, VENUE } from './games-mock';

test.skip(!process.env.GIFT_REAL, 'opt-in: GIFT_REAL=1 (writes a test offer + a test-mode PaymentIntent)');
test.skip(!hasSession, 'no saved web session (run: npm run web:session)');
test.use({
  storageState: hasSession ? SESSION : undefined,
  locale: 'es-MX',
  geolocation: { latitude: 26.083048, longitude: -80.223725 },
  permissions: ['geolocation'],
});

const KEYBOARD_PX = Number(process.env.GIFT_KEYBOARD_PX ?? 336);

const FAKE_VISUAL_VIEWPORT = `
(function () {
  var target = new EventTarget();
  var keyboard = 0;
  var viewport = {
    offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1,
    get width() { return window.innerWidth; },
    get height() { return window.innerHeight - keyboard; },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  };
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
  window.__setKeyboard = function (px) { keyboard = px; target.dispatchEvent(new Event('resize')); };
})();`;

async function enterChat(page: Page) {
  await page.goto(`/?venue=${VENUE}`, { waitUntil: 'load' });
  const enter = page.getByTestId('chat-enter');
  await enter.waitFor({ state: 'visible', timeout: 30_000 });
  await enter.click();
  await expect(page.getByTestId('chat-more-button')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
}

test('real PaymentElement: number + expiry + CVC + Pagar visible above the keyboard; Volver cancels the offer', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(FAKE_VISUAL_VIEWPORT);
  const holdKeys: string[] = [];
  page.on('response', async (res) => {
    if (/\/functions\/v1\/payments/.test(res.url()) && res.request().method() === 'POST') {
      try {
        const body = await res.json();
        if (typeof body?.publishableKey === 'string') holdKeys.push(body.publishableKey.slice(0, 8));
      } catch { /* not JSON */ }
    }
  });

  await enterChat(page);
  await page.getByRole('button', { name: /acciones de test1/ }).last().click({ timeout: 20_000 });
  await page.getByTestId('quick-card-gift').click({ timeout: 15_000 });
  await page.getByRole('button', { name: /^Añadir un / }).first().click({ timeout: 20_000 });
  await page.getByRole('button', { name: /^Enviar regalo/ }).click();
  await expect(page.getByTestId('gift-pay')).toBeVisible({ timeout: 30_000 });
  // From here the offer exists: whatever happens, "Volver" cancels it (an open offer blocks the next gift to the same person).
  try {
    await measure();
  } finally {
    await page.screenshot({ path: 'artifacts/gift-keyboard/real-final.png' }).catch(() => undefined);
    const back = page.getByTestId('gift-pay-page-back');
    if (await back.isVisible().catch(() => false)) {
      // The cancel is fire-and-forget in the app: wait for its answer so the offer is really closed before the page goes away.
      const cancelled = page.waitForResponse((r) => /rpc\/gift_offer_cancel/.test(r.url()), { timeout: 15_000 }).catch(() => null);
      await back.click();
      await cancelled;
    }
  }
  await expect(page.getByRole('button', { name: /^Enviar regalo/ })).toBeVisible({ timeout: 10_000 });

  async function measure() {
  // Stop at once if the server is not in Stripe TEST mode.
  expect(holdKeys.length, 'gift_hold answered').toBeGreaterThan(0);
  expect(holdKeys[0], 'publishable key is a test key').toBe('pk_test_');

  // The Element's own iframe (the hidden controller frames Stripe adds to <body> are not visible).
  const stripeSelector = 'iframe[name^="__privateStripeFrame"]:visible';
  const stripeFrame = page.frameLocator(stripeSelector).first();
  // While the PaymentIntent still allows several methods (before the card-only server change) the Element is an accordion with
  // every method closed: open "Tarjeta" first. With card only there is nothing to open.
  // (The accordion row is not exposed as a radio in WebKit: click its label text.)
  const cardRow = stripeFrame.getByText(/^(Tarjeta|Card)$/).first();
  if (await cardRow.isVisible({ timeout: 15_000 }).catch(() => false)) await cardRow.click();
  const cardNumber = stripeFrame.getByPlaceholder(/1234 1234 1234 1234/);
  await expect(cardNumber).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'artifacts/gift-keyboard/real-closed.png' });
  const frameBox = await page.locator(stripeSelector).first().boundingBox();
  console.log('REAL_IFRAME_HEIGHT', Math.round(frameBox?.height ?? 0));

  await cardNumber.click(); // Stripe's own focus event
  await page.evaluate((px) => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(px), KEYBOARD_PX);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'artifacts/gift-keyboard/real-open.png' });

  const visibleBottom = await page.evaluate(() => Math.round(window.visualViewport!.height + window.visualViewport!.offsetTop));
  const bottoms = {
    number: (await cardNumber.boundingBox())!,
    expiry: (await stripeFrame.getByPlaceholder(/MM \/ AA|MM \/ YY/).boundingBox())!,
    cvc: (await stripeFrame.getByPlaceholder(/CVC|CVV/).boundingBox())!,
    pay: (await page.getByTestId('gift-pay').boundingBox())!,
    back: (await page.getByTestId('gift-pay-page-back').boundingBox())!,
  };
  for (const [name, box] of Object.entries(bottoms)) {
    expect(box.y + box.height, `${name} above the keyboard`).toBeLessThanOrEqual(visibleBottom);
    expect(box.y, `${name} below the top of the screen`).toBeGreaterThanOrEqual(0);
  }
  }
});
