/**
 * JChat 3.0 — the "¿Cuál es tu mesa?" sheet (accepting a gift) stays above the iOS keyboard (fix/web-gift-table-keyboard).
 * Same cause and same simulation as gift-keyboard.spec.ts: Safari does not shrink the layout viewport, only the visual one, and the
 * fixed modal ended up under the keyboard with the confirm button cut off. window.visualViewport is replaced by a fake the spec shrinks
 * by a keyboard's height (336 px) and whose `resize` it fires.
 *
 * Nothing real is written: the whole games network is simulated (games-mock.ts), `gift_offer_view` answers a synthetic offer "held" for
 * the signed-in user (the recipient) and the DM message list gets one synthetic gift message. Only reads of the saved session pass.
 *
 * Run: cd e2e && npx playwright test -c web.config.ts web/gift-table-keyboard.spec.ts --project=webkit-390
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

const KEYBOARD_PX = 336;
const OFFER_ID = '00000000-0000-4000-8000-0000000000a9';

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

async function openGiftInDm(page: Page) {
  await page.goto(`/?venue=${VENUE}`, { waitUntil: 'load' });
  const enter = page.getByTestId('chat-enter');
  await enter.waitFor({ state: 'visible', timeout: 30_000 });
  await enter.click();
  await expect(page.getByTestId('chat-more-button')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Mensajes' }).click();
  // The first conversation of the inbox (a real read of the saved session's own list).
  await page.getByText('test1', { exact: true }).locator('visible=true').first().click({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Aceptar', exact: true }).click({ timeout: 20_000 });
  await expect(page.getByText('¿Cuál es tu mesa?')).toBeVisible({ timeout: 10_000 });
}

test('the table sheet rests ON TOP of the keyboard: both fields and the confirm button visible', async ({ page }) => {
  await page.addInitScript(FAKE_VISUAL_VIEWPORT);
  const mock = await mockGamesNetwork(page, { gift_offer_view: OFFER_VIEW() });
  await page.route(/\/rest\/v1\/dm_messages/, (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.fallback();
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

  await openGiftInDm(page);
  await page.screenshot({ path: 'artifacts/gift-keyboard/table-closed.png' });

  await page.getByPlaceholder('Número de mesa').click();
  await page.evaluate((px) => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(px), KEYBOARD_PX);
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'artifacts/gift-keyboard/table-open.png' });

  const m = await page.evaluate(() => {
    const rect = (el: Element | null) => {
      const r = el?.getBoundingClientRect();
      return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom) } : null;
    };
    const vv = window.visualViewport!;
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input'));
    const table = inputs.find((i) => i.placeholder === 'Número de mesa') ?? null;
    let sheet: HTMLElement | null = table;
    while (sheet && parseFloat(getComputedStyle(sheet).borderTopLeftRadius) < 20) sheet = sheet.parentElement;
    const confirm = Array.from(document.querySelectorAll<HTMLElement>('div, span')).find((el) => el.children.length === 0 && el.innerText === 'Aceptar regalo') ?? null;
    return {
      visibleBottom: Math.round(vv.height + vv.offsetTop),
      sheet: rect(sheet),
      table: rect(table),
      details: rect(inputs.find((i) => i.placeholder.startsWith('Detalles')) ?? null),
      confirm: rect(confirm),
    };
  });
  expect(m.sheet, 'sheet found').not.toBeNull();
  expect(m.sheet!.bottom, 'sheet sits on the keyboard').toBeLessThanOrEqual(m.visibleBottom);
  expect(m.sheet!.bottom, 'sheet is lifted, not floating').toBeGreaterThan(m.visibleBottom - 4);
  expect(m.sheet!.top, 'sheet below the top margin').toBeGreaterThanOrEqual(24);
  for (const [name, box] of Object.entries({ table: m.table, details: m.details, confirm: m.confirm })) {
    expect(box, `${name} found`).not.toBeNull();
    expect(box!.bottom, `${name} above the keyboard`).toBeLessThanOrEqual(m.visibleBottom);
    expect(box!.top, `${name} on screen`).toBeGreaterThanOrEqual(0);
  }

  expect(mock.rpcCalls).not.toContain('gift_offer_respond');
  expect(assertNothingLeaked(mock)).toEqual([]);
  // Opening a conversation marks it read (a PATCH the harness answers itself, so it never reaches Supabase): nothing else is written.
  expect(mock.writes.filter((w) => !/^PATCH \/rest\/v1\/dm_messages$/.test(w))).toEqual([]);
});
