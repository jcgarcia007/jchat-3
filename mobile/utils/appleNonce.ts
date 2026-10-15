/**
 * JChat 3.0 — nonce of Sign in with Apple (pure: no native module, runs in Node tests).
 *
 * Apple receives the SHA-256 (hex) of a random string and puts it in the identity token; Supabase receives the RAW string
 * and recomputes the hash to compare (replay protection). So `raw` goes to Supabase and `hashed` goes to Apple — never the
 * other way round.
 */

/** 32 random bytes → 64 hex chars (256 bits). */
export const NONCE_BYTES = 32;

export function bytesToHex(bytes: ArrayLike<number>): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += (bytes[i] & 0xff).toString(16).padStart(2, '0');
  return out;
}

export interface AppleNonce {
  /** For Supabase (`signInWithIdToken({ nonce })`). */
  raw: string;
  /** For Apple (`signInAsync({ nonce })`): sha256(raw) as lowercase hex. */
  hashed: string;
}

export async function createAppleNonce(deps: {
  randomBytes: (length: number) => ArrayLike<number>;
  sha256Hex: (value: string) => Promise<string>;
}): Promise<AppleNonce> {
  const raw = bytesToHex(deps.randomBytes(NONCE_BYTES));
  const hashed = (await deps.sha256Hex(raw)).toLowerCase();
  return { raw, hashed };
}
