/**
 * JChat 3.0 — the "Thank you" view of the report sheet: its Close button has the full width of the sheet, like every other
 * primary button (it used to shrink to the width of its text and squeeze "Close" against its edges; fix/report-thanks-button).
 *
 * Needs the saved session (skipped without it). Phone viewport. NOTHING is sent: the whole network that could write is simulated
 * (games-mock.ts); `report_content` answers a synthetic report id, so the sheet reaches the "sent" view without a real report.
 * Run: cd e2e && npx playwright test -c web.config.ts web/report-sheet.spec.ts --project=mobile-390x844
 */
import { expect, test } from '@playwright/test';
import { enterVenue } from './enter-venue';
import { assertNothingLeaked, hasSession, messageRecord, mockGamesNetwork, PERSON_ID, SESSION, VENUE, watchRealtime } from './games-mock';

test.skip(!hasSession, 'no saved web session (run: npm run web:session)');
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-390x844', 'phone viewport only');
});
test.use({
  storageState: hasSession ? SESSION : undefined,
  locale: 'es-MX',
  geolocation: { latitude: 26.083048, longitude: -80.223725 },
  permissions: ['geolocation'],
});

test('the report sheet "Thank you" button is as wide as the sheet', async ({ page }) => {
  const injector = await watchRealtime(page);
  const mock = await mockGamesNetwork(page, { report_content: '00000000-0000-4000-8000-0000000000f2' });
  await page.goto(`/?venue=${VENUE}`, { waitUntil: 'load' });
  await enterVenue(page);
  await expect(page.getByTestId('chat-more-button')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => injector() !== null, { timeout: 15_000 }).toBe(true);

  const roomId = page.url().match(/room\/([0-9a-f-]{36})/i)?.[1] ?? '00000000-0000-4000-8000-0000000000f1';
  injector()!.send(messageRecord(roomId, PERSON_ID, { body: '[prueba de reporte]' }));
  await expect(page.getByText('[prueba de reporte]')).toBeVisible({ timeout: 10_000 });

  await page.getByTestId(`chat-message-avatar-${PERSON_ID}`).first().click();
  await page.getByTestId('quick-card-report').click();
  await page.getByText('Spam o estafa').click();
  await page.getByRole('button', { name: 'Enviar reporte' }).click();

  const close = page.getByTestId('report-sent-close');
  await expect(close).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: 'artifacts/games-web/report-sent.png' });

  const box = await close.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box, 'the Close button is on screen').not.toBeNull();
  // Sheet padding is 20 px on each side: a full-width button is viewport − 40 (it was ~text width + padding before).
  expect(box!.width, 'full width, not shrunk to its text').toBeGreaterThanOrEqual(viewport.width - 40 - 2);

  expect(mock.rpcCalls).toContain('report_content'); // answered by the simulation
  expect(assertNothingLeaked(mock)).toEqual([]);
  expect(mock.writes).toEqual([]);
});
