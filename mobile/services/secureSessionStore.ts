/**
 * JChat 3.0 — secure storage for the Supabase session (H-005): the pure logic, with its backends injected (so it runs in plain Node tests).
 *
 * Devices wire it to expo-secure-store (iOS Keychain / Android Keystore) in authStorage.native.ts; the web keeps AsyncStorage (authStorage.ts).
 *
 * Why chunks: a Supabase session (access token + refresh token + user with identities / metadata) is a few KB. Older SecureStore versions warned above
 * 2048 bytes, so each value is split in pieces of CHUNK_SIZE characters (`<key>.0 … <key>.n-1`) plus a meta entry `<key>.meta` = {"n":<chunks>,"len":<total length>}
 * written LAST: a reader never sees a half-written value, and a missing / altered chunk is detected (length check) and treated as "no session".
 *
 * Migration: the first read of a key whose secure entry has no marker looks for the old AsyncStorage value; if there is one it is copied to the secure
 * store (write → read back → marker → only then delete the old copy). A failing secure store never loses the session: the value is written to / read from
 * AsyncStorage instead and is migrated on a later launch.
 *
 * Reinstall: the iOS Keychain survives uninstalling the app but AsyncStorage does not. The marker (`jchat.secure.<key>` in AsyncStorage) therefore also says
 * "this secure entry belongs to this install": secure entry without marker and without an old AsyncStorage copy = left over from a previous install → wiped.
 */

export const CHUNK_SIZE = 1800;
const MARKER_PREFIX = 'jchat.secure.';

export interface KeyValueBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface SecureSessionStorageOptions {
  /** The secure store (expo-secure-store). */
  secure: KeyValueBackend;
  /** AsyncStorage: the old home of the session, the marker, and the fallback when the secure store fails. */
  legacy: KeyValueBackend;
  chunkSize?: number;
}

/** SecureStore keys may only contain letters, digits, ".", "-" and "_". */
export function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

export function createSecureSessionStorage({ secure, legacy, chunkSize = CHUNK_SIZE }: SecureSessionStorageOptions): KeyValueBackend {
  const meta = (k: string): string => `${safeKey(k)}.meta`;
  const chunk = (k: string, i: number): string => `${safeKey(k)}.${i}`;
  const marker = (k: string): string => `${MARKER_PREFIX}${safeKey(k)}`;

  /** The stored chunks of `key` joined, or null when absent / incomplete / altered (never throws). */
  async function readSecure(key: string): Promise<string | null> {
    try {
      const rawMeta = await secure.getItem(meta(key));
      if (rawMeta == null) return null;
      const parsed = JSON.parse(rawMeta) as { n?: unknown; len?: unknown };
      const n = parsed.n;
      const len = parsed.len;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 1000 || typeof len !== 'number') return null;
      let out = '';
      for (let i = 0; i < n; i++) {
        const part = await secure.getItem(chunk(key, i));
        if (part == null) return null;
        out += part;
      }
      return out.length === len ? out : null;
    } catch {
      return null;
    }
  }

  /** How many chunks the meta entry says exist (0 when unknown); used only to clean up. */
  async function chunkCount(key: string): Promise<number> {
    try {
      const rawMeta = await secure.getItem(meta(key));
      const n = rawMeta == null ? 0 : (JSON.parse(rawMeta) as { n?: unknown }).n;
      return typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 1000 ? n : 0;
    } catch {
      return 0;
    }
  }

  async function removeSecure(key: string): Promise<void> {
    try {
      const n = await chunkCount(key);
      for (let i = 0; i < n; i++) await secure.removeItem(chunk(key, i)).catch(() => undefined);
      await secure.removeItem(meta(key)).catch(() => undefined);
    } catch {
      /* best effort */
    }
  }

  /** Chunks first, meta last, then the leftovers of a longer previous value. Throws when the secure store fails. */
  async function writeSecure(key: string, value: string): Promise<void> {
    const previous = await chunkCount(key);
    const parts: string[] = [];
    for (let i = 0; i < value.length; i += chunkSize) parts.push(value.slice(i, i + chunkSize));
    for (let i = 0; i < parts.length; i++) await secure.setItem(chunk(key, i), parts[i]);
    await secure.setItem(meta(key), JSON.stringify({ n: parts.length, len: value.length }));
    for (let i = parts.length; i < previous; i++) await secure.removeItem(chunk(key, i)).catch(() => undefined);
  }

  async function hasMarker(key: string): Promise<boolean> {
    try {
      return (await legacy.getItem(marker(key))) === '1';
    } catch {
      return false;
    }
  }

  return {
    async getItem(key) {
      try {
        if (await hasMarker(key)) {
          return await readSecure(key); // null when corrupt → signed out, never a crash
        }
        const old = await legacy.getItem(key);
        if (old == null) {
          // No old copy and no marker: whatever is in the secure store is a leftover of a previous install (Keychain survives uninstall).
          await removeSecure(key);
          return null;
        }
        // Migrate: write → read back → marker → delete the old copy. Any failure keeps the old copy and still answers with it.
        try {
          await writeSecure(key, old);
          if ((await readSecure(key)) === old) {
            await legacy.setItem(marker(key), '1');
            await legacy.removeItem(key);
          }
        } catch {
          /* stays in AsyncStorage; tried again next launch */
        }
        return old;
      } catch {
        return null;
      }
    },

    async setItem(key, value) {
      try {
        await writeSecure(key, value);
        await legacy.setItem(marker(key), '1');
        await legacy.removeItem(key).catch(() => undefined); // an old copy must not outlive the new value
      } catch {
        // The secure store failed: keep the session in AsyncStorage rather than losing it.
        await legacy.removeItem(marker(key)).catch(() => undefined);
        await legacy.setItem(key, value);
      }
    },

    async removeItem(key) {
      await removeSecure(key);
      await legacy.removeItem(marker(key)).catch(() => undefined);
      await legacy.removeItem(key).catch(() => undefined);
    },
  };
}
