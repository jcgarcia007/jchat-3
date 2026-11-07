/** Apple's one-time authorizationCode from a native credential, or null when it is missing/blank (D3: it is traded for a refresh token server-side). */
export function pickAuthorizationCode(credential: { authorizationCode?: string | null } | null | undefined): string | null {
  const code = credential?.authorizationCode;
  if (typeof code !== 'string') return null;
  const trimmed = code.trim();
  return trimmed.length > 0 ? trimmed : null;
}
