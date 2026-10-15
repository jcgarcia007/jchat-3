/**
 * JChat 3.0 — native Sign in with Apple: NOT available here (Android, web). See appleSignIn.ios.ts. Those platforms keep
 * the browser OAuth flow of LoginScreen / RegisterStep1Screen.
 */

export async function isNativeAppleSignInAvailable(): Promise<boolean> {
  return false;
}

export type AppleSignInResult = { status: 'signed_in' } | { status: 'cancelled' };

export async function signInWithApple(): Promise<AppleSignInResult> {
  throw new Error('apple_native_unavailable');
}
