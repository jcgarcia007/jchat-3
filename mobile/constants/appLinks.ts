/**
 * JChat 3.0 — where to download the app (single place for the store URLs; used by the web shell).
 * TODO: set APP_STORE_URL once the app has an App Store id; until then iOS falls back to the download page.
 */

/** https://apps.apple.com/app/id<ID> — null until the App Store listing exists. */
export const APP_STORE_URL: string | null = null;

/** Android package id of the app (app.config.ts). */
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.otunitylabs.jchat';

/**
 * Download page for desktop browsers (and iOS until APP_STORE_URL is set).
 * TODO: https://jchat.cloud/download does not exist yet (404): until that page exists this is the site's home.
 */
export const DOWNLOAD_PAGE_URL = 'https://jchat.cloud';

/**
 * The venue's PUBLIC menu page (Next site): <base>/<slug>. On the web build the chat shows it in a sheet over the chat
 * (an iframe of <base>/<slug>?embed=1: the site allows framing of /m/* by our own domains only).
 * `EXPO_PUBLIC_MENU_BASE_URL` points a LOCAL web build at a local Next (e.g. http://127.0.0.1:3100/m); production
 * builds never set it.
 */
export const PUBLIC_MENU_BASE_URL = process.env.EXPO_PUBLIC_MENU_BASE_URL?.replace(/\/+$/, '') || 'https://jchat.cloud/m';

/**
 * The ONLY origin the menu sheet accepts messages from (event.origin of the embedded menu) — derived from the base URL,
 * so it is https://jchat.cloud in production and the local Next origin in a local test build.
 */
export const MENU_FRAME_ORIGIN = new URL(PUBLIC_MENU_BASE_URL).origin;
