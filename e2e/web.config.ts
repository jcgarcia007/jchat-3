/**
 * JChat 3.0 — Playwright config for the Expo Web smoke test.
 *
 * Serves the static export (`cd mobile && npx expo export -p web --output-dir dist-web`) with
 * web/serve-dist.mjs (SPA fallback) and runs two projects: a phone viewport (390×844, touch) and a
 * desktop viewport (1280×800, where WebFrame shows the centered column).
 *
 * Run:  cd e2e && npm install && npm run web
 * If the Chromium revision that matches @playwright/test is not installed, point
 * PLAYWRIGHT_CHROMIUM_PATH at an installed Chromium / chrome-headless-shell binary.
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './web',
  testMatch: /.*\.spec\.ts/,
  outputDir: './artifacts/test-results',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    launchOptions: executablePath ? { executablePath } : {},
  },
  // npm run web:audit exports the app into dist-web-audit with the menu pointed at a LOCAL Next (port 3100) and starts
  // both; the regular smoke run serves dist-web only.
  webServer: [
    {
      command: `node web/serve-dist.mjs ../mobile/${process.env.WEB_AUDIT ? 'dist-web-audit' : 'dist-web'} ${PORT}`,
      url: `http://127.0.0.1:${PORT}/`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    ...(process.env.WEB_AUDIT || process.env.WEB_NEXT
      ? [
          {
            command: 'npm run dev -- -p 3100',
            cwd: '../web',
            url: 'http://127.0.0.1:3100/robots.txt',
            reuseExistingServer: true,
            timeout: 120_000,
          },
        ]
      : []),
  ],
  projects: [
    {
      name: 'mobile-390x844',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
    {
      name: 'desktop-1280x800',
      use: { viewport: { width: 1280, height: 800 } },
    },
    // Safari on iPhone: WebKit with the iPhone 15 profile (npx playwright install webkit). Only the iOS viewport spec.
    {
      name: 'iphone-webkit',
      testMatch: /ios-viewport\.spec\.ts/,
      use: { ...devices['iPhone 15'], launchOptions: {} },
    },
    // Games on the web (Match, Truth or Dare): Safari on a 390 px phone (WebKit) with the whole games network simulated.
    {
      name: 'webkit-390',
      testMatch: /games-web\.spec\.ts/,
      use: { ...devices['iPhone 15'], viewport: { width: 390, height: 844 }, launchOptions: {} },
    },
    // Tablet width: only the audit walks it (npm run web:audit), the smoke specs stay on phone + desktop.
    {
      name: 'tablet-768x1024',
      testMatch: /audit\.spec\.ts/,
      use: { viewport: { width: 768, height: 1024 }, hasTouch: true, deviceScaleFactor: 2 },
    },
  ],
});
