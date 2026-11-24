/**
 * The client's IP as the host (Vercel) reports it, for rate-limit hashes only. `x-vercel-forwarded-for` and `x-real-ip` are written by Vercel's
 * edge, so a client cannot choose them; `x-forwarded-for` (first entry) is only the last resort for local dev / non-Vercel hosts. Empty = unknown.
 */
export function clientIp(headers: { get(name: string): string | null }): string {
  return (
    headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip')?.trim() ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    ''
  );
}
