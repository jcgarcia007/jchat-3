/**
 * JChat 3.0 — "has this password appeared in a data breach?" (Have I Been Pwned, k-anonymity range API).
 * Web version of mobile/services/pwned.ts (same criterion, Web Crypto instead of expo-crypto).
 *
 * Supabase has "Prevent use of leaked passwords" on, so sign-up would fail at step 2. Asking here lets step 1 say so
 * first. Only the first 5 characters of the password's SHA-1 are sent; the password and the rest of the hash never
 * leave the browser. Any network error or timeout gives 'unknown': the user goes on and the server has the last word.
 */

import { isHashInRange, sha1Prefix } from "@/lib/password";

export type PwnedResult = "leaked" | "ok" | "unknown";

const RANGE_URL = "https://api.pwnedpasswords.com/range/";
const TIMEOUT_MS = 4_000;

export async function checkPwnedPassword(pw: string): Promise<PwnedResult> {
  try {
    const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(pw));
    const hashHex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    const { prefix, suffix } = sha1Prefix(hashHex);
    const response = await fetch(`${RANGE_URL}${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return "unknown";
    return isHashInRange(suffix, await response.text()) ? "leaked" : "ok";
  } catch {
    return "unknown";
  }
}
