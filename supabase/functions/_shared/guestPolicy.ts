/**
 * Constantes de política para sesiones de invitado (Tab POS F3).
 * Usadas por la EF guest-tab y por RPCs de rechazo (F4).
 */

// Rate limits de intentos de código
export const CODE_ATTEMPTS_PER_DEVICE    = 5;   // en 5 minutos por device_id
export const CODE_ATTEMPTS_DEVICE_WIN_MS = 5 * 60 * 1000;

export const CODE_ATTEMPTS_PER_TABLE     = 10;  // en 10 minutos por tabla
export const CODE_ATTEMPTS_TABLE_WIN_MS  = 10 * 60 * 1000;

export const CODE_ATTEMPTS_PER_IP       = 20;  // en 10 minutos por ip_hash
export const CODE_ATTEMPTS_IP_WIN_MS    = 10 * 60 * 1000;

// Sesión de invitado
export const GUEST_SESSION_TTL_HOURS = 8;

// Bloqueo de dispositivo (strikes se implementan en F4)
export const STRIKES_TO_BLOCK = 2;
export const BLOCK_DAYS       = 30;

// ─── Helpers criptográficos ───────────────────────────────────────────────────

/** sha256 hex de un string — usa Web Crypto (Deno). */
export async function sha256Hex(s: string): Promise<string> {
  const encoded = new TextEncoder().encode(s);
  const buf     = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * sha256 hex de la IP del cliente.
 * Si existe GUEST_IP_SALT, la mezcla antes del hash para que el hash no
 * sea reversible por rainbow table. Si no hay salt, advierte y hashea de todas formas.
 */
export async function hashIp(ip: string): Promise<string> {
  const salt = Deno.env.get("GUEST_IP_SALT") ?? "";
  if (!salt) {
    console.warn("[guestPolicy] GUEST_IP_SALT not set — hashing IP without salt");
  }
  return sha256Hex(salt + ip);
}
