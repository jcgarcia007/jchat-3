/**
 * JChat 3.0 — full web audit (read-only). Run before every merge:  cd e2e && npm run web:audit
 *
 * Three suites × 3 sizes (390×844, 768×1024, 1280×800) × light/dark × es/en:
 *   app          the Expo web build (127.0.0.1:4173, ../mobile/dist-web) signed in with the saved session, entering by
 *                ?venue=bar-xzx-omd2 with the simulated location 26.083048,-80.223725
 *   app-public   the same build without a session: Welcome, login, register, forgot password, unknown route
 *   next-prod    the old Next site on jchat.cloud — PUBLIC pages, GET only (no forms, no login, no dashboard)
 *
 * It only LOOKS: nothing is sent, liked, followed, reported, blocked, posted, ordered, paid or changed; destructive
 * buttons are opened and cancelled. Findings go to artifacts/web-audit/data/*.json (see audit-helpers.ts) and
 * `node web/audit-report.mjs` merges them into REPORTE.md. WEB_AUDIT=1 turns it on (npm run web:audit sets it), so
 * the regular `npm run web` smoke run skips it. If the saved session expired and hCaptcha shows up, the walk stops.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { Audit, withAccountLock } from './audit-helpers';

const SESSION = path.resolve(__dirname, '..', '.auth', 'web-session.json');
const VENUE = 'bar-xzx-omd2';
// AUDIT_NEXT_BASE points the public-pages suite at a local Next (e.g. http://127.0.0.1:3100) to check unreleased web/ changes.
const PROD = process.env.AUDIT_NEXT_BASE ?? 'https://jchat.cloud';
const THEMES = ['light', 'dark'] as const;
const LANGS = ['es', 'en'] as const;

test.skip(!process.env.WEB_AUDIT, 'audit is opt-in: npm run web:audit');

const CLOSE = /^(Cerrar|Close|Cancelar|Cancel|Ahora no|Not now|Listo|Done)$/i;
/** Settings rows we never press (destructive / leave the session). */
const DENY = /cerrar sesi|log ?out|sign ?out|eliminar|delete|borrar|salir|leave|desactivar|deactivate|cambiar contrase|change password/i;

const meta = (testInfo: { project: { name: string } }, suite: string, theme: 'light' | 'dark', lang: 'es' | 'en') => ({
  suite,
  size: testInfo.project.name.replace(/^[a-z]+-/, ''),
  theme,
  lang,
});

async function appReady(page: Page) {
  await page.waitForFunction(() => (document.getElementById('root')?.innerText ?? '').trim().length > 0, undefined, { timeout: 30_000 });
}

async function dismiss(page: Page) {
  const btn = page.getByRole('button', { name: CLOSE }).last();
  if (await btn.isVisible().catch(() => false)) return void (await btn.click({ timeout: 3000 }).catch(() => undefined));
  const x = page.getByTestId('profile-sheet-close');
  if (await x.isVisible().catch(() => false)) return void (await x.click({ timeout: 3000 }).catch(() => undefined));
  await page.keyboard.press('Escape');
}

async function inChat(page: Page) {
  return page.getByTestId('chat-more-button').isVisible().catch(() => false);
}

/** True when something (a sheet / modal backdrop) sits on top of the chat top bar, i.e. the chat can't be clicked. */
async function chatBlocked(page: Page) {
  return page
    .evaluate(() => {
      const el = document.querySelector('[data-testid="chat-more-button"]');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!top && top !== el && !el.contains(top);
    })
    .catch(() => false);
}

/** Closes every open sheet / modal: panel ✕ buttons first, then close-type buttons, then a tap on the dimmed backdrop. */
async function closeOverlays(page: Page) {
  for (let i = 0; i < 5; i++) {
    const x = page.getByTestId('profile-sheet-close');
    const menuX = page.getByTestId('menu-sheet-close');
    if (await x.isVisible().catch(() => false)) {
      await x.click({ timeout: 3000 }).catch(() => undefined);
    } else if (await menuX.isVisible().catch(() => false)) {
      await menuX.click({ timeout: 3000 }).catch(() => undefined);
    } else if (await chatBlocked(page)) {
      const btn = page.getByRole('button', { name: CLOSE }).last();
      if (await btn.isVisible().catch(() => false)) await btn.click({ timeout: 3000 }).catch(() => undefined);
      else {
        // The top bar sits under the backdrop: a tap there is a tap on the dimmed area (closes quick card / sheets).
        const box = await page.getByTestId('chat-more-button').boundingBox();
        if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        else await page.keyboard.press('Escape');
      }
    } else return;
    await page.waitForTimeout(500);
  }
}

/** Back to the chat whatever the state: close sheets, go back, and as a last resort re-enter by ?venue=. */
async function ensureChat(page: Page) {
  await closeOverlays(page);
  for (let i = 0; i < 3 && !(await inChat(page)); i++) {
    await page.goBack({ timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    await closeOverlays(page);
  }
  if (!(await inChat(page))) {
    await page.goto(`/?venue=${VENUE}`, { waitUntil: 'load' });
    await enterChat(page);
  }
}

async function enterChat(page: Page) {
  const enter = page.getByTestId('chat-enter');
  if (await enter.isVisible({ timeout: 15_000 }).catch(() => false)) await enter.click();
  await expect(page.getByTestId('chat-more-button')).toBeVisible({ timeout: 30_000 });
}

/** Closes any extra tab a link opened (we only look; external pages are covered by the next-prod suite). */
function closePopups(page: Page) {
  page.context().on('page', (p) => {
    if (p === page) return;
    // axe-core opens its own about:blank page while it runs: only tabs that really navigate somewhere are popups.
    void p
      .waitForLoadState('domcontentloaded', { timeout: 4000 })
      .then(() => (p.url() === 'about:blank' ? undefined : p.close()))
      .catch(() => undefined);
  });
}

// ───────────────────────────── signed in (Expo web build) ─────────────────────────────
// The app language of a signed-in user is users.language (a server-side account setting): the audit must NOT flip it, so
// the signed-in walk runs in whatever language the test account has (APP_LANG, default 'en') and only varies the theme.
const APP_LANG = (process.env.AUDIT_APP_LANG === 'es' ? 'es' : 'en') as 'es' | 'en';
for (const theme of THEMES) {
  for (const lang of [APP_LANG]) {
    test.describe(`app · ${theme} · ${lang}`, () => {
      test.skip(!existsSync(SESSION), 'no saved web session (run: npm run web:session)');
      test.use({
        storageState: existsSync(SESSION) ? SESSION : undefined,
        colorScheme: theme,
        locale: lang === 'es' ? 'es-MX' : 'en-US',
        geolocation: { latitude: 26.083048, longitude: -80.223725 },
        permissions: ['geolocation'],
      });

      test('signed-in walk', async ({ page }, testInfo) => {
        test.setTimeout(30 * 60_000); // includes the wait for the account lock (the 6 walks run one at a time)
        await withAccountLock(async () => {
        page.setDefaultTimeout(8000);
        const a = new Audit(page, meta(testInfo, 'app', theme, lang));
        closePopups(page);

        await a.step('Aviso de entrada al local', async () => {
          await page.goto(`/?venue=${VENUE}`, { waitUntil: 'load' });
          await appReady(page);
          if (await page.getByText(/hcaptcha|captcha/i).first().isVisible({ timeout: 1500 }).catch(() => false)) {
            throw new Error('hCaptcha visible: the saved session expired — npm run web:session');
          }
          await expect(page.getByTestId('chat-enter')).toBeVisible({ timeout: 30_000 });
          await a.screen('Aviso de entrada al local');
        });

        await a.step('Chat · sala principal', async () => {
          await enterChat(page);
          await a.screen('Chat · sala principal');
        });

        await a.step('Chat · todas las salas', async () => {
          const names = (await page.getByRole('tab').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
          for (const n of names.slice(0, 10)) {
            await a.step(`Chat · sala ${n}`, async () => {
              await page.getByRole('tab', { name: n, exact: true }).first().click();
              await a.screen(`Chat · sala ${n}`, { settleMs: 900 });
              if (!(await inChat(page))) await ensureChat(page); // a password / entry sheet may have opened
            });
          }
          await ensureChat(page);
          await page.getByRole('tab').first().click(); // back to the first room (it has the messages)
        });

        await a.step('Fila de personas', async () => {
          await page.locator('[data-testid^="chat-person-"]').first().click();
          await a.screen('Fila de personas · opciones');
          await ensureChat(page);
        });

        await a.step('Tarjeta rápida de otra persona', async () => {
          await page.locator('[data-testid^="chat-message-avatar-"]').first().click();
          await a.screen('Tarjeta rápida de otra persona');
          await ensureChat(page);
        });

        await a.step('Acciones de usuario (mantener pulsado)', async () => {
          await page.locator('[data-testid^="chat-message-avatar-"]').first().click({ delay: 900 });
          await a.screen('Acciones de usuario (mantener pulsado)');
          await ensureChat(page);
        });

        await a.step('Mi foto', async () => {
          await page.getByTestId('chat-own-avatar').first().click();
          await a.screen('Menú de mi foto');
          await ensureChat(page);
        });

        await a.step('Notificaciones (campana)', async () => {
          await page.getByRole('button', { name: /^(Notificaciones|Notifications)/ }).first().click();
          await a.screen('Notificaciones (campana)');
          await ensureChat(page);
        });

        await a.step('Mensajes (DMs)', async () => {
          await page.getByRole('button', { name: /^(Mensajes|Messages)/ }).first().click();
          await a.screen('DMs · bandeja', { settleMs: 1200 });
          const row = page.locator('[data-testid^="dm-row"],[data-testid^="dm-thread"]').first();
          if (await row.isVisible().catch(() => false)) {
            await row.click();
            await a.screen('DMs · conversación', { settleMs: 1200 });
          } else {
            // No test ids on the rows: the first row below the header is the first conversation.
            const first = page.getByRole('button').filter({ hasText: /\S/ }).nth(2);
            if (await first.isVisible().catch(() => false)) {
              await first.click();
              await a.screen('DMs · conversación (primera fila)', { settleMs: 1200 });
            }
          }
          await ensureChat(page);
        });

        await a.step('Panel +', async () => {
          await page.getByRole('button', { name: /panel de adjuntos|attachment panel/i }).first().click();
          await a.screen('Panel + (adjuntos)');
          for (const re of [/^(Juegos|Games)$/i, /^Match$/i, /Truth or Dare/i]) {
            const item = page.getByRole('button', { name: re }).first();
            if (await item.isVisible().catch(() => false)) {
              await item.click();
              await a.screen(`Panel + · ${re.source.replace(/[\^$()]/g, '')}`, { settleMs: 1200 });
              await ensureChat(page);
              await page.getByRole('button', { name: /panel de adjuntos|attachment panel/i }).first().click().catch(() => undefined);
            }
          }
          await ensureChat(page);
        });

        await a.step('Menú del local (hoja)', async () => {
          await page.getByRole('button', { name: /Abrir menú|Open menu/i }).first().click();
          await expect(page.getByTestId('menu-sheet').or(page.getByTestId('menu-sheet-content')).first()).toBeVisible();
          // The build used by npm run web:audit points the sheet at the LOCAL Next (E2E_MENU_BASE_URL), so the framed
          // page really renders; production still sends frame-ancestors 'none' until web/ is deployed.
          if (process.env.E2E_MENU_BASE_URL) await expect(page.frameLocator('iframe').locator('body')).not.toBeEmpty({ timeout: 25_000 });
          await a.screen('Menú del local (hoja)', { settleMs: 2500 });
          await ensureChat(page);
        });

        // ⋯ sheet and each of its rows
        await a.step('Hoja ⋯', async () => {
          await page.getByTestId('chat-more-button').click();
          await a.screen('Hoja ⋯');
          await dismiss(page);
        });

        await a.step('⋯ · Mi cuenta y pedidos', async () => {
          await page.getByTestId('chat-more-button').click();
          await page.getByRole('button', { name: /Mi cuenta y pedidos|My account and orders/i }).first().click();
          await a.screen('Mi cuenta y pedidos', { settleMs: 1200 });
          await ensureChat(page);
        });

        await a.step('⋯ · Pedir ayuda al local', async () => {
          await page.getByTestId('chat-more-button').click();
          await page.getByRole('button', { name: /Pedir ayuda|Ask .*help|Get help|Request help/i }).first().click();
          await a.screen('Pedir ayuda al local (solo abierto, nada enviado)');
          await ensureChat(page);
        });

        await a.step('⋯ · Salir del local (confirm, se cancela)', async () => {
          await page.getByTestId('chat-more-button').click();
          await page.getByRole('button', { name: /Salir del local|Leave( the)? venue/i }).first().click();
          await a.screen('Confirmar «Salir del local» (se cancela)');
          await page.getByRole('button', { name: CLOSE }).last().click(); // the dialog's cancel button is labelled "Cerrar/Close"; "Salir/Leave" is never pressed
          await ensureChat(page);
        });

        // profile, edit, settings
        await a.step('Mi perfil (hoja/panel)', async () => {
          await page.getByTestId('chat-more-button').click();
          await page.getByTestId('more-my-profile').click();
          await expect(page.getByTestId('profile-sheet-close')).toBeVisible();
          await a.screen('Mi perfil (hoja/panel)', { settleMs: 1200 });
        });

        await a.step('Editar perfil (sin guardar)', async () => {
          await page.getByRole('button', { name: /^(Editar perfil|Edit profile)$/i }).first().click();
          await a.screen('Editar perfil (sin guardar)', { settleMs: 1200 });
          await page.goBack({ timeout: 3000 }).catch(() => undefined);
          await page.waitForTimeout(600);
        });

        await a.step('Ajustes', async () => {
          if (!(await page.getByRole('button', { name: /Abrir ajustes|Open settings/i }).first().isVisible().catch(() => false))) {
            await ensureChat(page);
            await page.getByTestId('chat-more-button').click();
            await page.getByTestId('more-my-profile').click();
          }
          await page.getByRole('button', { name: /Abrir ajustes|Open settings/i }).first().click();
          await a.screen('Ajustes', { settleMs: 1200 });

          // Settings holds segmented controls (language / theme / radius) and switches that WRITE account settings: never
          // pressed. Only the rows that open another screen are visited (allow-list), then the bottom of the page is checked.
          await page.mouse.wheel(0, 4000);
          await a.screen('Ajustes (final de la pantalla)', { settleMs: 800 });
          await page.mouse.wheel(0, -4000);
          const NAV_ROWS = /pedidos|orders|privacidad|privacy|términos|terms|bloqueados|blocked|acerca|about|soporte|support|ayuda y|help center/i;
          const rows = (await page.getByRole('button').allInnerTexts()).map((t) => t.trim().split('\n')[0]).filter((t) => NAV_ROWS.test(t) && !DENY.test(t));
          for (const text of [...new Set(rows)]) {
            await a.step(`Ajustes · ${text}`, async () => {
              const row = page.getByRole('button', { name: text }).first();
              const before = page.url();
              await row.click({ timeout: 4000 });
              await page.waitForTimeout(900);
              await a.screen(`Ajustes · ${text}`, { settleMs: 800 });
              if (page.url() !== before) await page.goBack({ timeout: 3000 }).catch(() => undefined);
              else await dismiss(page);
              await page.waitForTimeout(700);
            });
          }
        });

        await ensureChat(page).catch(() => undefined);

        await a.step('WebNoVenueScreen', async () => {
          await page.goto('/', { waitUntil: 'load' });
          await appReady(page);
          await page.waitForTimeout(2500);
          await a.screen(`Raíz sin local (${(await page.getByTestId('web-no-venue').isVisible().catch(() => false)) ? 'WebNoVenueScreen' : 'el chat restaurado'})`);
        });

        await a.step('Ruta inexistente (404) con sesión', async () => {
          await page.goto('/ruta-que-no-existe-audit', { waitUntil: 'load' });
          await appReady(page);
          await a.screen('Ruta inexistente (404) con sesión', { settleMs: 1500 });
        });

        a.save();
        testInfo.annotations.push({ type: 'screens', description: `${a.screens.length}` });
        expect(a.findings.filter((f) => f.severity === 'bloqueante')).toEqual([]);
        });
      });
    });
  }
}

// ───────────────────────────── anonymous (Expo web build) ─────────────────────────────
for (const theme of THEMES) {
  for (const lang of LANGS) {
    test.describe(`app-public · ${theme} · ${lang}`, () => {
      test.use({
        storageState: { cookies: [], origins: [] },
        colorScheme: theme,
        locale: lang === 'es' ? 'es-MX' : 'en-US',
        geolocation: { latitude: 26.083048, longitude: -80.223725 },
        permissions: ['geolocation'],
      });

      test('anonymous walk', async ({ page }, testInfo) => {
        test.setTimeout(5 * 60_000);
        page.setDefaultTimeout(8000);
        const a = new Audit(page, meta(testInfo, 'app-public', theme, lang));
        closePopups(page);

        await a.step('Bienvenida', async () => {
          await page.goto('/', { waitUntil: 'load' });
          await appReady(page);
          await a.screen('Bienvenida', { settleMs: 2500 });
        });

        await a.step('Bienvenida con tarjeta del local (?venue=)', async () => {
          await page.goto(`/?venue=${VENUE}`, { waitUntil: 'load' });
          await appReady(page);
          await expect(page.getByTestId('entry-card')).toBeVisible({ timeout: 20_000 });
          await a.screen('Bienvenida con tarjeta del local (?venue=)');
        });

        await a.step('Bienvenida · carrusel (pasos 2-4)', async () => {
          await page.goto('/', { waitUntil: 'load' });
          await appReady(page);
          await page.waitForTimeout(1500);
          for (let i = 2; i <= 4; i++) {
            const box = page.viewportSize()!;
            await page.mouse.move(box.width * 0.8, box.height * 0.4);
            await page.mouse.down();
            await page.mouse.move(box.width * 0.2, box.height * 0.4, { steps: 8 });
            await page.mouse.up();
            await a.screen(`Bienvenida · paso ${i}`, { settleMs: 700 });
          }
        });

        await a.step('Inicio de sesión', async () => {
          await page.goto('/', { waitUntil: 'load' });
          await appReady(page);
          await page.getByRole('button', { name: /^(Iniciar sesión|Log in)$/i }).first().click();
          await a.screen('Inicio de sesión (opciones)', { settleMs: 1200 });
        });

        await a.step('Login con correo (sin enviar)', async () => {
          await page.getByRole('button', { name: /Continuar con (correo|email)|Continue with email/i }).first().click();
          await a.screen('Login con correo (sin enviar)', { settleMs: 1000 });
        });

        await a.step('Recuperar contraseña (sin enviar)', async () => {
          await page.getByRole('button', { name: /Olvidaste|Forgot/i }).first().click();
          await a.screen('Recuperar contraseña (sin enviar)', { settleMs: 1000 });
          await page.goBack({ timeout: 3000 }).catch(() => undefined);
          await page.waitForTimeout(600);
        });

        await a.step('Registro (sin enviar)', async () => {
          await page.getByRole('button', { name: /Crear cuenta|Create account/i }).first().click();
          await a.screen('Registro paso 1 (sin enviar)', { settleMs: 1000 });
        });

        await a.step('Ruta inexistente (404) sin sesión', async () => {
          await page.goto('/ruta-que-no-existe-audit', { waitUntil: 'load' });
          await appReady(page);
          await a.screen('Ruta inexistente (404) sin sesión', { settleMs: 1500 });
        });

        a.save();
      });
    });
  }
}

// ───────────────────────────── jchat.cloud — public pages, GET only ─────────────────────────────
const NEXT_PAGES: [string, string][] = [
  ['Landing /', '/'],
  [`Menú público /m/${VENUE}`, `/m/${VENUE}`],
  ['Términos', '/terms'],
  ['Privacidad', '/privacy'],
  ['Soporte', '/support'],
  ['Seguridad', '/safety'],
  ['Contacto', '/contact'],
  ['Eliminar cuenta (info)', '/account/delete'],
  ['Precios', '/pricing'],
  ['Cerca de mí', '/nearby'],
  ['Login (solo cargar)', '/auth/login'],
  ['Ruta inexistente (404)', '/ruta-que-no-existe-audit'],
];

for (const theme of THEMES) {
  for (const lang of LANGS) {
    test.describe(`next-prod · ${theme} · ${lang}`, () => {
      test.use({
        storageState: { cookies: [], origins: [] },
        colorScheme: theme,
        locale: lang === 'es' ? 'es-MX' : 'en-US',
        extraHTTPHeaders: { 'Accept-Language': lang === 'es' ? 'es-MX,es;q=0.9' : 'en-US,en;q=0.9' },
      });

      test('public pages (GET only)', async ({ page }, testInfo) => {
        test.setTimeout(5 * 60_000);
        page.setDefaultTimeout(12_000);
        const a = new Audit(page, meta(testInfo, 'next-prod', theme, lang), false);
        for (const [name, route] of NEXT_PAGES) {
          await a.step(name, async () => {
            a.expect404 = /inexistente/.test(name);
            const res = await page.goto(`${PROD}${route}`, { waitUntil: 'load', timeout: 30_000 });
            if (res && res.status() >= 400 && !/inexistente/.test(name)) a.push({ kind: 'http-4xx', screen: name, message: `GET ${route} → ${res.status()}` });
            await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
            await a.screen(name, { settleMs: 900 });
            a.expect404 = false;
          });
        }
        for (const file of ['/robots.txt', '/sitemap.xml']) {
          await a.step(`GET ${file}`, async () => {
            const res = await page.request.get(`${PROD}${file}`);
            if (res.status() !== 200) a.push({ kind: 'http-4xx', screen: `GET ${file}`, message: `GET ${file} → ${res.status()}` });
          });
        }
        a.save();
      });
    });
  }
}
