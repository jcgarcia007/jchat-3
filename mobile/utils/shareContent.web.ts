/**
 * JChat 3.0 — shareContent (web): uses the Web Share API when the browser has it; otherwise copies the
 * text to the clipboard and says so with showAlert. If even the clipboard is unavailable (insecure
 * context, permission denied) the text is shown so it can be copied by hand.
 */

import i18n from 'i18next';
import { showAlert } from './dialog';

export interface ShareContent {
  message: string;
  title?: string;
  url?: string;
}

export async function shareContent({ message, title, url }: ShareContent): Promise<void> {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;

  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ text: message, title, url });
    } catch (err) {
      // Closing the share sheet is not an error.
      if (err instanceof Error && err.name === 'AbortError') return;
      throw err;
    }
    return;
  }

  const text = url && !message.includes(url) ? `${message} ${url}` : message;
  try {
    if (!nav?.clipboard) throw new Error('clipboard_unavailable');
    await nav.clipboard.writeText(text);
    showAlert(i18n.t('share.copiedTitle', { ns: 'common' }), i18n.t('share.copiedMessage', { ns: 'common' }));
  } catch {
    showAlert(i18n.t('share.manualTitle', { ns: 'common' }), text);
  }
}
