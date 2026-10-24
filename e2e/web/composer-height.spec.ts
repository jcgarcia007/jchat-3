/**
 * JChat 3.0 — the message box of the venue chat on the web (Safari on iPhone: WebKit, devices['iPhone 15']).
 *
 * Symptom (Juan's iPhone): the empty "Mensaje…" box was ~60 px tall and the round buttons next to it (+, camera, mic) ~46 px; in the
 * native app they match. Cause: a multiline react-native-web TextInput is a <textarea> and, with no `rows`, the browser makes it 2
 * rows tall; the 16 px font floor (utils/webInputFontFloor.web.ts) does not touch the line height or the padding.
 *
 * Contract checked here (the floor stays at 16 px, so iOS never zooms):
 *   - the EMPTY box is exactly as tall as the round button next to it;
 *   - one line of text keeps that height;
 *   - five lines grow the box up to the app's maximum (120 px, like the native maxHeight) and then it scrolls inside;
 *   - clearing the text brings it back to the button height.
 * Needs the saved session (e2e/.auth/web-session.json): skipped without it. NOTHING is sent: text is typed and deleted.
 * Run:  cd e2e && npx playwright test -c web.config.ts web/composer-height.spec.ts --project=iphone-webkit
 * Screenshots (empty / 1 line / 5 lines) go to e2e/artifacts/composer-height/ (tag them with COMPOSER_SHOT_TAG=before|after).
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const SESSION = path.resolve(__dirname, '..', '.auth', 'web-session.json');
const VENUE = 'bar-xzx-omd2';
const BUTTON_PX = 44; // barStyles.iconBtn in components/chat/ChatInput.tsx
const MAX_PX = 120; // barStyles.input.maxHeight (the native maximum)
const TAG = process.env.COMPOSER_SHOT_TAG ?? 'after';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-webkit', 'WebKit iPhone project only');
});
test.skip(!existsSync(SESSION), 'no saved web session (run: npm run web:session)');
test.use({
  storageState: existsSync(SESSION) ? SESSION : undefined,
  locale: 'en-US',
  geolocation: { latitude: 26.083048, longitude: -80.223725 },
  permissions: ['geolocation'],
});

async function openChat(page: Page) {
  await page.goto(`/?venue=${VENUE}`, { waitUntil: 'load' });
  await page.getByTestId('chat-enter').click({ timeout: 30_000 });
  await expect(page.getByTestId('chat-more-button')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200);
}

/** The box, and the round buttons that share its row. */
const measure = (page: Page) =>
  page.evaluate(() => {
    const box = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea')).find((el) => /Message|Mensaje/.test(el.placeholder));
    if (!box) return null;
    let row: HTMLElement | null = box.parentElement;
    while (row && row.querySelectorAll('[role="button"]').length === 0) row = row.parentElement;
    const css = getComputedStyle(box);
    const buttons = Array.from(row?.querySelectorAll<HTMLElement>('[role="button"]') ?? []).map((b) => Math.round(b.getBoundingClientRect().height * 100) / 100);
    return {
      boxPx: Math.round(box.getBoundingClientRect().height * 100) / 100,
      scrollHeight: box.scrollHeight,
      clientHeight: box.clientHeight,
      rowsAttr: box.getAttribute('rows'),
      fontPx: parseFloat(css.fontSize),
      lineHeight: css.lineHeight,
      paddingTop: css.paddingTop,
      paddingBottom: css.paddingBottom,
      overflowY: css.overflowY,
      buttons,
    };
  });

test('the empty box is as tall as the round buttons; it grows to 120 px and scrolls; it comes back', async ({ page }, testInfo) => {
  await openChat(page);
  const field = page.getByPlaceholder(/Message|Mensaje/).first();
  const shot = (name: string) => page.screenshot({ path: `artifacts/composer-height/${TAG}-${name}.png` });

  const empty = await measure(page);
  testInfo.annotations.push({ type: 'empty', description: JSON.stringify(empty) });
  expect(empty, 'the message box was found').not.toBeNull();
  expect(empty!.buttons.length, 'round buttons beside the box').toBeGreaterThanOrEqual(2);
  expect(empty!.fontPx, 'the 16 px floor stays (iOS zooms below it)').toBeGreaterThanOrEqual(16);
  await shot('1-empty');
  for (const px of empty!.buttons) expect(px, 'a round button').toBe(BUTTON_PX);
  expect(empty!.boxPx, 'EMPTY box = button height').toBe(BUTTON_PX);

  await field.click();
  await page.keyboard.type('Hola, esto es una linea');
  await page.waitForTimeout(300);
  const one = await measure(page);
  testInfo.annotations.push({ type: 'one line', description: JSON.stringify(one) });
  await shot('2-one-line');
  expect(one!.boxPx, 'one line keeps the button height').toBe(BUTTON_PX);

  await field.fill(''); // (Control+A is not "select all" in WebKit on a Mac)
  await page.keyboard.type('uno\ndos\ntres\ncuatro\ncinco');
  await page.waitForTimeout(300);
  const five = await measure(page);
  testInfo.annotations.push({ type: 'five lines', description: JSON.stringify(five) });
  await shot('3-five-lines');
  expect(five!.boxPx, 'five lines grow the box').toBeGreaterThan(BUTTON_PX + 20);
  expect(five!.boxPx, 'but never past the app maximum').toBeLessThanOrEqual(MAX_PX);
  expect(five!.scrollHeight, 'the text is taller than the box → it scrolls inside').toBeGreaterThanOrEqual(five!.clientHeight);

  await field.fill('');
  await page.waitForTimeout(300);
  const back = await measure(page);
  testInfo.annotations.push({ type: 'cleared', description: JSON.stringify(back) });
  expect(back!.boxPx, 'cleared → back to the button height').toBe(BUTTON_PX);
  await expect(field).toHaveValue(''); // typed and deleted, never sent
});
