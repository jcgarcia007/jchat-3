/**
 * JChat 3.0 — the click that enters a venue's chat from the entry gate, shared by the web specs.
 *
 * `page.getByText('Entrar al chat').first()` is not enough any more: the screen under the gate also offers "Entrar al chat de
 * {local}" (the remembered entry), it comes first in the DOM and is hidden behind the gate sheet. The gate's own button is
 * data-testid="chat-enter"; the text is only the fallback for the screen without the sheet.
 */
import type { Page } from '@playwright/test';

export async function enterVenue(page: Page): Promise<void> {
  const enter = page.getByTestId('chat-enter');
  await enter.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
  if (await enter.isVisible()) {
    await enter.click();
    return;
  }
  await page.getByText('Entrar al chat').first().click({ timeout: 30_000 });
}
