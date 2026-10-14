/**
 * JChat 3.0 — what the app does with an auth deep link (jchat://confirm…) and with the URL an OAuth browser session
 * returns. Pure: no React, no Supabase, runs in Node tests.
 *
 * Why only `?code=`: the old implicit flow accepted `#access_token=…&refresh_token=…` straight from the URL and called
 * setSession with them, so ANY app or web page could open `jchat://confirm#access_token=<attacker's>…` and silently put
 * the victim in the attacker's account (session fixation, H-03). With PKCE (services/supabase.ts, flowType 'pkce') the
 * link carries only an authorization code, and the code can be exchanged only on the device that started the flow (it
 * needs the code verifier stored there). Tokens in a URL are therefore never accepted.
 */

export type AuthUrlAction =
  /** Not an auth confirmation link (a venue entry, a foreign scheme, anything else): leave it alone. */
  | { kind: 'ignore' }
  /** A confirmation link with an authorization code: exchange it (PKCE). */
  | { kind: 'exchange'; code: string }
  /** A confirmation link that must NOT be honoured: show the confirmation error. */
  | { kind: 'rejected'; reason: 'tokens_in_url' | 'no_code' };

/** `<scheme>://confirm` at the very start of the URL: host exactly `confirm`, so `https://x/?u=jchat://confirm` is not one. */
const CONFIRM_RE = /^([a-z][a-z0-9+.-]*):\/\/confirm(?=[/?#]|$)/i;
const CODE_RE = /^[A-Za-z0-9._~-]{8,512}$/;
const TOKEN_KEYS = ['access_token', 'refresh_token', 'provider_token', 'provider_refresh_token'];

function params(raw: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!raw) return out;
  for (const pair of raw.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    try {
      out.set(decodeURIComponent(eq >= 0 ? pair.slice(0, eq) : pair), decodeURIComponent(eq >= 0 ? pair.slice(eq + 1) : ''));
    } catch {
      /* malformed escape: skip the pair */
    }
  }
  return out;
}

function split(url: string): { query: Map<string, string>; fragment: Map<string, string> } {
  const hashAt = url.indexOf('#');
  const fragment = params(hashAt >= 0 ? url.slice(hashAt + 1) : undefined);
  const beforeHash = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const qAt = beforeHash.indexOf('?');
  return { query: params(qAt >= 0 ? beforeHash.slice(qAt + 1) : undefined), fragment };
}

/** The authorization code of a returned URL (`?code=`), or null. Fragment tokens are never read. */
export function readAuthCode(url: string): string | null {
  const code = split(url).query.get('code');
  return code && CODE_RE.test(code) ? code : null;
}

/** True when the URL carries session tokens (implicit flow shape). Such a URL is never used. */
export function carriesSessionTokens(url: string): boolean {
  const { query, fragment } = split(url);
  return TOKEN_KEYS.some((key) => fragment.has(key) || query.has(key));
}

/** Decision for a deep link that reached the app. */
export function classifyAuthUrl(url: string): AuthUrlAction {
  if (typeof url !== 'string' || !CONFIRM_RE.test(url)) return { kind: 'ignore' };
  if (carriesSessionTokens(url)) return { kind: 'rejected', reason: 'tokens_in_url' };
  const code = readAuthCode(url);
  return code ? { kind: 'exchange', code } : { kind: 'rejected', reason: 'no_code' };
}
