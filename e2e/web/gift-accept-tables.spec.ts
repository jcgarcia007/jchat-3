/**
 * JChat 3.0 — accepting a gift WITHOUT the keyboard (R1): the accept sheet lists the venue's tables as buttons (migration 241).
 * Safari phone profile (WebKit, 390 px) with the saved session. Nothing real is written: the whole games network is simulated
 * (games-mock.ts), `venue_table_labels` answers the Bar XZX tables (T1..T10, deliberately unsorted: the client sorts again),
 * `gift_offer_view` answers a synthetic offer "held" for the signed-in user and the DM list gets one synthetic gift message.
 * "Aceptar regalo" is never pressed.
 *
 * Run: cd e2e && npx playwright test -c web.config.ts web/gift-accept-tables.spec.ts --project=webkit-390
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

const OFFER_ID = '00000000-0000-4000-8000-0000000000a9';
const XZX = ['T1', 'T10', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9'].map((label) => ({ label }));

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

const confirmButton = (page: Page) => page.getByRole('button', { name: /^Aceptar regalo/ });
const noWrites = (writes: string[]) => writes.filter((w) => !/^PATCH \/rest\/v1\/dm_messages$/.test(w));

test('the tables come as a 5-column grid in natural order, nothing is typed and no input is on screen', async ({ page }) => {
  const mock = await openAcceptSheet(page, XZX);
  await expect(page.getByTestId('gift-table-T10')).toBeVisible({ timeout: 10_000 });

  await page.waitForTimeout(800); // the sheet slides in and the grid measures itself once
  const cells = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="gift-table-T"]')).map((el) => {
      const r = el.getBoundingClientRect();
      return { label: el.getAttribute('data-testid')!.replace('gift-table-', ''), top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
    }),
  );
  expect(cells.map((c) => c.label), 'natural order').toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10']);
  expect(new Set(cells.slice(0, 5).map((c) => c.top)).size, 'first row = 5 buttons on one line').toBe(1);
  expect(new Set(cells.slice(5).map((c) => c.top)).size, 'second row = the other 5').toBe(1);
  expect(cells[5].top, 'second row below the first').toBeGreaterThan(cells[0].top);
  for (const c of cells) {
    expect(c.height, `${c.label} height`).toBeGreaterThanOrEqual(48);
    expect(c.width, `${c.label} width`).toBeGreaterThanOrEqual(48);
  }
  expect(cells[1].left - (cells[0].left + cells[0].width), 'gap between buttons').toBe(8);

  // No tap, no table: the button is there but disabled and says plain "Aceptar regalo"; no text field on screen (no keyboard).
  await expect(confirmButton(page)).toHaveText('Aceptar regalo');
  await expect(confirmButton(page)).toHaveAttribute('aria-disabled', 'true');
  expect(await page.locator('input:visible').count(), 'no input visible').toBe(0);
  await page.screenshot({ path: 'artifacts/gift-keyboard/tables-grid.png' });

  await page.getByTestId('gift-table-T7').click();
  await expect(confirmButton(page)).toHaveText('Aceptar regalo · Mesa T7');
  await expect(confirmButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  // The picked table is filled with the brand colour (white text); the others keep the surface colour.
  const fill = (id: string) => page.getByTestId(id).evaluate((el) => getComputedStyle(el).backgroundColor);
  const picked = await fill('gift-table-T7');
  expect(await fill('gift-table-T1'), 'T1 is not filled like T7').not.toBe(picked);
  expect(await fill('gift-table-T10'), 'T10 is not filled like T7').not.toBe(picked);
  expect(await page.getByTestId('gift-table-T7').evaluate((el) => getComputedStyle(el.querySelector('div,span') ?? el).color), 'white text on the picked table').toBe('rgb(255, 255, 255)');
  expect(await page.locator('input:visible').count(), 'still no input visible').toBe(0);
  await page.screenshot({ path: 'artifacts/gift-keyboard/tables-selected.png' });

  expect(mock.rpcCalls).toContain('venue_table_labels');
  expect(mock.rpcCalls).not.toContain('gift_offer_respond');
  expect(assertNothingLeaked(mock)).toEqual([]);
  expect(noWrites(mock.writes)).toEqual([]);
});

test('"Mi mesa no está en la lista" shows the number field (numeric keypad, Done, no autofill) and the optional details', async ({ page }) => {
  const mock = await openAcceptSheet(page, XZX);
  await page.getByTestId('gift-table-T3').click();
  await page.getByTestId('gift-table-not-listed').click();

  const field = page.getByPlaceholder('Número de mesa');
  await expect(field).toBeVisible();
  await expect(field).toHaveAttribute('inputmode', 'numeric');
  await expect(field).toHaveAttribute('enterkeyhint', 'done');
  await expect(field).toHaveAttribute('autocomplete', 'off');
  await expect(page.getByPlaceholder(/Detalles para encontrarte/)).toBeVisible();
  await expect(page.getByTestId('gift-table-T3')).toHaveCount(0); // the grid gives way to the field
  await expect(confirmButton(page)).toHaveAttribute('aria-disabled', 'true'); // the earlier pick does not count any more
  await field.fill('12');
  await expect(confirmButton(page)).toHaveText('Aceptar regalo · Mesa 12');
  await page.screenshot({ path: 'artifacts/gift-keyboard/tables-manual.png' });

  expect(mock.rpcCalls).not.toContain('gift_offer_respond');
  expect(assertNothingLeaked(mock)).toEqual([]);
  expect(noWrites(mock.writes)).toEqual([]);
});

test('a venue with no tables loaded shows the number field straight away, as before', async ({ page }) => {
  const mock = await openAcceptSheet(page, []);
  const field = page.getByPlaceholder('Número de mesa');
  await expect(field).toBeVisible({ timeout: 10_000 });
  await expect(field).toHaveAttribute('inputmode', 'numeric');
  await expect(page.getByTestId('gift-table-not-listed')).toHaveCount(0);
  await expect(confirmButton(page)).toHaveText('Aceptar regalo');
  await expect(confirmButton(page)).toHaveAttribute('aria-disabled', 'true');

  expect(mock.rpcCalls).not.toContain('gift_offer_respond');
  expect(assertNothingLeaked(mock)).toEqual([]);
  expect(noWrites(mock.writes)).toEqual([]);
});
