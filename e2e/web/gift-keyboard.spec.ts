/**
 * JChat 3.0 — the gift's card step stays above the iOS keyboard (fix/web-gift-keyboard). Safari on an iPhone does not shrink the
 * layout viewport when the keyboard opens, only the VISUAL viewport, and the GiftSheet (pinned to the bottom) used to end up under it.
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
import { expect, test, type Page } from '@playwright/test';
import { assertNothingLeaked, hasSession, messageRecord, mockGamesNetwork, PERSON_ID, SESSION, VENUE, watchRealtime } from './games-mock';

test.skip(!hasSession, 'no saved web session (run: npm run web:session)');
test.use({
  storageState: hasSession ? SESSION : undefined,
  locale: 'es-MX',
  geolocation: { latitude: 26.083048, longitude: -80.223725 },
  permissions: ['geolocation'],
});

const KEYBOARD_PX = 336;

const FAKE_STRIPE = `
window.Stripe = function () {
  var handlers = {};
  var emit = function (name) { (handlers[name] || []).forEach(function (h) { h({}); }); };
  var element = {
    mount: function (node) {
      var frame = document.createElement('iframe');
      frame.setAttribute('data-fake-stripe', '1');
      frame.style.cssText = 'width:100%;height:340px;border:0;display:block';
      frame.srcdoc = '<body style="margin:0;font:16px sans-serif">' +
        ['Card number', 'MM / YY', 'CVC', 'Country', 'ZIP'].map(function (p) {
          return '<input placeholder="' + p + '" style="font-size:16px;box-sizing:border-box;width:100%;height:44px;margin:0 0 12px;padding:0 12px;border:1px solid #888;border-radius:12px">';
        }).join('') + '</body>';
      frame.onload = function () {
        frame.contentDocument.querySelectorAll('input').forEach(function (input) {
          input.addEventListener('focus', function () { emit('focus'); });
        });
        emit('ready');
      };
      node.appendChild(frame);
    },
    on: function (name, handler) { (handlers[name] = handlers[name] || []).push(handler); },
    off: function () {}, update: function () {}, unmount: function () {}, destroy: function () {},
  };
  return {
    elements: function () {
      return { create: function () { return element; }, getElement: function () { return null; }, update: function () {}, fetchUpdates: function () { return Promise.resolve(); }, submit: function () { return Promise.resolve({}); } };
    },
    createToken: function () {}, createPaymentMethod: function () {}, confirmCardPayment: function () {},
    confirmPayment: function () { return Promise.resolve({ paymentIntent: { status: 'requires_capture' } }); },
  };
};`;

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
  await expect(page.getByTestId('gift-pay')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('iframe[data-fake-stripe]')).toBeVisible();
  await page.waitForTimeout(500);
}

/** Geometry of the sheet (the rounded panel that holds the gift header) and of the controls, in layout-viewport px. */
const geometry = (page: Page) =>
  page.evaluate(() => {
    const rect = (el: Element | null) => {
      const r = el?.getBoundingClientRect();
      return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) } : null;
    };
    let sheet: HTMLElement | null = document.querySelector<HTMLElement>('[data-testid="gift-pay"]');
    while (sheet && parseFloat(getComputedStyle(sheet).borderTopLeftRadius) < 20) sheet = sheet.parentElement;
    const vv = window.visualViewport!;
    return {
      innerHeight: window.innerHeight,
      visibleBottom: Math.round(vv.height + vv.offsetTop),
      visibleHeight: Math.round(vv.height),
      sheet: rect(sheet),
      pay: rect(document.querySelector('[data-testid="gift-pay"]')),
      back: rect(document.querySelector('[data-testid="gift-pay-back"]')),
      field: rect(document.querySelector('iframe[data-fake-stripe]')),
      texts: document.body.innerText,
    };
  });

test('the card step rests ON TOP of the keyboard: field and buttons visible, short title, hint folded', async ({ page }) => {
  await page.addInitScript(FAKE_VISUAL_VIEWPORT);
  // Stripe's 'focus' event must scroll the form into view: count the calls.
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
  await page.screenshot({ path: 'artifacts/gift-keyboard/keyboard-closed.png' });
  expect(closed.texts).toMatch(/Pagar [^\n]+ · USD\s\d/); // short title: "Pagar <items> · USD X"
  expect(closed.texts).toMatch(/Elige qué enviar/); // the hint is there while the keyboard is closed
  expect(closed.texts).toMatch(/Pagar USD\s\d/); // the main button says Pagar
  expect(closed.texts).toMatch(/Tu tarjeta se autoriza ahora y solo se cobra si .+ acepta el regalo\. Si no lo acepta en 15 minutos, se libera sola\./);

  // Tap the card field (Stripe's focus event) and let Safari open the keyboard.
  await page.frameLocator('iframe[data-fake-stripe]').getByPlaceholder('Card number').click();
  await page.evaluate((px) => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(px), KEYBOARD_PX);
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => (window as unknown as { __scrolled: number }).__scrolled), 'focus scrolls the form into view').toBeGreaterThan(0);
  const open = await geometry(page);
  await page.screenshot({ path: 'artifacts/gift-keyboard/keyboard-open.png' });

  expect(open.visibleHeight).toBe(closed.innerHeight - KEYBOARD_PX);
  // The sheet rests on the keyboard (its bottom is the visible bottom) and never goes above the top margin (>= 24 px).
  expect(open.sheet).not.toBeNull();
  expect(open.sheet!.bottom, 'sheet bottom sits on the keyboard').toBeLessThanOrEqual(open.visibleBottom);
  expect(open.sheet!.bottom, 'sheet is lifted, not floating').toBeGreaterThan(open.visibleBottom - 4);
  expect(open.sheet!.top, 'sheet below the top margin').toBeGreaterThanOrEqual(24);
  // Both buttons are inside what the keyboard leaves visible.
  expect(open.pay!.bottom, 'Retener above the keyboard').toBeLessThanOrEqual(open.visibleBottom);
  expect(open.back!.bottom, 'Volver above the keyboard').toBeLessThanOrEqual(open.visibleBottom);
  expect(open.pay!.top).toBeGreaterThanOrEqual(0);
  // Order: title -> field -> buttons; the long text folds while the keyboard is open.
  expect(open.texts).toMatch(/Pagar [^\n]+ · USD\s\d/);
  expect(open.texts).not.toMatch(/Elige qué enviar/);
  expect(open.texts).not.toMatch(/Tu tarjeta se autoriza ahora/);
  expect(open.texts).not.toMatch(/Regalo para /); // the gift title gives its place to the short pay title
  // The field area (an inner scroller capped in px, so the buttons never leave the screen) starts above the buttons and the card
  // number input itself is on screen above the keyboard.
  expect(open.field!.top).toBeLessThan(open.pay!.top);
  const cardInput = await page.frameLocator('iframe[data-fake-stripe]').getByPlaceholder('Card number').boundingBox();
  expect(cardInput!.y + cardInput!.height, 'card number above the keyboard').toBeLessThanOrEqual(open.visibleBottom);

  // The keyboard goes away: everything comes back.
  await page.evaluate(() => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(0));
  await page.waitForTimeout(600);
  const back = await geometry(page);
  expect(back.texts).toMatch(/Elige qué enviar/);
  expect(back.sheet!.bottom).toBeGreaterThanOrEqual(back.innerHeight - 4);

  expect(assertNothingLeaked(mock)).toEqual([]);
  expect(mock.unknownRpcs).toEqual([]);
  expect(mock.writes).toEqual([]);
});
