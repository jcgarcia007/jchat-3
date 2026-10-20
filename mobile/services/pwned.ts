/**
 * JChat 3.0 — "has this password appeared in a data breach?" (Have I Been Pwned, k-anonymity range API).
 *
 * Supabase has "Prevent use of leaked passwords" on, so sign-up would fail at step 2. Asking here lets step 1 say so
 * first. Only the first 5 characters of the password's SHA-1 are sent; the password and the rest of the hash never
 * leave the phone. Any network error or timeout gives 'unknown': the user goes on and the server has the last word.
 */

import * as Crypto from 'expo-crypto';
import { createFetchWithTimeout } from './fetchWithTimeout';
import { isHashInRange, sha1Prefix } from '../utils/password';

export type PwnedResult = 'leaked' | 'ok' | 'unknown';

const RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const TIMEOUT_MS = 4_000;

const fetchRange = createFetchWithTimeout({ defaultMs: TIMEOUT_MS });

export async function checkPwnedPassword(pw: string): Promise<PwnedResult> {
  try {
    const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA1, pw);
    const { prefix, suffix } = sha1Prefix(hash);
    const response = await fetchRange(`${RANGE_URL}${prefix}`, { headers: { 'Add-Padding': 'true' } });
    if (!response.ok) return 'unknown';
    return isHashInRange(suffix, await response.text()) ? 'leaked' : 'ok';
  } catch {
    return 'unknown';
  }
}
