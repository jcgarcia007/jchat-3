/**
 * JChat 3.0 — native Sign in with Apple (iOS). Apple requires the native flow and the official button (guideline 4.8 + HIG).
 *
 * Flow: a random raw nonce → Apple gets its SHA-256 (hex) → `signInAsync` → the identity token goes to Supabase with the RAW
 * nonce (`signInWithIdToken`, provider apple). Apple returns the name and e-mail only the first time: when the profile has no
 * display name yet the name is saved there. Console side: the Apple provider in Supabase needs the BUNDLE ID
 * (com.juangarciacruz.jchatapp) in "Client IDs" — the native flow uses it, not the Service ID.
 *
 * Nothing sensitive is logged (no token, nonce, e-mail).
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import { createAppleNonce } from '../utils/appleNonce';
import { displayNameFromApple, shouldSaveAppleName } from '../utils/appleName';
import { supabase } from './supabase';

export type AppleSignInResult = { status: 'signed_in' } | { status: 'cancelled' };

export function isNativeAppleSignInAvailable(): Promise<boolean> {
  return AppleAuthentication.isAvailableAsync().catch(() => false);
}

export async function signInWithApple(): Promise<AppleSignInResult> {
  const nonce = await createAppleNonce({
    randomBytes: (length) => Crypto.getRandomBytes(length),
    sha256Hex: (value) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, { encoding: Crypto.CryptoEncoding.HEX }),
  });

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: nonce.hashed,
    });
  } catch (err) {
    if ((err as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED') return { status: 'cancelled' };
    throw err;
  }
  if (!credential.identityToken) throw new Error('apple_no_identity_token');

  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: nonce.raw });
  if (error) throw error;

  // Apple's name arrives only now: keep it when the profile has none (best effort, never blocks the sign-in).
  const appleName = displayNameFromApple(credential.fullName);
  const userId = data.user?.id;
  if (appleName && userId) {
    try {
      const { data: row } = await supabase.from('users').select('display_name').eq('id', userId).maybeSingle();
      if (shouldSaveAppleName((row as { display_name: string | null } | null)?.display_name, appleName)) {
        await supabase.from('users').update({ display_name: appleName }).eq('id', userId);
      }
    } catch {
      /* the name is optional */
    }
  }
  return { status: 'signed_in' };
}
