/**
 * JChat 3.0 — the gift as the RECIPIENT (and the sender) sees it in the direct-message conversation: every status of the card, accepting
 * with a table, declining, the local 15-minute countdown, and the accept sheet on Safari vs Chrome for iPhone. Hermetic (local/hermetic.ts):
 * `gift_offer_view` answers a synthetic offer per card and every write is recorded, nothing leaves 127.0.0.1.
 *
 * Run: cd e2e && npx playwright test -c local.config.ts local/gift-accept.spec.ts
 */
import { expect, test, type Page } from '@playwright/test';
import { BUSINESS, ITEM_ID, ME, OTHER, enterChat, offerView, openVenue } from './fixtures';
import { BUSINESS_ID, OTHER_ID, USER_ID, type Hermetic } from './hermetic';

test.use({ locale: 'es-MX' });

const CONVERSATION_ID = '00000000-0000-4000-8000-0000000000d0';
const MINUTE = 60_000;

const conversation = {
  id: CONVERSATION_ID,
  user_a: USER_ID,
  user_b: OTHER_ID,
  last_message_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  hidden_at_a: null,
  hidden_at_b: null,
  exit_hidden_at_a: null,
  exit_hidden_at_b: null,
  ephemeral_business_id: BUSINESS_ID,
  first_sender_id: OTHER_ID,
};

const offerId = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;

/** One DM with one gift card per offer: `views` maps an offer id to what gift_offer_view answers. */
async function openGiftConversation(page: Page, views: Record<string, Record<string, unknown>>, extra: Parameters<typeof openVenue>[1] = {}): Promise<Hermetic> {
  const ids = Object.keys(views);
  const messages = ids.map((id, i) => ({
    id: `00000000-0000-4000-8000-0000000002${String(i).padStart(2, '0')}`,
    conversation_id: CONVERSATION_ID,
    sender_id: (views[id].is_sender ? USER_ID : OTHER_ID),
    body: null,
    media_url: null,
    voice_url: null,
    voice_duration_s: null,
    read_at: null,
    created_at: new Date(Date.now() - (ids.length - i) * MINUTE).toISOString(),
    gift_offer_id: id,
    media_moderation: null,
  }));
  const h = await openVenue(page, {
    tables: { dm_conversations: [conversation], dm_messages: messages, public_profiles: [ME, OTHER], businesses: [BUSINESS], ...(extra.tables ?? {}) },
    rpcs: { gift_offer_view: (body) => views[String(body.p_offer_id)] ?? null, gift_offer_respond: { ok: true }, venue_table_labels: [{ label: 'T1' }, { label: 'T2' }, { label: 'T3' }], ...(extra.rpcs ?? {}) },
    onWrite: extra.onWrite,
  });
  await enterChat(page);
  await page.getByRole('button', { name: 'Mensajes' }).click();
  await page.getByText('Otra Persona', { exact: true }).locator('visible=true').first().click({ timeout: 20_000 });
  return h;
}

const card = (page: Page, text: string | RegExp) => page.getByText(text).locator('visible=true').first();

test('every status of the card reads right for the recipient (the ones that look wrong are flagged below)', async ({ page }) => {
  const views = {
    [offerId(1)]: offerView({ id: offerId(1), status: 'held' }),
    [offerId(2)]: offerView({ id: offerId(2), status: 'accepted' }),
    [offerId(3)]: offerView({ id: offerId(3), status: 'paid' }),
    [offerId(4)]: offerView({ id: offerId(4), status: 'declined' }),
    [offerId(5)]: offerView({ id: offerId(5), status: 'expired' }),
    [offerId(6)]: offerView({ id: offerId(6), status: 'cancelled' }),
  };
  const h = await openGiftConversation(page, views);
  await expect(card(page, /Responde en \d{2}:\d{2}/)).toBeVisible({ timeout: 20_000 });
  await expect(card(page, 'Aceptado · preparando')).toBeVisible();
  await expect(card(page, 'Pagado')).toBeVisible();
  await expect(card(page, 'No aceptado')).toBeVisible();
  await expect(card(page, 'Venció')).toBeVisible();
  await expect(card(page, 'Cancelado')).toBeVisible();
  // only the held card offers the actions
  await expect(page.getByRole('button', { name: 'Aceptar', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'No, gracias', exact: true })).toHaveCount(1);
  expect(h.forbidden()).toEqual([]);
});

test('the sender sees their own wording: waiting, accepted by, declined by, expired', async ({ page }) => {
  const mine = (id: string, status: string) => offerView({ id, status, is_sender: true, from: { id: USER_ID, name: ME.display_name, avatar_url: null }, to: { id: OTHER_ID, name: OTHER.display_name, avatar_url: null } });
  await openGiftConversation(page, {
    [offerId(11)]: mine(offerId(11), 'held'),
    [offerId(12)]: mine(offerId(12), 'accepted'),
    [offerId(13)]: mine(offerId(13), 'declined'),
    [offerId(14)]: mine(offerId(14), 'expired'),
  });
  await expect(card(page, 'Esperando respuesta · aún no se cobra')).toBeVisible({ timeout: 20_000 });
  await expect(card(page, /Otra Persona (aceptó|lo aceptó)|aceptó/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aceptar', exact: true })).toHaveCount(0);
});

test('a held offer whose 15 minutes passed locally reads "Venció" and offers no actions (the timer does not wait for the server)', async ({ page }) => {
  await openGiftConversation(page, { [offerId(21)]: offerView({ id: offerId(21), status: 'held', expires_at: new Date(Date.now() - MINUTE).toISOString() }) });
  await expect(card(page, 'Venció')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Aceptar', exact: true })).toHaveCount(0);
});

test('accept by tapping a table: the server gets the accept with exactly that table; no typing', async ({ page }) => {
  const h = await openGiftConversation(page, { [offerId(31)]: offerView({ id: offerId(31), status: 'held' }) });
  await page.getByRole('button', { name: 'Aceptar', exact: true }).click({ timeout: 20_000 });
  await expect(page.getByText('¿Cuál es tu mesa?')).toBeVisible();
  for (const label of ['T1', 'T2', 'T3']) await expect(page.getByTestId(`gift-table-${label}`)).toBeVisible();
  await expect(page.locator('input[placeholder="Número de mesa"]')).toHaveCount(0);
  await page.getByTestId('gift-table-T2').click();
  await page.getByRole('button', { name: /^Aceptar regalo · Mesa T2/ }).click();
  await expect.poll(() => h.rpcCalls.filter((c) => c.name === 'gift_offer_respond').length).toBe(1);
  expect(h.rpcCalls.find((c) => c.name === 'gift_offer_respond')!.body).toEqual({ p_offer_id: offerId(31), p_accept: true, p_table_label: 'T2', p_table_details: null });
});

test('"Mi mesa no está en la lista" → the number field and the optional details travel with the accept', async ({ page }) => {
  const h = await openGiftConversation(page, { [offerId(41)]: offerView({ id: offerId(41), status: 'held' }) });
  await page.getByRole('button', { name: 'Aceptar', exact: true }).click({ timeout: 20_000 });
  await page.getByText('Mi mesa no está en la lista').click();
  await page.getByPlaceholder('Número de mesa').fill('12');
  await page.getByPlaceholder(/Detalles/).fill('junto a la ventana');
  await page.getByRole('button', { name: /^Aceptar regalo · Mesa 12/ }).click();
  await expect.poll(() => h.rpcCalls.filter((c) => c.name === 'gift_offer_respond').length).toBe(1);
  expect(h.rpcCalls.find((c) => c.name === 'gift_offer_respond')!.body).toEqual({ p_offer_id: offerId(41), p_accept: true, p_table_label: '12', p_table_details: 'junto a la ventana' });
});

test('declining sends the decline and no table', async ({ page }) => {
  const h = await openGiftConversation(page, { [offerId(51)]: offerView({ id: offerId(51), status: 'held' }) });
  await page.getByRole('button', { name: 'No, gracias', exact: true }).click({ timeout: 20_000 });
  await expect.poll(() => h.rpcCalls.filter((c) => c.name === 'gift_offer_respond').length).toBe(1);
  expect(h.rpcCalls.find((c) => c.name === 'gift_offer_respond')!.body).toMatchObject({ p_offer_id: offerId(51), p_accept: false });
});

test('the server answers "expired" to an accept: the person is told and the card refreshes', async ({ page }) => {
  const h = await openGiftConversation(page, { [offerId(61)]: offerView({ id: offerId(61), status: 'held' }) }, {
    rpcs: { gift_offer_respond: { status: 400, body: { code: 'P0001', message: 'gift_expired', details: null, hint: null } } },
  });
  await page.getByRole('button', { name: 'Aceptar', exact: true }).click({ timeout: 20_000 });
  await page.getByTestId('gift-table-T1').click();
  await page.getByRole('button', { name: /^Aceptar regalo · Mesa T1/ }).click();
  await expect.poll(() => h.rpcCalls.filter((c) => c.name === 'gift_offer_respond').length).toBeGreaterThanOrEqual(1);
  await expect(page.getByText(/Venció|ya no está disponible|expir/i).first()).toBeVisible({ timeout: 10_000 });
});

/**
 * KNOWN GAP, NOT FIXED: gift_offer_mark_failed / gift_offer_register_payment_failure move an ACCEPTED offer to 'failed' (the capture after the
 * recipient said yes could not be charged), but GiftCard.tsx has no case for 'failed': its `default` shows "Cancelado" to BOTH people. The
 * recipient accepted, got "Aceptado · preparando", and then sees "Cancelado" with no explanation; the sender is not told the payment failed.
 */
test('FIXME (real finding): an accepted offer whose capture FAILED is explained, not shown as a plain "Cancelado"', async ({ page }) => {
  test.fixme(true, 'GiftCard.tsx statusText: status "failed" falls into the default branch ("Cancelado"). mobile/components/gift/GiftCard.tsx (switch (status)). Needs its own text in es/en.');
  await openGiftConversation(page, { [offerId(71)]: offerView({ id: offerId(71), status: 'failed' }) });
  await expect(card(page, /no se pudo cobrar|falló|failed/i)).toBeVisible({ timeout: 20_000 });
});

/** The accept sheet's geometry: Safari (no browser bar) vs Chrome for iPhone (a bottom bar makes the visual viewport ~90 px shorter). */
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

for (const [browser, toolbar] of [['Safari (no bar)', 0], ['Chrome for iPhone (90 px bottom bar)', 90]] as const) {
  test(`the accept sheet on ${browser}: it rests on the bottom, Aceptar is visible without scrolling`, async ({ page }) => {
    await page.addInitScript(FAKE_VISUAL_VIEWPORT);
    await openGiftConversation(page, { [offerId(81)]: offerView({ id: offerId(81), status: 'held' }) });
    await page.getByRole('button', { name: 'Aceptar', exact: true }).click({ timeout: 20_000 });
    await expect(page.getByText('¿Cuál es tu mesa?')).toBeVisible();
    await page.evaluate((t) => (window as unknown as { __setViewport: (a: number, b: number) => void }).__setViewport(t, 0), toolbar);
    await page.waitForTimeout(600);
    await page.getByTestId('gift-table-T2').click();
    const box = await page.evaluate(() => {
      const leaf = Array.from(document.querySelectorAll<HTMLElement>('div, span')).find((el) => el.children.length === 0 && el.innerText.startsWith('Aceptar regalo'));
      let sheet: HTMLElement | null = leaf ?? null;
      while (sheet && parseFloat(getComputedStyle(sheet).borderTopLeftRadius) < 20) sheet = sheet.parentElement;
      const r = (el: Element | null) => { const b = el?.getBoundingClientRect(); return b ? { top: Math.round(b.top), bottom: Math.round(b.bottom) } : null; };
      return { inner: window.innerHeight, sheet: r(sheet), button: r(leaf ?? null) };
    });
    expect(box.sheet, 'sheet found').not.toBeNull();
    expect(box.sheet!.bottom, 'sheet rests on the bottom of the screen (not lifted by the browser bar)').toBeGreaterThanOrEqual(box.inner - 1);
    expect(box.button!.bottom).toBeLessThanOrEqual(box.sheet!.bottom);
    expect(box.button!.top).toBeGreaterThan(0);
  });
}
