/**
 * JChat 3.0 — new chat messages carry the author's photo, not the fallback initial (fix/chat-realtime-avatar).
 *
 * Needs the saved session (e2e/.auth/web-session.json): skipped without it. Phone viewport. NOTHING is sent to the
 * room: the Realtime INSERT is injected into the page's own WebSocket (page.routeWebSocket), the send's REST insert
 * and the profile lookup are mocked (page.route) with synthetic rows.
 *
 *   1. a Realtime message from an author the app has NOT seen yet: one profile lookup (even for 3 messages) and the
 *      avatar is the image, not the initial;
 *   2. a Realtime message from an author already in the room: the avatar is the image at once;
 *   3. my own message: the optimistic row is born with my photo and keeps it when the (mocked) confirmed row replaces
 *      it — before the fix the bare confirmed row wiped it and the message fell back to the initial.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const SESSION = path.resolve(__dirname, '..', '.auth', 'web-session.json');
// 1×1 PNG: a real image the avatar can render without any network.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const FAKE_AUTHOR = '00000000-0000-4000-8000-0000000000a1'; // synthetic, not a real user

test.skip(!existsSync(SESSION), 'no saved web session (run: npm run web:session)');
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-390x844', 'phone viewport only');
});
test.use({
  storageState: existsSync(SESSION) ? SESSION : undefined,
  locale: 'es-MX',
  geolocation: { latitude: 26.083048, longitude: -80.223725 },
  permissions: ['geolocation'],
});

interface Injector {
  topic: string;
  insertId: number;
  send: (record: Record<string, unknown>) => void;
}

/** Proxies the Realtime socket so the test can push a postgres_changes INSERT to the room-messages channel. */
async function watchRealtime(page: Page): Promise<() => Injector | null> {
  let toPage: ((data: string) => void) | null = null;
  let topic = '';
  let joinRef: string | null = null;
  let insertId = 0;
  await page.routeWebSocket(/realtime\/v1\/websocket/, (ws) => {
    const server = ws.connectToServer();
    toPage = (data) => ws.send(data);
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      ws.send(message);
      try {
        const [ref, , t, event, payload] = JSON.parse(String(message));
        const changes = payload?.response?.postgres_changes as { id: number; event: string }[] | undefined;
        if (event === 'phx_reply' && typeof t === 'string' && t.includes('room-messages:') && changes) {
          topic = t;
          joinRef = ref;
          insertId = changes.find((c) => c.event === 'INSERT')?.id ?? 0;
        }
      } catch {
        /* not a JSON frame */
      }
    });
  });
  return () =>
    topic && insertId && toPage
      ? {
          topic,
          insertId,
          send: (record) =>
            toPage!(JSON.stringify([joinRef, null, topic, 'postgres_changes', { ids: [insertId], data: { schema: 'public', table: 'messages', commit_timestamp: new Date().toISOString(), type: 'INSERT', record, columns: [], errors: null } }])),
        }
      : null;
}

async function enterChat(page: Page) {
  await page.goto('/?venue=bar-xzx-omd2', { waitUntil: 'load' });
  await page.getByText('Entrar al chat').first().click({ timeout: 30_000 });
  await expect(page.getByTestId('chat-more-button')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
}

const record = (roomId: string, userId: string, body: string) => ({
  id: crypto.randomUUID(),
  room_id: roomId,
  user_id: userId,
  body,
  type: 'text',
  media_url: null,
  metadata: {},
  is_system: false,
  created_at: new Date().toISOString(),
});

/** What each avatar button shows: an image and no letter, or the fallback initial. */
const avatarKind = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluateAll((els) =>
    els.map((el) => ({
      text: (el as HTMLElement).innerText.trim(),
      image: !!el.querySelector('img') || Array.from(el.querySelectorAll<HTMLElement>('div')).some((d) => /url\(/.test(getComputedStyle(d).backgroundImage)),
    })),
  );

test('a Realtime message from an author the app has not seen yet gets their photo after ONE lookup (3 messages → 1 request)', async ({ page }) => {
  const injector = await watchRealtime(page);
  let lookups = 0;
  await page.route('**/rest/v1/public_profiles*', async (route) => {
    if (!decodeURIComponent(route.request().url()).includes(FAKE_AUTHOR)) return route.continue();
    lookups += 1;
    await new Promise((r) => setTimeout(r, 400)); // slow enough for the 3 messages to arrive meanwhile
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: FAKE_AUTHOR, username: 'prueba_avatar', display_name: 'Prueba Avatar', avatar_url: PNG }]) });
  });
  await enterChat(page);
  await expect.poll(() => injector()?.insertId ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
  const roomId = page.url().match(/room\/([0-9a-f-]{36})/i)![1];

  for (const n of [1, 2, 3]) injector()!.send(record(roomId, FAKE_AUTHOR, `[prueba avatar realtime ${n}]`));
  await expect(page.getByText('[prueba avatar realtime 3]')).toBeVisible({ timeout: 10_000 });

  await expect.poll(async () => (await avatarKind(page, `chat-message-avatar-${FAKE_AUTHOR}`)).length).toBe(3);
  await expect.poll(async () => (await avatarKind(page, `chat-message-avatar-${FAKE_AUTHOR}`)).every((a) => a.image && a.text === ''), { timeout: 10_000 }).toBe(true);
  expect(lookups, 'one shared profile lookup for the three messages').toBe(1);
  await page.screenshot({ path: 'artifacts/chat-avatar/web-390-realtime-new-author.png' });
});

test('a second message from an author whose profile is already cached shows the photo at once, with no new lookup', async ({ page }) => {
  const injector = await watchRealtime(page);
  let lookups = 0;
  await page.route('**/rest/v1/public_profiles*', async (route) => {
    if (!decodeURIComponent(route.request().url()).includes(FAKE_AUTHOR)) return route.continue();
    lookups += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: FAKE_AUTHOR, username: 'prueba_avatar', display_name: 'Prueba Avatar', avatar_url: PNG }]) });
  });
  await enterChat(page);
  await expect.poll(() => injector()?.insertId ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
  const roomId = page.url().match(/room\/([0-9a-f-]{36})/i)![1];

  injector()!.send(record(roomId, FAKE_AUTHOR, '[prueba avatar realtime primero]'));
  await expect.poll(async () => (await avatarKind(page, `chat-message-avatar-${FAKE_AUTHOR}`)).every((a) => a.image && a.text === '') && (await avatarKind(page, `chat-message-avatar-${FAKE_AUTHOR}`)).length === 1, { timeout: 10_000 }).toBe(true);
  expect(lookups).toBe(1);

  injector()!.send(record(roomId, FAKE_AUTHOR, '[prueba avatar realtime segundo]'));
  await expect(page.getByText('[prueba avatar realtime segundo]')).toBeVisible({ timeout: 10_000 });
  // No fallback frame: the very first time two avatars exist, both are already the image.
  const kinds = await avatarKind(page, `chat-message-avatar-${FAKE_AUTHOR}`);
  expect(kinds).toHaveLength(2);
  expect(kinds.every((a) => a.image && a.text === '')).toBe(true);
  expect(lookups, 'the cached profile is not fetched again').toBe(1);
});

test('my own message keeps my photo when the confirmed row replaces the optimistic one (insert mocked, nothing sent)', async ({ page }) => {
  await enterChat(page);
  const roomId = page.url().match(/room\/([0-9a-f-]{36})/i)![1];
  const meId = await page.locator('[data-testid^="chat-person-"]').first().getAttribute('data-testid').then((t) => t!.replace('chat-person-', ''));
  await page.route('**/rest/v1/messages*', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const sent = route.request().postDataJSON() as { body: string };
    // The bare messages row, exactly what the send returns (no author profile): this used to wipe the avatar.
    await route.fulfill({ status: 201, contentType: 'application/vnd.pgrst.object+json', body: JSON.stringify({ ...record(roomId, meId, sent.body) }) });
  });

  const before = (await avatarKind(page, 'chat-own-avatar')).length;
  await page.getByPlaceholder('Mensaje…').fill('[prueba avatar propio]');
  await page.getByRole('button', { name: /Enviar|Send/i }).first().click();
  await expect(page.getByText('[prueba avatar propio]')).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => (await avatarKind(page, 'chat-own-avatar')).length).toBe(before + 1);
  await page.waitForTimeout(800); // the optimistic row has been replaced by the confirmed one
  const kinds = await avatarKind(page, 'chat-own-avatar');
  expect(kinds.every((a) => a.image && a.text === ''), 'all my avatars, the new one included, are my photo').toBe(true);
  await page.screenshot({ path: 'artifacts/chat-avatar/web-390-own-message.png' });
});
