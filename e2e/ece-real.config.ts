/**
 * JChat 3.0 — Playwright config for the REAL-Stripe.js probe of the Express Checkout Element (e2e/real/ece-real-stripe.spec.ts).
 *
 * OPT-IN (ECE_REAL=1). Unlike e2e/local (hermetic: every non-local request is blocked) this one DOES load https://js.stripe.com/v3/ and
 * talks to Stripe's public endpoints, but only with the PUBLISHABLE test key (pk_test_…) in a deferred Elements: no secret key, no
 * PaymentIntent, nothing is charged. The page is served by the same static server as the other local specs (any path works there; the
 * spec answers /__ece-probe.html itself).
 *
 * Run:  cd e2e && ECE_REAL=1 npx playwright test -c ece-real.config.ts
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = 4175;
// If the Chromium revision that matches @playwright/test is not installed, point PLAYWRIGHT_CHROMIUM_PATH at an installed chrome-headless-shell.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './real',
  testMatch: /.*\.spec\.ts/,
  outputDir: './artifacts/ece-real-results',
  timeout: 90_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: `node web/serve-dist.mjs ./dist-web-local ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    { name: 'webkit-390', use: { ...devices['iPhone 15'], viewport: { width: 390, height: 844 } } },
    { name: 'chromium-390', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, launchOptions: executablePath ? { executablePath } : {} } },
  ],
});
