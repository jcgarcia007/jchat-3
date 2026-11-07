// Mantener en paridad con mobile/constants/appLinks.ts y mobile/utils/storeLink.ts.

export const APP_STORE_URL = "https://apps.apple.com/app/id6824292679";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.otunitylabs.jchat";
/** true solo cuando la app esté publicada en AMBAS tiendas. Se activa en Vercel sin tocar código. */
export const APP_STORES_LIVE = process.env.NEXT_PUBLIC_APP_STORES_LIVE === "true";
export const DOWNLOAD_PATH = "/download";
/** Destino del QR de escritorio: siempre el dominio de producción (igual que QR_HOST en services/qr.ts). */
export const DOWNLOAD_URL = `https://jchat.cloud${DOWNLOAD_PATH}`;

export type StorePlatform = "ios" | "android" | "desktop";

export function detectStorePlatform(userAgent: string, maxTouchPoints = 0): StorePlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  // iPadOS 13+ sends a desktop Safari user agent; it is the only "Mac" with a touch screen.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}
