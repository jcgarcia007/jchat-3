/**
 * JChat 3.0 — Match and Truth or Dare on the web (feat/web-games). Needs the saved session (skipped without it).
 * The WHOLE games network is simulated (games-mock.ts): no game request reaches Supabase; every spec asserts that.
 * Run: cd e2e && npx playwright test -c web.config.ts web/games-web.spec.ts   (projects: mobile-390x844, webkit-390)
 *
 *   1. Match with the presence still unconfirmed: the web shows "Escanea el QR del local con la cámara de tu teléfono"
 *      and NO "Escanear el QR del local" button (in Match nor in the chat's games panel); no camera is ever asked for.
 *   2. The Match deck: dragging the top card with the pointer moves it, the page does not scroll, and the card (or an
 *      ancestor) has `touch-action: none` (react-native-gesture-handler's web default for a pan handler).
 *   3. Truth or Dare: the drawn card turns over (3D flip) and its text ends up readable, the front face hidden.
 */
import { expect, test, type Page } from '@playwright/test';
import { assertNothingLeaked, hasSession, messageRecord, mockGamesNetwork, PERSON_ID, ROUND_ID, SESSION, VENUE, watchRealtime } from './games-mock';

test.skip(!hasSession, 'no saved web session (run: npm run web:session)');
test.use({
  storageState: hasSession ? SESSION : undefined,
  locale: 'es-MX',
  geolocation: { latitude: 26.083048, longitude: -80.223725 },
  permissions: ['geolocation'],
});

async function enterChat(page: Page) {
  await page.goto(`/?venue=${VENUE}`, { waitUntil: 'load' });
  const enter = page.getByTestId('chat-enter');
  await enter.waitFor({ state: 'visible', timeout: 30_000 });
  await enter.click();
  await expect(page.getByTestId('chat-more-button')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200);
}

async function openGamesPanel(page: Page) {
  await page.getByLabel('Abrir panel de adjuntos').click();
  await page.getByText('Juegos', { exact: true }).click();
}

const PENDING = { match_check_in: { status: 'pending', reason: 'mocked_location', active_since: null, expires_at: '2099-01-01T00:00:00Z', readings: 1, method: 'geo' } };

test('Match with the presence unconfirmed: no scan button on the web, the new text instead', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __cameraAsked: number }).__cameraAsked = 0;
    const md = navigator.mediaDevices;
    if (md?.getUserMedia) {
      const original = md.getUserMedia.bind(md);
      md.getUserMedia = (c?: MediaStreamConstraints) => {
        (window as unknown as { __cameraAsked: number }).__cameraAsked += 1;
        return original(c);
      };
    }
  });
  const mock = await mockGamesNetwork(page, PENDING);
  await enterChat(page);
  await openGamesPanel(page);

  const text = /Escanea el QR del local con la cámara de tu teléfono/;
  await expect(page.getByText(text).first()).toBeVisible(); // the chat's games panel
  await expect(page.getByText('Escanear el QR del local')).toHaveCount(0);

  await page.getByText('Match', { exact: true }).last().click();
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 }); // the Match screen
  await expect(page.getByText('Escanear el QR del local')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Escanear/i })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/games-web/match-no-scan.png' });

  expect(await page.evaluate(() => (window as unknown as { __cameraAsked: number }).__cameraAsked)).toBe(0);
  expect(assertNothingLeaked(mock)).toEqual([]);
  expect(mock.unknownRpcs).toEqual([]);
  expect(mock.writes).toEqual([]);
});

test('Match deck: the pointer drags the top card, the page does not scroll, touch-action is none', async ({ page }) => {
  const mock = await mockGamesNetwork(page);
  await enterChat(page);
  await openGamesPanel(page);
  await page.getByText('Match', { exact: true }).last().click();
  const card = page.getByLabel(/tarjeta de Match/).last(); // the last rendered card is the top of the stack
  await expect(card).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);

  // The effective touch-action is the intersection of the element's and its ancestors' values: any `none` wins.
  const chain = await card.evaluate((el) => {
    const out: string[] = [];
    for (let n: HTMLElement | null = el as HTMLElement; n; n = n.parentElement) out.push(getComputedStyle(n).touchAction);
    return out;
  });
  const touchAction = chain.includes('none') ? 'none' : chain.find((v) => v !== 'auto') ?? 'auto';
  expect(touchAction, 'the card (or an ancestor) must not let the page pan').toBe('none');

  const before = await card.boundingBox();
  expect(before).not.toBeNull();
  const x = before!.x + before!.width / 2;
  const y = before!.y + before!.height / 2;
  const scrollBefore = await page.evaluate(() => ({ y: window.scrollY, de: document.scrollingElement?.scrollTop ?? 0 }));

  await page.mouse.move(x, y);
  await page.mouse.down();
  // A vertical component too: with touch-action: auto this is what would scroll the page.
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + i * 6, y - i * 8, { steps: 2 });
  const during = await card.boundingBox();
  expect(Math.abs(during!.x - before!.x) + Math.abs(during!.y - before!.y), 'the card follows the pointer').toBeGreaterThan(20);
  const scrollDuring = await page.evaluate(() => ({ y: window.scrollY, de: document.scrollingElement?.scrollTop ?? 0 }));
  expect(scrollDuring).toEqual(scrollBefore);
  await page.screenshot({ path: 'artifacts/games-web/match-drag.png' });
  // Settle (tiny slow moves, so the release has no flick velocity) well below the commit threshold (40% of the width).
  for (let i = 0; i < 6; i++) { await page.mouse.move(x + 48 + (i % 2), y - 64); await page.waitForTimeout(70); }
  await page.mouse.up();
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'artifacts/games-web/match-after-release.png' });
  // A drag must not open the profile (it used to: the release counted as a tap on the card).
  await expect(page.getByText('Ver perfil completo en JChat')).toHaveCount(0);
  expect(mock.rpcCalls).not.toContain('match_get_profile');

  expect(mock.rpcCalls).not.toContain('match_swipe');
  expect(assertNothingLeaked(mock)).toEqual([]);
  expect(mock.unknownRpcs).toEqual([]);
  expect(mock.writes).toEqual([]);
});

test('Truth or Dare: the drawn card turns over and its text is readable (front face hidden)', async ({ page }) => {
  const injector = await watchRealtime(page);
  const mock = await mockGamesNetwork(page);
  await enterChat(page);
  await expect.poll(() => injector() !== null, { timeout: 15_000 }).toBe(true);
  const roomId = page.url().match(/room\/([0-9a-f-]{36})/i)?.[1] ?? '00000000-0000-4000-8000-0000000000f1';
  injector()!.send(messageRecord(roomId, PERSON_ID, {
    type: 'tod_round',
    metadata: { round_id: ROUND_ID, category: 'classic', official: false, expires_at: '2099-01-01T00:00:00Z', status: 'active', plays: 0 },
  }));
  const play = page.getByRole('button', { name: /Verdad/ }).first();
  await expect(play).toBeVisible({ timeout: 10_000 });
  await play.click();

  const body = page.getByText('Pregunta sintética de prueba para el giro de la carta');
  await expect(body).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1500); // the flip lasts well under a second
  await page.screenshot({ path: 'artifacts/games-web/tod-card.png' });

  // Readable: the text sits inside the viewport, not mirrored, and the element on top at its centre is the text itself
  // (a visible front face would cover it; backface-visibility: hidden has to hide it).
  const check = await body.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    let mirrored = false;
    for (let n: HTMLElement | null = el as HTMLElement; n; n = n.parentElement) {
      const t = getComputedStyle(n).transform;
      if (t && t !== 'none') {
        const m = new DOMMatrix(t);
        if (m.m11 < 0 || m.a < 0) mirrored = true; // a net mirror (rotateY past 90°) would flip the text
      }
    }
    return { inside: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight, onTop: top === el || el.contains(top), mirrored, width: r.width };
  });
  expect(check.inside).toBe(true);
  expect(check.onTop, 'the front face must not cover the answer').toBe(true);
  expect(check.mirrored, 'the answer is not mirrored').toBe(false);
  expect(check.width).toBeGreaterThan(80);

  expect(mock.rpcCalls).toContain('tod_draw');
  expect(assertNothingLeaked(mock)).toEqual([]);
  expect(mock.writes).toEqual([]);
});

test('self-check: a stray write to Supabase (an Edge Function call here) is aborted and reported, never sent', async ({ page }) => {
  const mock = await mockGamesNetwork(page);
  await page.goto('/', { waitUntil: 'load' });
  const outcome = await page.evaluate(() =>
    fetch('https://synthetic-self-check.supabase.co/functions/v1/some-function', { method: 'POST', body: '{}' }).then(() => 'sent', () => 'aborted'),
  );
  expect(outcome).toBe('aborted');
  expect(assertNothingLeaked(mock)).not.toEqual([]); // the guard saw it
  // …and a write the simulation answers is NOT a leak: it is answered locally.
  const answered = await page.evaluate(() =>
    fetch('https://synthetic-self-check.supabase.co/rest/v1/rpc/match_swipe', { method: 'POST', body: '{}' }).then((r) => r.status),
  );
  expect(answered).toBe(200);
});
