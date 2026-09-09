/**
 * guestDevice — Tab POS F3
 * Identidad persistente del dispositivo del cliente (sin MAC address en web).
 */

/** UUID v4 persistido en localStorage['tabpos.deviceId']. Fallback sessionStorage, luego efímero. */
export function getDeviceId(): string {
  const KEY = 'tabpos.deviceId';
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    try {
      const stored = sessionStorage.getItem(KEY);
      if (stored) return stored;
      const id = crypto.randomUUID();
      sessionStorage.setItem(KEY, id);
      return id;
    } catch {
      return crypto.randomUUID(); // efímero
    }
  }
}

/** sha256 hex de (userAgent + language + screen + timezone + hardwareConcurrency). */
export async function getFingerprint(): Promise<string> {
  const parts = [
    navigator.userAgent,
    navigator.language,
    String(screen.width),
    String(screen.height),
    String(devicePixelRatio),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    String(navigator.hardwareConcurrency ?? 0),
  ].join('|');

  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
