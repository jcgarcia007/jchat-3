/**
 * JChat 3.0 — Playwright config for the owner-dashboard specs that run against a SIMULATED Supabase.
 *
 * Starts web/fake-supabase.mjs (port 4180) and a local Next production server (port 3102) whose NEXT_PUBLIC_SUPABASE_* point at it, so
 * the dashboard's server-side auth gate and the browser client both talk to the stand-in. Nothing reaches production.
 * Run:  cd e2e && npx playwright test -c dashboard.config.ts
 * If the matching Chromium is not installed, point PLAYWRIGHT_CHROMIUM_PATH at an installed Chromium / chrome-headless-shell.
 */

import { defineConfig } from '@playwright/test';

const FAKE_PORT = 4180;
const NEXT_PORT = 3102;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './web',
  testMatch: /dashboard-.*\.spec\.ts/,
  outputDir: './artifacts/test-results',
  timeout: 120_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${NEXT_PORT}`,
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: [
    {
      command: `node web/fake-supabase.mjs ${FAKE_PORT}`,
      url: `http://127.0.0.1:${FAKE_PORT}/__writes`,
      reuseExistingServer: true,
      timeout: 15_000,
    },
    {
      // A production build, not `next dev`: the dev server kept hot-reloading the page under the test. NEXT_PUBLIC_* is inlined at
      // build time, so the build itself is pointed at the stand-in (it overwrites web/.next, which is generated and git-ignored).
      command: `npm run build && npm run start -- -p ${NEXT_PORT}`,
      cwd: '../web',
      env: {
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${FAKE_PORT}`,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fake-anon-key-for-the-simulated-backend',
      },
      url: `http://127.0.0.1:${NEXT_PORT}/robots.txt`,
      reuseExistingServer: true,
      timeout: 480_000,
    },
  ],
  projects: [
    { name: 'mobile-390x844', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: 'desktop-1280x800', use: { viewport: { width: 1280, height: 800 } } },
  ],
});
