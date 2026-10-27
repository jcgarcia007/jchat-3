/**
 * JChat 3.0 — the gift's card step is a FULL-SCREEN page (R3, feat/web-gift-pay-page) that keeps the focused card field and the Pay
 * button above the iOS keyboard. Safari on an iPhone does not shrink the layout viewport when the keyboard opens, only the VISUAL
 * viewport; the page lives inside <body> (fitted to the visual viewport by public/index.html) and has ONE scroller, so nothing is
 * pinned to the bottom and the keyboard cannot cover the Pay button.
 *
 * Playwright's WebKit has no on-screen keyboard, so it is SIMULATED: window.visualViewport is replaced by a fake whose height the
 * spec reduces by a keyboard's height (336 px, an iPhone's) and whose `resize` it fires, exactly what Safari reports. Nothing real is
 * paid or written: the whole games network is simulated (games-mock.ts), gift_available / gift_offer_create / gift_offer_cancel and
 * the `payments` Edge Function are answered here, and Stripe.js is a stand-in that mounts a tall iframe with card-like fields (the
 * real Elements iframe cannot be created without a real PaymentIntent). It tests OUR layout, not Stripe's form.
 *
 * Run: cd e2e && npx playwright test -c web.config.ts web/gift-keyboard.spec.ts --project=webkit-390
 * (needs the Expo web export in mobile/dist-web and the saved session).
 */
import { mkdir } from 'node:fs/promises';
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

const KEYBOARD_PX = 336;

/** A visualViewport the spec can shrink: Safari's behaviour when the keyboard opens (layout viewport unchanged). */
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
  window.__setKeyboard = function (px) {
    keyboard = px;
    target.dispatchEvent(new Event('resize'));
  };
})();`;

async function enterChat(page: Page) {
  await page.goto(`/?venue=${VENUE}`, { waitUntil: 'load' });
  const enter = page.getByTestId('chat-enter');
  await enter.waitFor({ state: 'visible', timeout: 30_000 });
  await enter.click();
  await expect(page.getByTestId('chat-more-button')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200);
}

async function openCardStep(page: Page) {
  const injector = await watchRealtime(page);
  await enterChat(page);
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
  await expect(page.getByTestId('gift-pay')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('iframe[data-fake-stripe]')).toBeVisible();
  await page.waitForTimeout(500);
}

const SHOTS = '../mobile/e2e/screenshots/r3';

/** Geometry of the page, its scroller and the controls, in layout-viewport px. The fake visualViewport has no offsetTop. */
const geometry = (page: Page) =>
  page.evaluate(() => {
    const rect = (el: Element | null) => {
      const r = el?.getBoundingClientRect();
      return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) } : null;
    };
    const vv = window.visualViewport!;
    const scroll = document.querySelector<HTMLElement>('[data-testid="gift-pay-scroll"]');
    const bodyRect = document.body.getBoundingClientRect();
    return {
      innerHeight: window.innerHeight,
      visibleBottom: Math.round(vv.height + vv.offsetTop),
      visibleHeight: Math.round(vv.height),
      bodyBottom: Math.round(bodyRect.bottom),
      page: rect(document.querySelector('[data-testid="gift-pay-page"]')),
      scroller: rect(scroll),
      scrollTop: Math.round(scroll?.scrollTop ?? -1),
      pay: rect(document.querySelector('[data-testid="gift-pay"]')),
      back: rect(document.querySelector('[data-testid="gift-pay-page-back"]')),
      field: rect(document.querySelector('iframe[data-fake-stripe]')),
      focusedTestId: (document.activeElement as HTMLElement | null)?.getAttribute?.('data-testid') ?? null,
      texts: document.body.innerText,
    };
  });

test('the card step is a full-screen page: field and Pay (in the flow) end up above the keyboard', async ({ page }) => {
  await page.addInitScript(FAKE_VISUAL_VIEWPORT);
  // Keep <body> on the visible area like public/index.html's fit() does on a real phone: the fake viewport fires `resize`.
  await page.addInitScript(() => {
    const w = window as unknown as { __scrolled: number };
    w.__scrolled = 0;
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (...args: Parameters<typeof original>) {
      w.__scrolled += 1;
      return original.apply(this, args);
    };
  });
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

  await openCardStep(page);
  const closed = await geometry(page);
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/pay-page-no-keyboard.png` });

  // The page: header "← Regalo para …", summary (products, venue, count, total), field, Pay, fine print — all text from the spec.
  expect(closed.texts).toMatch(/Regalo para /);
  expect(closed.texts).toMatch(/\d+ producto/);
  expect(closed.texts).toMatch(/Total\s+USD\s\d/);
  expect(closed.texts).toMatch(/Pagar USD\s\d/);
  expect(closed.texts).toMatch(/Tu tarjeta se autoriza ahora y solo se cobra si .+ acepta el regalo\. Si no lo acepta en 15 minutos, se libera sola\./);
  expect(closed.texts).not.toMatch(/Elige qué enviar/); // the picker is gone: this is a page, not the sheet
  // Full screen, inside <body>, nothing pinned to the bottom.
  expect(closed.page!.top).toBeLessThanOrEqual(1);
  expect(closed.page!.bottom).toBeGreaterThanOrEqual(closed.innerHeight - 1);
  expect(closed.pay!.top, 'Pay comes after the field, in the flow').toBeGreaterThan(closed.field!.bottom - 1);
  // Arrow: 44 px touch area and a label; focus moved to the page header (not lost, no keyboard).
  const arrow = await page.getByTestId('gift-pay-page-back').boundingBox();
  expect(arrow!.width).toBeGreaterThanOrEqual(44);
  expect(arrow!.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByTestId('gift-pay-page').getByRole('button', { name: 'Volver' })).toBeVisible();
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);

  // Tap the card field (Stripe's focus event) and let Safari open the keyboard: the visible area shrinks, <body> follows it.
  await page.frameLocator('iframe[data-fake-stripe]').getByPlaceholder('Card number').click();
  await page.evaluate((px) => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(px), KEYBOARD_PX);
  await page.evaluate(() => {
    // index.html's fit(), which the fake viewport's `resize` would run on a real phone.
    const vv = window.visualViewport!;
    document.documentElement.style.setProperty('--app-h', `${Math.round(vv.height)}px`);
  });
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => (window as unknown as { __scrolled: number }).__scrolled), 'focus scrolls the form into view').toBeGreaterThan(0);
  const open = await geometry(page);
  await page.screenshot({ path: `${SHOTS}/pay-page-keyboard-open.png` });

  expect(open.visibleHeight).toBe(closed.innerHeight - KEYBOARD_PX);
  expect(open.page!.bottom, 'the page ends where the keyboard begins').toBeLessThanOrEqual(open.visibleBottom + 1);
  // The card field and the Pay button are both above the keyboard, with room for the autofill bar under Pay.
  const cardInput = await page.frameLocator('iframe[data-fake-stripe]').getByPlaceholder('Card number').boundingBox();
  expect(cardInput!.y, 'card number below the header').toBeGreaterThanOrEqual(open.back!.bottom - 1);
  expect(cardInput!.y + cardInput!.height, 'card number above the keyboard').toBeLessThanOrEqual(open.visibleBottom);
  expect(open.pay!.bottom, 'Pay above the keyboard').toBeLessThanOrEqual(open.visibleBottom);
  expect(open.pay!.top).toBeGreaterThanOrEqual(open.back!.bottom - 1);
  expect(open.texts).toMatch(/Regalo para /); // the header stays (nothing folds any more)

  // The keyboard goes away: the page is whole again.
  await page.evaluate(() => {
    (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(0);
    document.documentElement.style.setProperty('--app-h', `${window.innerHeight}px`);
  });
  await page.waitForTimeout(500);
  const back = await geometry(page);
  expect(back.page!.bottom).toBeGreaterThanOrEqual(back.innerHeight - 1);

  // The arrow does what Volver / the X always did: the unpaid offer is cancelled and the page closes.
  await page.getByTestId('gift-pay-page-back').click();
  await expect(page.getByTestId('gift-pay-page')).toHaveCount(0);

  expect(assertNothingLeaked(mock)).toEqual([]);
  expect(mock.unknownRpcs).toEqual([]);
  expect(mock.writes).toEqual([]);
});
