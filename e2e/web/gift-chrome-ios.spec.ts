/**
 * JChat 3.0 — the "¿En qué mesa estás?" accept sheet on Chrome for iPhone (feat/web-gift-pay-page).
 *
 * Chrome on iOS has its own toolbar at the bottom, so window.visualViewport.height is ~80-100 px SMALLER than window.innerHeight even
 * with NO keyboard (in Safari, without a keyboard, both heights match). useKeyboardCover took that difference for a keyboard: it lifted
 * the sheet by it (the chat's "Message..." bar showed below) and capped it to the shorter visual height, so the confirm button ended up
 * inside the sheet's scroll. A difference that small is not a keyboard: below KEYBOARD_MIN_COVER_PX the cover is 0.
 *
 * Playwright's WebKit has neither Chrome's toolbar nor a keyboard, so both are SIMULATED: window.visualViewport is replaced by a fake with
 * height = innerHeight − toolbar − keyboard (offsetTop 0), and `resize` is fired, exactly what the page would see. Nothing real is
 * written: the whole games network is simulated (games-mock.ts); `gift_offer_view` answers a synthetic "held" offer for the signed-in
 * user and the DM message list gets one synthetic gift message.
 *
 * Run: cd e2e && npx playwright test -c web.config.ts web/gift-chrome-ios.spec.ts --project=webkit-390
 */
import { expect, test, type Page } from '@playwright/test';
import { assertNothingLeaked, hasSession, mockGamesNetwork, SESSION, VENUE } from './games-mock';

test.skip(!hasSession, 'no saved web session (run: npm run web:session)');
test.use({
  storageState: hasSession ? SESSION : undefined,
  locale: 'es-MX',
  geolocation: { latitude: 26.083048, longitude: -80.223725 },
  permissions: ['geolocation'],
});

const TOOLBAR_PX = 90; // Chrome for iPhone's bottom toolbar
const KEYBOARD_PX = 336; // an iPhone's keyboard
const OFFER_ID = '00000000-0000-4000-8000-0000000000a9';
const TABLES = ['T1', 'T10', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9'].map((label) => ({ label }));

/** visualViewport.height = innerHeight − toolbar − keyboard; offsetTop 0 (Chrome iOS has no keyboard-driven scroll here). */
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
  window.__setViewport = function (toolbar, keyboard) { state.toolbar = toolbar; state.keyboard = keyboard; target.dispatchEvent(new Event('resize')); };
})();`;

const OFFER_VIEW = () => ({
  id: OFFER_ID,
  business_id: '00000000-0000-4000-8000-0000000000b1',
  status: 'held',
  is_sender: false,
  from: { id: '00000000-0000-4000-8000-0000000000a2', name: 'Prueba 1', avatar_url: null },
  to: { id: '00000000-0000-4000-8000-0000000000a3', name: 'Yo', avatar_url: null },
  items: [{ menu_item_id: '00000000-0000-4000-8000-0000000000c9', name: 'Mini Corn Dogs', description: null, qty: 1, id_required: false }],
  item_count: 1,
  note: null,
  expires_at: new Date(Date.now() + 14 * 60_000).toISOString(),
  table_label: null,
  total_cents: null,
  order_id: null,
});

async function openAcceptSheet(page: Page, tables: Array<{ label: string }>) {
  await page.addInitScript(FAKE_VISUAL_VIEWPORT);
  const mock = await mockGamesNetwork(page, { gift_offer_view: OFFER_VIEW(), venue_table_labels: tables });
  await page.route(/\/rest\/v1\/dm_messages/, (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: '00000000-0000-4000-8000-0000000000d9', conversation_id: '00000000-0000-4000-8000-0000000000e9',
        sender_id: '00000000-0000-4000-8000-0000000000a2', body: null, media_url: null, voice_url: null, voice_duration_s: null,
        read_at: null, created_at: new Date().toISOString(), gift_offer_id: OFFER_ID, media_moderation: null,
      }]),
    });
  });
  await page.goto(`/?venue=${VENUE}`, { waitUntil: 'load' });
  const enter = page.getByTestId('chat-enter');
  await enter.waitFor({ state: 'visible', timeout: 30_000 });
  await enter.click();
  await expect(page.getByTestId('chat-more-button')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Mensajes' }).click();
  await page.getByText('test1', { exact: true }).locator('visible=true').first().click({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Aceptar', exact: true }).click({ timeout: 20_000 });
  await expect(page.getByText('¿Cuál es tu mesa?')).toBeVisible({ timeout: 10_000 });
  return mock;
}

const setViewport = (page: Page, toolbar: number, keyboard: number) =>
  page.evaluate(([t, k]) => (window as unknown as { __setViewport: (a: number, b: number) => void }).__setViewport(t, k), [toolbar, keyboard]);

/** Everything the three claims need, in layout-viewport px. */
const measure = (page: Page) =>
  page.evaluate(() => {
    const rect = (el: Element | null) => {
      const r = el?.getBoundingClientRect();
      return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom) } : null;
    };
    const vv = window.visualViewport!;
    const leaf = (text: string) => Array.from(document.querySelectorAll<HTMLElement>('div, span')).find((el) => el.children.length === 0 && el.innerText.startsWith(text)) ?? null;
    const confirm = leaf('Aceptar regalo');
    let sheet: HTMLElement | null = confirm;
    while (sheet && parseFloat(getComputedStyle(sheet).borderTopLeftRadius) < 20) sheet = sheet.parentElement;
    // the sheet's inner scroller (the one that would scroll if the content did not fit)
    const scroller = sheet ? Array.from(sheet.querySelectorAll<HTMLElement>('*')).find((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY)) ?? null : null;
    const composer = Array.from(document.querySelectorAll<HTMLElement>('textarea, input')).find((el) => /Mensaje|Message/.test((el as HTMLInputElement).placeholder ?? '')) ?? null;
    return {
      innerHeight: window.innerHeight,
      vvHeight: Math.round(vv.height),
      vvOffsetTop: Math.round(vv.offsetTop),
      diff: Math.round(window.innerHeight - (vv.height + vv.offsetTop)),
      sheet: rect(sheet),
      confirm: rect(confirm),
      scrollerClient: scroller?.clientHeight ?? null,
      scrollerScroll: scroller?.scrollHeight ?? null,
      composer: rect(composer),
    };
  });

test('Chrome iOS (bottom toolbar, NO keyboard): the sheet rests on the bottom, nothing is cut, Aceptar is visible without scrolling', async ({ page }) => {
  const mock = await openAcceptSheet(page, TABLES);
  await page.waitForTimeout(500);
  const before = await measure(page);
  await setViewport(page, TOOLBAR_PX, 0);
  await page.waitForTimeout(700);
  const m = await measure(page);
  console.log('SAFARI  (no toolbar):', JSON.stringify(before));
  console.log('CHROME  (toolbar 90):', JSON.stringify(m));
  await page.screenshot({ path: 'artifacts/gift-keyboard/chrome-ios-toolbar.png' });

  expect(m.innerHeight - m.vvHeight, 'the simulated toolbar is a height difference without any keyboard').toBe(TOOLBAR_PX);
  expect(m.sheet, 'sheet found').not.toBeNull();
  // pegada al fondo: its bottom is the bottom of the layout viewport, with nothing of the chat's composer showing under it
  expect(m.sheet!.bottom, 'sheet rests on the bottom of the screen').toBeGreaterThanOrEqual(m.innerHeight - 1);
  // same geometry as without the toolbar: the toolbar changed nothing
  expect(m.sheet!.top, 'sheet is as tall as in Safari').toBe(before.sheet!.top);
  // the content fits: no inner scroll, and the confirm button is on screen
  expect(m.scrollerClient, 'the sheet has its inner scroller').not.toBeNull();
  expect(m.scrollerScroll!, 'no scrolling inside the sheet').toBeLessThanOrEqual(m.scrollerClient! + 1);
  expect(m.confirm, 'Aceptar found').not.toBeNull();
  expect(m.confirm!.bottom, 'Aceptar inside the sheet').toBeLessThanOrEqual(m.sheet!.bottom);
  expect(m.confirm!.top, 'Aceptar inside the screen').toBeGreaterThan(0);
  expect(m.confirm!.bottom, 'Aceptar not under the toolbar').toBeLessThanOrEqual(m.vvHeight + 90);
  expect(assertNothingLeaked(mock)).toEqual([]);
});

test('Chrome iOS toolbar + a REAL keyboard ("Mi mesa no está en la lista"): the sheet rests on the keyboard, field and Aceptar visible', async ({ page }) => {
  const mock = await openAcceptSheet(page, TABLES);
  await page.getByText('Mi mesa no está en la lista').click();
  await page.getByPlaceholder('Número de mesa').click();
  await setViewport(page, TOOLBAR_PX, KEYBOARD_PX);
  await page.waitForTimeout(900);
  const m = await measure(page);
  console.log('CHROME + KEYBOARD:', JSON.stringify(m));
  await page.screenshot({ path: 'artifacts/gift-keyboard/chrome-ios-keyboard.png' });

  const visibleBottom = m.vvHeight + m.vvOffsetTop;
  expect(m.diff, 'a keyboard-sized difference').toBeGreaterThan(150);
  expect(m.sheet!.bottom, 'sheet sits on the keyboard').toBeLessThanOrEqual(visibleBottom);
  expect(m.sheet!.bottom, 'sheet is lifted, not floating').toBeGreaterThan(visibleBottom - 4);
  expect(m.sheet!.top, 'sheet below the top margin').toBeGreaterThanOrEqual(24);
  expect(m.confirm!.bottom, 'Aceptar above the keyboard').toBeLessThanOrEqual(visibleBottom);
  expect(m.confirm!.top).toBeGreaterThanOrEqual(0);
  expect(assertNothingLeaked(mock)).toEqual([]);
});

test('Chrome iOS toolbar, a venue with MANY tables: the list scrolls inside the sheet but Aceptar stays on screen (it is outside the scroll)', async ({ page }) => {
  const many = Array.from({ length: 120 }, (_, i) => ({ label: `M${i + 1}` }));
  const mock = await openAcceptSheet(page, many);
  await setViewport(page, TOOLBAR_PX, 0);
  await page.waitForTimeout(700);
  const m = await measure(page);
  console.log('CHROME  (120 tables):', JSON.stringify(m));
  await page.screenshot({ path: 'artifacts/gift-keyboard/chrome-ios-many-tables.png' });

  expect(m.scrollerScroll!, 'the long list scrolls inside the sheet').toBeGreaterThan(m.scrollerClient! + 1);
  expect(m.confirm!.bottom, 'Aceptar inside the sheet').toBeLessThanOrEqual(m.sheet!.bottom);
  expect(m.confirm!.top, 'Aceptar on screen').toBeGreaterThan(0);
  expect(m.sheet!.bottom, 'sheet still rests on the bottom').toBeGreaterThanOrEqual(m.innerHeight - 1);
  expect(m.sheet!.top, 'sheet below the top margin').toBeGreaterThanOrEqual(24);
  expect(assertNothingLeaked(mock)).toEqual([]);
});
