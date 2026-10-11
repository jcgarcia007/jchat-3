/**
 * JChat 3.0 — Expo Web smoke test.
 *
 * Opens "/", waits for the first screen (the splash is gone and the app rendered), fails on page
 * errors or console errors that mean a native module leaked into the web bundle ("Invariant",
 * "is not a function"), and saves a screenshot per viewport to e2e/artifacts/.
 * No credentials are used: it only checks the unauthenticated start screen.
 */

import { expect, test } from '@playwright/test';

const FATAL_CONSOLE = [/Invariant/i, /is not a function/i, /is not defined/i, /Cannot read propert/i];

test('web bundle boots to the start screen without fatal errors', async ({ page }, testInfo) => {
  const fatal: string[] = [];
  const consoleErrors: string[] = [];

  page.on('pageerror', (err) => fatal.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    consoleErrors.push(text);
    if (FATAL_CONSOLE.some((re) => re.test(text))) fatal.push(`console.error: ${text}`);
  });

  await page.goto('/', { waitUntil: 'load' });

  // The root renders null until the appearance is loaded, then the navigator shows the splash and
  // finally the auth screens: wait for visible text inside #root that is not the splash.
  await page.waitForFunction(
    () => {
      const root = document.getElementById('root');
      return !!root && (root.innerText ?? '').trim().length > 0;
    },
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
  // Let the splash hand over to Welcome / Login.
  await page.waitForTimeout(2500);

  await page.screenshot({ path: `artifacts/start-${testInfo.project.name}.png` });

  if (consoleErrors.length > 0) {
    testInfo.annotations.push({ type: 'console.error', description: consoleErrors.join('\n').slice(0, 2000) });
  }
  expect(fatal, fatal.join('\n')).toEqual([]);
  await expect(page.locator('#root')).not.toBeEmpty();
});

test('desktop viewport shows the centered 480 px column', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280x800', 'only meaningful on the desktop viewport');
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => (document.getElementById('root')?.innerText ?? '').trim().length > 0, undefined, {
    timeout: 30_000,
  });
  await page.waitForTimeout(2500);
  // The first child wide enough to be the app column is 480 px wide and horizontally centered.
  const box = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('#root div'));
    const col = els.find((el) => Math.round(el.getBoundingClientRect().width) === 480);
    if (!col) return null;
    const r = col.getBoundingClientRect();
    return { width: Math.round(r.width), left: Math.round(r.left), right: Math.round(window.innerWidth - r.right) };
  });
  expect(box, 'a 480 px wide column exists').not.toBeNull();
  expect(Math.abs((box?.left ?? 0) - (box?.right ?? 0))).toBeLessThanOrEqual(2);
});
