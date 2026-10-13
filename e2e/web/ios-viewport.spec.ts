/**
 * JChat 3.0 — the web app fits an iPhone in Safari (WebKit, devices['iPhone 15'], 393 px).
 *
 * Symptoms (Juan's iPhone): the page was wider than the screen after typing in the chat, the chat top bar scrolled
 * out of view and the status bar stayed brand blue. Checked here:
 *   - no text field under 16 px (iOS zooms the page on focus below that) — anonymous screens and the chat;
 *   - focus + type "Hola" (nothing is sent) + blur: scrollWidth <= innerWidth, scrollY === 0, visualViewport.scale
 *     === 1, the chat top bar still on screen;
 *   - a keyboard-sized viewport keeps the top bar visible and the input fully above the bottom edge;
 *   - the document itself can't scroll (html/body fixed, overflow hidden);
 *   - theme-color is not the fixed brand blue and, in the chat, equals the top bar background.
 * Real iOS keyboard behaviour (the visual viewport panning) can't be produced by Playwright's WebKit: that part is a
 * manual check on a phone. Run:  cd e2e && npx playwright test -c web.config.ts web/ios-viewport.spec.ts
 * Needs WebKit (npx playwright install webkit) and the saved session for the chat tests. Nothing is sent or changed.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const SESSION = path.resolve(__dirname, '..', '.auth', 'web-session.json');
const VENUE = 'bar-xzx-omd2';
const BRAND_BLUE = '#5c7cfa';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-webkit', 'WebKit iPhone project only');
});

async function ready(page: Page) {
  await page.waitForFunction(() => (document.getElementById('root')?.innerText ?? '').trim().length > 0, undefined, { timeout: 30_000 });
}

const fieldSizes = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('input, textarea'))
      .filter((el) => el.getBoundingClientRect().width > 0 && !['checkbox', 'radio', 'hidden'].includes((el as HTMLInputElement).type))
      .map((el) => ({ label: el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.tagName, px: parseFloat(getComputedStyle(el).fontSize) })),
  );

const metrics = (page: Page) =>
  page.evaluate(() => {
    const de = document.documentElement;
    const bar = document.querySelector('[data-testid="chat-more-button"]')?.getBoundingClientRect();
    return {
      scrollW: de.scrollWidth,
      innerW: window.innerWidth,
      scrollY: window.scrollY,
      scale: window.visualViewport?.scale ?? 1,
      barTop: bar ? Math.round(bar.top) : null,
      barBottom: bar ? Math.round(bar.bottom) : null,
    };
  });

test.describe('anonymous screens', () => {
  test.use({ storageState: { cookies: [], origins: [] }, locale: 'en-US' });

  test('every text field is >= 16 px (login, forgot password, register)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await ready(page);
    await page.getByRole('button', { name: /^Log in$/ }).first().click();
    await page.getByRole('button', { name: /Continue with email/ }).first().click();
    const seen: { label: string; px: number }[] = [...(await fieldSizes(page))];
    await page.getByRole('button', { name: /Forgot/ }).first().click();
    seen.push(...(await fieldSizes(page)));
    await page.goBack();
    await page.getByRole('button', { name: /Create account/ }).first().click();
    await page.waitForTimeout(800);
    seen.push(...(await fieldSizes(page)));
    expect(seen.length, 'fields found').toBeGreaterThanOrEqual(5);
    expect(seen.filter((f) => f.px < 16), 'fields under 16 px').toEqual([]);
  });

  test('theme-color is not the fixed brand blue', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await ready(page);
    await page.waitForTimeout(1000);
    const color = await page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? '');
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(color.toLowerCase()).not.toBe(BRAND_BLUE);
  });
});

test.describe('chat (saved session)', () => {
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

  test('focus, type "Hola" (not sent), blur: no zoom, no scroll, top bar on screen', async ({ page }, testInfo) => {
    await openChat(page);
    const field = page.getByPlaceholder(/Message|Mensaje/).first();
    expect((await fieldSizes(page)).filter((f) => f.px < 16), 'chat fields under 16 px').toEqual([]);

    await field.click();
    await page.keyboard.type('Hola');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `artifacts/ios-viewport/${process.env.IOS_SHOT_TAG ?? 'after'}-webkit-390-typing.png` });
    for (const phase of ['typing', 'blurred']) {
      if (phase === 'blurred') {
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await page.waitForTimeout(500);
      }
      const m = await metrics(page);
      testInfo.annotations.push({ type: phase, description: JSON.stringify(m) });
      expect(m.scrollW, `${phase}: wider than the screen`).toBeLessThanOrEqual(m.innerW);
      expect(m.scrollY, `${phase}: the document scrolled`).toBe(0);
      expect(m.scale, `${phase}: zoomed`).toBe(1);
      expect(m.barTop, `${phase}: chat top bar off screen`).toBeGreaterThanOrEqual(0);
    }
    await expect(field).toHaveValue('Hola'); // typed, never sent
  });

  test('a keyboard-sized viewport keeps the top bar visible and the input above the bottom edge', async ({ page }) => {
    await openChat(page);
    const field = page.getByPlaceholder(/Message|Mensaje/).first();
    await field.click();
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.width, height: size.height - 336 }); // an on-screen keyboard's height
    await page.waitForTimeout(800);
    const m = await metrics(page);
    const input = await field.boundingBox();
    expect(m.scrollY).toBe(0);
    expect(m.barTop, 'top bar visible').toBeGreaterThanOrEqual(0);
    expect(input!.y + input!.height, 'input fully above the keyboard').toBeLessThanOrEqual(size.height - 336 + 1);
    await page.screenshot({ path: `artifacts/ios-viewport/${process.env.IOS_SHOT_TAG ?? 'after'}-webkit-390-keyboard.png` });
  });

  test('the document cannot scroll and theme-color follows the chat top bar', async ({ page }) => {
    await openChat(page);
    const fixed = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).overflow,
      body: getComputedStyle(document.body).overflow,
      pos: getComputedStyle(document.body).position,
      overscroll: getComputedStyle(document.body).overscrollBehaviorY,
    }));
    expect(fixed).toEqual({ html: 'hidden', body: 'hidden', pos: 'fixed', overscroll: 'none' });
    await page.evaluate(() => window.scrollTo(0, 500));
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    const { meta, bar } = await page.evaluate(() => {
      const hex = (rgb: string) => '#' + (rgb.match(/\d+/g) ?? []).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
      let el: HTMLElement | null = document.querySelector('[data-testid="chat-more-button"]');
      while (el && /rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(el).backgroundColor)) el = el.parentElement;
      return {
        meta: (document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? '').toLowerCase(),
        bar: el ? hex(getComputedStyle(el).backgroundColor) : '',
      };
    });
    expect(meta).not.toBe(BRAND_BLUE);
    expect(meta).toBe(bar);
  });
});
