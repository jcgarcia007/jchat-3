/**
 * JChat 3.0 — WebCrypto polyfill for iOS / Android. index.ts imports it FIRST, before anything creates the Supabase
 * client. See installWebCrypto.ts for the why. webcrypto.web.ts is the web counterpart: browsers already have it all.
 */

import { digest, getRandomBytes, type CryptoDigestAlgorithm } from 'expo-crypto';

import { installWebCrypto } from './installWebCrypto';

installWebCrypto(globalThis, {
  getRandomBytes,
  digest: (algorithm, data) => digest(algorithm as CryptoDigestAlgorithm, data),
});
