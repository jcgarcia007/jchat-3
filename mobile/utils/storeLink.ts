/**
 * JChat 3.0 — which store link the "Descargar la app" button opens, from the browser (pure).
 *   iOS (iPhone / iPad, incl. iPadOS that reports itself as a Mac with touch) → App Store
 *   Android                                                                  → Play Store
 *   anything else (desktop)                                                  → the download page
 */

import { APP_STORE_URL, DOWNLOAD_PAGE_URL, PLAY_STORE_URL } from '../constants/appLinks';

export type StorePlatform = 'ios' | 'android' | 'desktop';

export function detectStorePlatform(userAgent: string, maxTouchPoints = 0): StorePlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  // iPadOS 13+ sends a desktop Safari user agent; it is the only "Mac" with a touch screen.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
}

export interface StoreUrls {
  appStore: string | null;
  playStore: string;
  downloadPage: string;
}

const DEFAULT_URLS: StoreUrls = { appStore: APP_STORE_URL, playStore: PLAY_STORE_URL, downloadPage: DOWNLOAD_PAGE_URL };

export function storeLinkFor(platform: StorePlatform, urls: StoreUrls = DEFAULT_URLS): string {
  if (platform === 'ios') return urls.appStore ?? urls.downloadPage;
  if (platform === 'android') return urls.playStore;
  return urls.downloadPage;
}
