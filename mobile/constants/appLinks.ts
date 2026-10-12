/**
 * JChat 3.0 — where to download the app (single place for the store URLs; used by the web shell).
 * TODO: set APP_STORE_URL once the app has an App Store id; until then iOS falls back to the download page.
 */

/** https://apps.apple.com/app/id<ID> — null until the App Store listing exists. */
export const APP_STORE_URL: string | null = null;

/** Android package id of the app (app.config.ts). */
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.juangarciacruz.jchatapp';

/**
 * Download page for desktop browsers (and iOS until APP_STORE_URL is set).
 * TODO: https://jchat.cloud/download does not exist yet (404): until that page exists this is the site's home.
 */
export const DOWNLOAD_PAGE_URL = 'https://jchat.cloud';

/**
 * The venue's PUBLIC menu page (Next site): https://jchat.cloud/m/<slug>. On the web build the chat opens it in a NEW
 * tab (it has its own ordering and payment flow); the app's embedded version adds ?app=1 and is native-only.
 */
export const PUBLIC_MENU_BASE_URL = 'https://jchat.cloud/m';
