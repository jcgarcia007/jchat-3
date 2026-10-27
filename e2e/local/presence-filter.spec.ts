/**
 * JChat 3.0 — the room's header list ("N personas aquí" + avatars) filtered by the server's geo-presence (migration 243,
 * venue_present_users). Hermetic: the room's Realtime presence is simulated (hermetic.ts setPresence) and the RPC is answered by the spec.
 *
 *   the server confirms some of the people  → only those stay in the list and in the count
 *   the call fails (500 / unknown)          → the list stays as it is (fail-open)
 *   MY id does not come back                → the answer says nothing about the others: the list stays as it is (fail-open)
 *   more than 100 people                    → the call carries at most 100 ids, mine first; whoever was not asked stays
 *   the venue's owner                       → never filtered, the RPC is never called
 *   room closed / app in the background     → no call
 *
 * Run: cd e2e && npx playwright test -c local.config.ts local/presence-filter.spec.ts
 */
import { expect, test, type Page } from '@playwright/test';
import { BUSINESS, ME, OTHER, enterChat, openVenue } from './fixtures';
import { OTHER_ID, USER_ID, type Hermetic } from './hermetic';

test.use({ locale: 'es-MX' });

const person = (n: number) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, name: `Persona ${n}`, avatar: null });
const ME_P = { id: USER_ID, name: ME.display_name, avatar: null };
const OTHER_P = { id: OTHER_ID, name: OTHER.display_name, avatar: null };
const calls = (h: Hermetic) => h.rpcCalls.filter((c) => c.name === 'venue_present_users');
const people = (page: Page) => page.getByText(/\d+ personas? aquí/).locator('visible=true').first();

async function inRoomWithPresence(page: Page, list: { id: string; name: string; avatar: null }[], answer: unknown, extra: Parameters<typeof openVenue>[1] = {}) {
  const h = await openVenue(page, { ...extra, rpcs: { venue_present_users: answer as never, ...(extra.rpcs ?? {}) } });
  await enterChat(page);
  await expect.poll(() => Object.keys(h.debug().joined.map((j) => j.topic)).length).toBeGreaterThan(0);
  await expect.poll(() => h.debug().joined.some((j) => /presence:/.test(j.topic)), { timeout: 15_000 }).toBe(true);
  h.setPresence(list);
  return h;
}

test('the server confirms some of the people: only those stay in the count', async ({ page }) => {
  const h = await inRoomWithPresence(page, [ME_P, OTHER_P, person(3)], (body: { p_user_ids: string[] }) => body.p_user_ids.filter((id) => id !== person(3).id));
  await expect(people(page)).toHaveText('3 personas aquí', { timeout: 10_000 }).catch(() => undefined);
  await expect.poll(() => calls(h).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await expect(people(page)).toHaveText('2 personas aquí', { timeout: 15_000 });
  for (const c of calls(h)) expect(c.body).toMatchObject({ p_business_id: BUSINESS.id });
});

test('the call FAILS (500): the list stays as it is (fail-open)', async ({ page }) => {
  const h = await inRoomWithPresence(page, [ME_P, OTHER_P, person(3)], { status: 500, body: { code: 'XX000', message: 'boom', details: null, hint: null } });
  await expect.poll(() => calls(h).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(800);
  await expect(people(page)).toHaveText('3 personas aquí');
});

test('the function does not exist yet (migration not applied): answers null → the list stays as it is', async ({ page }) => {
  const h = await inRoomWithPresence(page, [ME_P, OTHER_P], null);
  await expect.poll(() => calls(h).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(800);
  await expect(people(page)).toHaveText('2 personas aquí');
});

test('MY id is not in the answer (I am not confirmed in the venue): the list is NOT filtered, an empty answer is never "nobody is here"', async ({ page }) => {
  const h = await inRoomWithPresence(page, [ME_P, OTHER_P, person(3)], []);
  await expect.poll(() => calls(h).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(800);
  await expect(people(page)).toHaveText('3 personas aquí');
});

test('I always stay in my own list, even when the server confirms nobody else', async ({ page }) => {
  const h = await inRoomWithPresence(page, [ME_P, OTHER_P, person(3)], (body: { p_user_ids: string[] }) => body.p_user_ids.filter((id) => id === USER_ID));
  await expect.poll(() => calls(h).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await expect(people(page)).toHaveText('1 persona aquí', { timeout: 15_000 });
});

test('more than 100 people: the call carries at most 100 ids, mine first and each once; whoever was not asked stays', async ({ page }) => {
  const crowd = [ME_P, OTHER_P, ...Array.from({ length: 148 }, (_, i) => person(100 + i))];
  const h = await inRoomWithPresence(page, crowd, (body: { p_user_ids: string[] }) => [USER_ID]); // confirms only me among those asked
  await expect.poll(() => calls(h).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  const ids = calls(h)[0].body.p_user_ids as string[];
  expect(ids.length).toBeLessThanOrEqual(100);
  expect(ids[0]).toBe(USER_ID);
  expect(new Set(ids).size).toBe(ids.length);
  // 150 people, 100 asked, only I confirmed → 99 removed, the 50 that were never asked stay (+ me) = 51
  await expect(people(page)).toHaveText('51 personas aquí', { timeout: 15_000 });
});

test('the venue\'s OWNER is never filtered and never calls the function', async ({ page }) => {
  const h = await inRoomWithPresence(page, [ME_P, OTHER_P, person(3)], [], { tables: { businesses: [{ ...BUSINESS, owner_id: USER_ID }] } });
  await page.waitForTimeout(4000);
  expect(calls(h)).toHaveLength(0);
  await expect(people(page)).toHaveText('3 personas aquí');
});

test('no call while the entry gate is up (the room is not open yet); the first one comes after "Entrar"', async ({ page }) => {
  const h = await openVenue(page, { rpcs: { venue_present_users: (b: { p_user_ids: string[] }) => b.p_user_ids } });
  await page.getByTestId('chat-enter').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(3000);
  expect(calls(h), 'nothing asked before entering').toHaveLength(0);
  await enterChat(page);
  await expect.poll(() => calls(h).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
});

test('every 60 s while the app is visible; NO call while it is in the background; one when it comes back', async ({ page }) => {
  await page.clock.install();
  const h = await openVenue(page, { rpcs: { venue_present_users: (b: { p_user_ids: string[] }) => b.p_user_ids } });
  await enterChat(page);
  await page.clock.runFor(1000);
  await expect.poll(() => calls(h).length).toBeGreaterThanOrEqual(1);
  const first = calls(h).length;

  await page.clock.runFor(61_000);
  await expect.poll(() => calls(h).length).toBeGreaterThan(first);
  const afterTick = calls(h).length;

  // the app goes to the background (tab hidden)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(5 * 61_000);
  await page.waitForTimeout(300);
  expect(calls(h).length, 'no call while hidden').toBe(afterTick);

  // and comes back
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(1000);
  await expect.poll(() => calls(h).length).toBeGreaterThan(afterTick);
});
