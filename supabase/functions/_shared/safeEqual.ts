/**
 * Constant-time string comparison for shared secrets (the x-push-secret header).
 * The loop always walks the whole expected value, so the time does not reveal where the first different byte is.
 * Only the LENGTH can leak, which is fine for a fixed-size random secret.
 */
export function safeEqual(provided: string, expected: string): boolean {
  const enc = new TextEncoder();
  const a = enc.encode(provided);
  const b = enc.encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < b.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
