/**
 * JChat 3.0 — strict, nonce-based Content-Security-Policy (Lote 3, H-002 / H-066). REPORT-ONLY.
 *
 * The policy that is ENFORCED today is `buildCsp` in next.config.ts and it is not touched. This module builds a second,
 * stricter policy that middleware.ts sends as `Content-Security-Policy-Report-Only`, so real violations are collected
 * (POST /api/csp-report?p=strict) without being able to break anything.
 *
 * It is the same policy as `buildCsp` except for `script-src`: `'self' 'nonce-…' 'strict-dynamic'` plus `https:` and
 * `'unsafe-inline'` only as a fallback for old browsers (a browser that understands nonces ignores both of them),
 * and no `'unsafe-eval'` in production (Next needs it in development only).
 *
 * Pure: no imports, so it runs under `node --test`. The caller passes the `frame-ancestors` value (lib/embedOrigins.ts owns it).
 */

/**
 * Master switch of the strict policy. OFF (Juan, 27-nov-2026: after launch). With `false` middleware.ts generates no nonce, sets no
 * `x-nonce`, writes no CSP header on the request and no `Content-Security-Policy-Report-Only` on the response: it behaves as at cbcdc1b6.
 * Why it is off (HALLAZGOS.md H-066): on Vercel the function receives a `content-security-policy` REQUEST header of 1139 chars without a
 * nonce — the enforced policy from next.config.ts `headers()`, which the platform also puts on the request and which overrides the one the
 * middleware sets (the strict one is 1050 chars). Next reads `content-security-policy` before `-report-only`, so it renders without nonce.
 * Pending fix: emit the ENFORCED policy from the middleware instead of `headers()`, so there is a single source of that header.
 */
export const STRICT_CSP_REPORT_ONLY_ENABLED = false;

const SUPABASE = 'https://klfsgcfoahdtkojyqspd.supabase.co';
const SUPABASE_WS = 'wss://klfsgcfoahdtkojyqspd.supabase.co';

/** Every directive of next.config.ts `buildCsp` except `script-src` and `frame-ancestors` (a test keeps both lists in step). */
export const SHARED_DIRECTIVES: readonly string[] = [
  `default-src 'self'`,
  `style-src 'self' 'unsafe-inline' https://hcaptcha.com https://*.hcaptcha.com https://fonts.googleapis.com`,
  `img-src 'self' data: blob: ${SUPABASE} https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.googleusercontent.com https://*.ggpht.com https://q.stripe.com`,
  `font-src 'self' data: https://fonts.gstatic.com`,
  `connect-src 'self' ${SUPABASE} ${SUPABASE_WS} https://api.stripe.com https://m.stripe.network https://maps.googleapis.com https://*.googleapis.com https://*.gstatic.com https://hcaptcha.com https://*.hcaptcha.com https://api.pwnedpasswords.com`,
  `frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://m.stripe.network https://hcaptcha.com https://*.hcaptcha.com`,
  `worker-src 'self' blob:`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
];

/** Where the strict policy reports to; `?p=strict` tells /api/csp-report which policy the violation came from. */
export const STRICT_REPORT_URI = '/api/csp-report?p=strict';

/** A fresh per-request nonce: 16 random bytes from the Web Crypto API, base64 (valid in the CSP `'nonce-…'` grammar). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The public menu `/m` and `/m/*` is the only embeddable area (same split as the `headers()` sources in next.config.ts). */
export function isEmbeddablePath(pathname: string): boolean {
  return pathname === '/m' || pathname.startsWith('/m/');
}

export interface StrictCspOptions {
  nonce: string;
  /** Value of `frame-ancestors`: `'none'`, or `frameAncestorsForEmbed(isProduction)` for /m/*. */
  frameAncestors: string;
  /** `true` in `next dev`: Next/React need `'unsafe-eval'` there; never in production. */
  isDev: boolean;
}

export function buildStrictCsp({ nonce, frameAncestors, isDev }: StrictCspOptions): string {
  const scriptSrc = [`'self'`, `'nonce-${nonce}'`, `'strict-dynamic'`, 'https:', `'unsafe-inline'`, ...(isDev ? [`'unsafe-eval'`] : [])];
  return [
    SHARED_DIRECTIVES[0],
    `script-src ${scriptSrc.join(' ')}`,
    ...SHARED_DIRECTIVES.slice(1),
    `frame-ancestors ${frameAncestors}`,
    `report-uri ${STRICT_REPORT_URI}`,
  ].join('; ');
}
