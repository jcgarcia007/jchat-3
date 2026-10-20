/**
 * JChat 3.0 — password rules for sign-up (pure: no React, no I/O, runs in Node tests).
 *
 * RegisterStep1Screen shows these three rules under the password field and blocks Continue until all hold. The
 * "leaked password" check (Have I Been Pwned) lives in services/pwned.ts; the helpers for it that need no I/O are here.
 */

export interface PasswordRules {
  minLength: boolean;
  hasLetter: boolean;
  hasNumber: boolean;
}

export const PASSWORD_MIN_LENGTH = 8;

export function passwordRules(pw: string): PasswordRules {
  return {
    minLength: pw.length >= PASSWORD_MIN_LENGTH,
    hasLetter: /\p{L}/u.test(pw),
    hasNumber: /\d/.test(pw),
  };
}

export function isPasswordValid(pw: string): boolean {
  const rules = passwordRules(pw);
  return rules.minLength && rules.hasLetter && rules.hasNumber;
}

/** Splits a SHA-1 hex digest the way the HIBP range API wants it: 5 chars go out, the other 35 never leave the phone. */
export function sha1Prefix(hashHex: string): { prefix: string; suffix: string } {
  const hash = hashHex.trim().toUpperCase();
  return { prefix: hash.slice(0, 5), suffix: hash.slice(5) };
}

/**
 * `rangeBody` is the API text: one "SUFFIX:COUNT" per line. True when `suffix` is one of them (case-insensitive).
 * With the `Add-Padding` header the API adds fake lines with COUNT 0: they are not breaches and never match.
 */
export function isHashInRange(suffix: string, rangeBody: string): boolean {
  const wanted = suffix.trim().toUpperCase();
  if (wanted === '') return false;
  return rangeBody.split(/\r?\n/).some((line) => {
    const [lineSuffix, count] = line.split(':');
    return lineSuffix.trim().toUpperCase() === wanted && Number(count?.trim() ?? '1') > 0;
  });
}
