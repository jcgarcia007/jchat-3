/**
 * JChat 3.0 — Playwright config for the HERMETIC specs of the overnight suite (e2e/local/*.spec.ts).
 *
 * These specs run against `e2e/dist-web-local`: a web export built with EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 (the LOCAL
 * Supabase) and no Sentry DSN, so the bundle holds no production URL. Every spec also blocks, at runtime, any request that is not to
 * localhost / 127.0.0.1 (see local/hermetic.ts) and runs with a SYNTHETIC session (no real account, no saved session file).
 * The older specs in e2e/web use the production export and a real saved session: they are NOT run by this config.
 *
 * Build:  cd mobile && EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=local-anon-key-for-tests \
 *           EXPO_PUBLIC_SENTRY_DSN= EXPO_PUBLIC_HCAPTCHA_SITEKEY= npx expo export -p web --output-dir ../e2e/dist-web-local --clear
 * Run:    cd e2e && npx playwright test -c local.config.ts
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

export default defineConfig({
  testDir: './local',
  testMatch: /.*\.spec\.ts/,
  outputDir: './artifacts/local-results',
  timeout: 60_000,
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
    // Safari on a 390 px iPhone (WebKit).
    { name: 'webkit-390', use: { ...devices['iPhone 15'], viewport: { width: 390, height: 844 }, launchOptions: {} } },
  ],
});
