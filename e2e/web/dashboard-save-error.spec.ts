/**
 * JChat 3.0 — a failed save in Dashboard → Configuración shows a HUMAN message right under the Save button that was pressed,
 * and the page-top banner is brought into view (fix/dashboard-save-feedback).
 *
 * Before: the PATCH to `businesses` answered 403 "permission denied for table businesses" and the page showed that raw text in a
 * banner at the top of a long page — out of sight of the button — so the owner thought nothing had happened.
 *
 * Everything is simulated: the dashboard talks to web/fake-supabase.mjs (a stand-in that answers a synthetic owner and forces
 * the 403 on PATCH businesses). Nothing reaches production, nothing is written anywhere.
 * Run: cd e2e && npx playwright test -c dashboard.config.ts
 */
import { expect, test } from '@playwright/test';

const FAKE = 'http://127.0.0.1:4180';
const APP = 'http://127.0.0.1:3102';

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function sessionCookie() {
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600;
  const user = { id: '00000000-0000-4000-8000-0000000000a1', aud: 'authenticated', role: 'authenticated', email: 'owner@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  const jwt = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: user.id, role: 'authenticated', aud: 'authenticated', exp })}.${b64url('signature')}`;
  const session = { access_token: jwt, refresh_token: 'synthetic-refresh', expires_in: 86400, expires_at: exp, token_type: 'bearer', user };
  // @supabase/ssr: cookie "sb-<first label of the host>-auth-token", value "base64-" + base64url(session JSON).
  return { name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, url: APP };
}

// The app's CSP only lets the page talk to the production Supabase host; the stand-in lives on 127.0.0.1:4180.
test.use({ locale: 'es-MX', bypassCSP: true });

test('a 403 on the hours save shows a human message next to the button, in view', async ({ page, context }) => {
  await context.addCookies([sessionCookie()]);
  await page.goto('/dashboard/configuration', { waitUntil: 'load' });

  const save = page.getByRole('button', { name: /guardar horario/i });
  await expect(save).toBeEnabled({ timeout: 90_000 }); // enabled once the synthetic business is resolved
  await save.click(); // scrolls the button into view by itself, like the owner would

  const inline = page.getByTestId('save-error-inline');
  await expect(inline).toBeVisible({ timeout: 15_000 });
  await expect(inline).toContainText('No tienes permiso para guardar este cambio. Si crees que es un error, contáctanos.');
  await expect(inline).toContainText('42501'); // the small technical code stays, for support
  // the raw database text is not what the owner reads
  await expect(page.getByText(/permission denied for table/i)).toHaveCount(0);

  // visible without scrolling by hand: inside the viewport right after the click
  const box = await inline.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box, 'the message has a box').not.toBeNull();
  expect(box!.y, 'inside the viewport (top)').toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, 'inside the viewport (bottom)').toBeLessThanOrEqual(viewport.height);

  // the same human text is in the page-top banner (it is not what the owner has to scroll to find)
  await expect(page.locator('[role="alert"]').filter({ hasText: 'No tienes permiso' })).toHaveCount(2);

  // the simulation forced the failure; nothing else was written
  const attempts: string[] = await (await fetch(`${FAKE}/__writes`)).json();
  expect(attempts.filter((a) => a.startsWith('PATCH'))).toContain('PATCH /rest/v1/businesses');
});
