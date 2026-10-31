/**
 * JChat 3.0 — skeleton screens on the web (Messages): hermetic, nothing leaves 127.0.0.1 (local/hermetic.ts).
 *
 *   slow first load   → after 200 ms the skeleton shows (6 conversation rows + 4 notification rows), ONE "Loading…" progressbar for screen readers,
 *                       the bones pulse; when the data arrives the skeleton is gone
 *   fast first load   → a load that ends before 200 ms never shows a skeleton (no flash)
 *   reduce motion     → the bones stay still at a fixed opacity
 *
 * The slow load is a gate on the REST reads that starts when the person taps "Messages" (the home needs its own reads first).
 * Run: cd e2e && npx playwright test -c local.config.ts local/skeleton.spec.ts
 * The slow-load test also saves the capture docs/audits/2026-10-30/skeleton-web.png.
 */
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { baseOptions } from './fixtures';
import { API, hermetic, signInSynthetic } from './hermetic';

test.use({ locale: 'es-MX' });

const CAPTURE = path.resolve(__dirname, '..', '..', 'docs', 'audits', '2026-10-30', 'skeleton-web.png');

/** Signs in, installs the harness and lands on the web home; `hold()` holds every REST read (and RPC) from the moment it is called until `release()`. */
async function setup(page: Page) {
  await hermetic(page, baseOptions());
  await signInSynthetic(page);
  let held = false;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  // Registered after the harness, so it runs first and hands the request on (`fallback`) once the gate opens.
  await page.route(`${API}/rest/v1/**`, async (route) => {
    if (held) await gate;
    await route.fallback();
  });
  await page.goto('/', { waitUntil: 'load' });
  const messages = page.getByTestId('web-open-messages');
  await messages.waitFor({ state: 'visible', timeout: 30_000 });
  return { messages, hold: () => { held = true; }, release };
}

const bone = (page: Page) => page.getByTestId('dm-list-skeleton').locator('[aria-hidden="true"]').first();
const opacityOf = (page: Page) => bone(page).evaluate((el) => Number(getComputedStyle(el).opacity));

test('slow first load: the skeleton shows after 200 ms (one "Cargando…" for screen readers), pulses, and is gone when the data arrives', async ({ page }) => {
  const { messages, hold, release } = await setup(page);
  hold();
  await messages.click();

  const conversations = page.getByTestId('dm-list-skeleton');
  await expect(conversations).toBeVisible({ timeout: 10_000 });
  await expect(conversations).toHaveAttribute('role', 'progressbar');
  await expect(conversations).toHaveAttribute('aria-label', 'Cargando…');
  await expect(page.getByTestId('notifications-skeleton')).toBeVisible();
  await expect(page.getByTestId('notifications-skeleton')).not.toHaveAttribute('role', 'progressbar'); // the second group is silent: announced once
  await expect(page.getByTestId('notifications-skeleton')).toHaveAttribute('aria-hidden', 'true');
  expect(await conversations.locator('[aria-hidden="true"]').count()).toBeGreaterThanOrEqual(12); // the bones are hidden from screen readers

  // The shared pulse: the bones' opacity moves between 1 and 0.45 (sampled over a bit more than one cycle).
  const samples: number[] = [];
  for (let i = 0; i < 8; i++) {
    samples.push(await opacityOf(page));
    await page.waitForTimeout(180);
  }
  expect(Math.min(...samples), `opacity samples ${samples.join(', ')}`).toBeLessThan(0.9);
  expect(Math.max(...samples)).toBeGreaterThan(Math.min(...samples) + 0.1);

  await page.screenshot({ path: CAPTURE });

  release();
  await expect(conversations).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId('notifications-skeleton')).toHaveCount(0);
});

test('fast first load: a load shorter than 200 ms never shows a skeleton', async ({ page }) => {
  const { messages } = await setup(page);
  await messages.click(); // no gate: the harness answers at once
  await page.waitForTimeout(900);
  await expect(page.getByTestId('dm-list-skeleton')).toHaveCount(0);
  await expect(page.getByTestId('notifications-skeleton')).toHaveCount(0);
});

test('reduce motion: the bones stay still at a fixed opacity (0.7)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { messages, hold, release } = await setup(page);
  hold();
  await messages.click();
  await expect(page.getByTestId('dm-list-skeleton')).toBeVisible({ timeout: 10_000 });
  const samples: number[] = [];
  for (let i = 0; i < 6; i++) {
    samples.push(await opacityOf(page));
    await page.waitForTimeout(250);
  }
  expect(new Set(samples.map((value) => value.toFixed(2))).size, `still: ${samples.join(', ')}`).toBe(1);
  expect(samples[0]).toBeCloseTo(0.7, 1);
  release();
});
