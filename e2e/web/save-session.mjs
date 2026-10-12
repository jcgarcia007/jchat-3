// Saves a signed-in Expo Web session (Playwright storage state) for the visual sweep.
//
// Why a human is needed: password sign-in on the web build shows an hCaptcha challenge (Supabase Auth requires a captcha
// token). The challenge must be solved by a person — it is never bypassed or automated here.
//
// Usage (from e2e/):  npm run web:session
//   1. A visible Chromium opens on the venue entry, signs in with MAESTRO_TEST_EMAIL / MAESTRO_TEST_PASSWORD from the
//      ENVIRONMENT (typed through the keyboard so Playwright does not echo the values in logs).
//   2. Solve the hCaptcha challenge if it appears.
//   3. As soon as the app has a session, the state is written to e2e/.auth/web-session.json (git-ignored) and the window closes.
// Never commit the state file: it holds the session tokens of the test account.
//
// PLAYWRIGHT_CHROMIUM_PATH can point at an installed Chromium when the revision bundled with @playwright/test is missing.

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const email = process.env.MAESTRO_TEST_EMAIL;
const password = process.env.MAESTRO_TEST_PASSWORD;
if (!email || !password) {
  console.error('MAESTRO_TEST_EMAIL and MAESTRO_TEST_PASSWORD must be set in the environment.');
  process.exit(1);
}

const base = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:4173';
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', '.auth');
const outFile = path.join(outDir, 'web-session.json');

const browser = await chromium.launch({
  headless: false,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: 'es-MX',
  geolocation: { latitude: 26.083048, longitude: -80.223725 },
  permissions: ['geolocation'],
});
const page = await context.newPage();

try {
  await page.goto(`${base}/?venue=bar-xzx-omd2`, { waitUntil: 'load' });
  await page.getByText(/Iniciar sesión|Log in/i).first().click({ timeout: 60_000 });
  await page.getByText(/Continuar con email|Continue with email/i).first().click({ timeout: 30_000 });

  const fields = page.locator('input');
  await fields.nth(0).waitFor({ timeout: 30_000 });
  await fields.nth(0).focus();
  await page.keyboard.insertText(email);
  await fields.nth(1).focus();
  await page.keyboard.insertText(password);
  await page.getByRole('button', { name: /Iniciar sesión|Sign in|Entrar/i }).first().click();

  console.log('Solve the hCaptcha challenge in the window if it shows up. Waiting up to 5 minutes for the session...');
  await page.waitForFunction(
    () => Object.keys(localStorage).some((key) => /^sb-.*-auth-token$/.test(key) && !!localStorage.getItem(key)),
    undefined,
    { timeout: 300_000, polling: 1000 },
  );

  mkdirSync(outDir, { recursive: true });
  await context.storageState({ path: outFile });
  console.log(`Session saved to ${path.relative(process.cwd(), outFile)} (git-ignored).`);
} catch (err) {
  console.error('Could not save the session:', err instanceof Error ? err.message.split('\n')[0] : 'unknown error');
  process.exitCode = 1;
} finally {
  await browser.close();
}
