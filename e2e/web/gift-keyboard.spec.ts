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

/** A visualViewport the spec can shrink: Safari's behaviour when the keyboard opens (layout viewport unchanged), plus an optional bottom toolbar (Chrome for iPhone). */
const FAKE_VISUAL_VIEWPORT = `
(function () {
  var target = new EventTarget();
  var state = { toolbar: 0, keyboard: 0 };
  var viewport = {
    offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1,
    get width() { return window.innerWidth; },
    get height() { return window.innerHeight - state.toolbar - state.keyboard; },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  };
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
  window.__setViewport = function (toolbar, keyboard) {
    state.toolbar = toolbar; state.keyboard = keyboard;
    // index.html's fit(): <body> follows the visible area.
    document.documentElement.style.setProperty('--app-h', Math.round(viewport.height) + 'px');
    target.dispatchEvent(new Event('resize'));
  };
  window.__setKeyboard = function (px) { window.__setViewport(0, px); };
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

/** The simulated network + Stripe stand-in + fake visual viewport shared by every test here. `compact` = a ~200 px card form (closer to Stripe's real one). */
async function prepare(page: Page, { compact = false }: { compact?: boolean } = {}) {
  await page.addInitScript(FAKE_VISUAL_VIEWPORT);
  if (compact) await page.addInitScript(() => { (window as unknown as { __fakeCardCompact: boolean }).__fakeCardCompact = true; });
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

const AUTOFILL_BAR_PX = 44; // the keyboard's autofill bar sits above the keys: Pay must end above it when the form fits
const TOOLBAR_PX = 90; // Chrome for iPhone's bottom toolbar

/** Taps the card number (Stripe's focus event) and lets the page see the viewport the keyboard (and the toolbar) leave. */
async function openKeyboard(page: Page, toolbar = 0) {
  await page.frameLocator('iframe[data-fake-stripe]').getByPlaceholder('Card number').click();
  await page.evaluate(([t, k]) => (window as unknown as { __setViewport: (a: number, b: number) => void }).__setViewport(t, k), [toolbar, KEYBOARD_PX]);
  await page.waitForTimeout(1200); // the page waits 350 ms for the viewport to settle, then scrolls smoothly
}

const cardInputBox = (page: Page) => page.frameLocator('iframe[data-fake-stripe]').getByPlaceholder('Card number').boundingBox();
const zipBox = (page: Page) => page.frameLocator('iframe[data-fake-stripe]').getByPlaceholder('ZIP').boundingBox();

test('the card step is a full-screen page: field and Pay (in the flow) end up above the keyboard', async ({ page }) => {
  const mock = await prepare(page);
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

  // Tap the card field and let Safari open the keyboard: the visible area shrinks, <body> follows it, the summary folds to the total line.
  await openKeyboard(page);
  const open = await geometry(page);
  await page.screenshot({ path: `${SHOTS}/pay-page-keyboard-open.png` });
  expect(open.visibleHeight).toBe(closed.innerHeight - KEYBOARD_PX);
  expect(open.page!.bottom, 'the page ends where the keyboard begins').toBeLessThanOrEqual(open.visibleBottom + 1);
  expect(open.texts).toMatch(/Regalo para /); // the header stays
  const folded = await page.getByTestId('gift-pay-summary').innerText();
  expect(folded, 'the summary folded: products and venue are gone').not.toMatch(/producto/);
  expect(folded, 'the total line stays').toMatch(/Total\s+USD\s\d/);
  // The card field is above the keyboard and below the header.
  const cardInput = await cardInputBox(page);
  expect(cardInput!.y, 'card number below the header').toBeGreaterThanOrEqual(open.back!.bottom - 1);
  expect(cardInput!.y + cardInput!.height, 'card number above the keyboard').toBeLessThanOrEqual(open.visibleBottom);

  // The keyboard goes away: the page is whole again, the summary unfolds.
  await page.evaluate(() => (window as unknown as { __setViewport: (a: number, b: number) => void }).__setViewport(0, 0));
  await page.frameLocator('iframe[data-fake-stripe]').getByPlaceholder('Card number').blur();
  await page.waitForTimeout(700);
  const back = await geometry(page);
  expect(back.page!.bottom).toBeGreaterThanOrEqual(back.innerHeight - 1);
  expect(await page.getByTestId('gift-pay-summary').innerText(), 'the summary unfolds once the field is left').toMatch(/\d+ producto/);

  // The arrow does what Volver / the X always did: the unpaid offer is cancelled and the page closes.
  await page.getByTestId('gift-pay-page-back').click();
  await expect(page.getByTestId('gift-pay-page')).toHaveCount(0);

  expect(assertNothingLeaked(mock)).toEqual([]);
  expect(mock.unknownRpcs).toEqual([]);
  expect(mock.writes).toEqual([]);
});

test('keyboard 336 px + autofill bar 44 px, a form that FITS: the card field (down to postal code) AND Pay end above the bar', async ({ page }) => {
  await prepare(page, { compact: true });
  await openCardStep(page);
  await openKeyboard(page);
  const m = await geometry(page);
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/pay-page-keyboard-fits.png` });
  const card = await cardInputBox(page);
  const zip = await zipBox(page);
  expect(card!.y, 'card number below the header').toBeGreaterThanOrEqual(m.back!.bottom - 1);
  expect(zip!.y + zip!.height, 'postal code visible above the keyboard').toBeLessThanOrEqual(m.visibleBottom);
  expect(m.pay!.top).toBeGreaterThanOrEqual(m.back!.bottom - 1);
  expect(m.pay!.bottom, 'Pay above the keyboard AND its autofill bar').toBeLessThanOrEqual(m.visibleBottom - AUTOFILL_BAR_PX);
});

test('keyboard 336 px, a form TALLER than the room: the focused card field has priority (visible, under the header) and Pay is one scroll away', async ({ page }) => {
  await prepare(page); // 340 px of card form: form + Pay + folded summary do not fit in 508 − 56 − 56
  await openCardStep(page);
  await openKeyboard(page);
  const m = await geometry(page);
  await page.screenshot({ path: `${SHOTS}/pay-page-keyboard-priority-field.png` });
  const card = await cardInputBox(page);
  expect(card!.y, 'the focused field is below the header').toBeGreaterThanOrEqual(m.back!.bottom - 1);
  expect(card!.y + card!.height, 'the focused field is above the keyboard').toBeLessThanOrEqual(m.visibleBottom);
  // Pay is reachable: scrolling the page to the end brings it above the keyboard and its autofill bar (the content keeps room under it).
  await page.getByTestId('gift-pay-scroll').evaluate((el) => { (el as HTMLElement).scrollTop = (el as HTMLElement).scrollHeight; });
  await page.waitForTimeout(300);
  const end = await geometry(page);
  expect(end.pay!.bottom, 'at the end of the page Pay is above the autofill bar').toBeLessThanOrEqual(end.visibleBottom - AUTOFILL_BAR_PX);
});

test('Chrome for iPhone (90 px bottom toolbar) + keyboard 336 px + autofill bar: field and Pay stay visible when they fit, the field when they do not', async ({ page }) => {
  await prepare(page, { compact: true });
  await openCardStep(page);
  await openKeyboard(page, TOOLBAR_PX);
  const m = await geometry(page);
  await page.screenshot({ path: `${SHOTS}/pay-page-chrome-ios-keyboard.png` });
  expect(m.visibleHeight, 'visible = innerHeight − toolbar − keyboard').toBe(m.innerHeight - TOOLBAR_PX - KEYBOARD_PX);
  expect(m.page!.bottom, 'the page ends where the visible area ends').toBeLessThanOrEqual(m.visibleBottom + 1);
  const card = await cardInputBox(page);
  expect(card!.y, 'card number below the header').toBeGreaterThanOrEqual(m.back!.bottom - 1);
  expect(card!.y + card!.height, 'card number above the keyboard').toBeLessThanOrEqual(m.visibleBottom);
  // 418 px of visible area − 56 header: the folded summary + 200 px of card + Pay need ≈ 360 px, so it fits: Pay above the bar too.
  expect(m.pay!.bottom, 'Pay above the autofill bar').toBeLessThanOrEqual(m.visibleBottom - AUTOFILL_BAR_PX);
});

test('Chrome for iPhone with the taller form: the focused field has priority', async ({ page }) => {
  await prepare(page);
  await openCardStep(page);
  await openKeyboard(page, TOOLBAR_PX);
  const m = await geometry(page);
  const card = await cardInputBox(page);
  expect(card!.y).toBeGreaterThanOrEqual(m.back!.bottom - 1);
  expect(card!.y + card!.height).toBeLessThanOrEqual(m.visibleBottom);
});

test('moving from one card field to another does not flicker the summary (blur → focus keeps it folded)', async ({ page }) => {
  await prepare(page, { compact: true });
  await openCardStep(page);
  await openKeyboard(page);
  const frame = page.frameLocator('iframe[data-fake-stripe]');
  await frame.getByPlaceholder('MM / YY').click();
  await page.waitForTimeout(100);
  await frame.getByPlaceholder('CVC').click();
  await page.waitForTimeout(500);
  expect(await page.getByTestId('gift-pay-summary').innerText(), 'still folded while moving between fields').not.toMatch(/producto/);
});
