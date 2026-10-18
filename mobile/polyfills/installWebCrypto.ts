/**
 * JChat 3.0 — WebCrypto installer (pure: no I/O, no React, runs in Node tests).
 *
 * Why: @supabase/auth-js builds the PKCE challenge with `crypto.subtle.digest('SHA-256')` and a `TextEncoder`, and
 * draws the code verifier from `crypto.getRandomValues`. Hermes (React Native 0.86 / Expo 57) defines none of them
 * (Expo's runtime adds TextDecoder, not TextEncoder): auth-js warns "WebCrypto API is not supported" and falls back to
 * the `plain` method (challenge === verifier) and, with no `crypto` at all, to a Math.random() verifier. That defeats
 * what PKCE is for in services/supabase.ts (H-03).
 *
 * This fills ONLY what is missing: a platform that already has a piece keeps its own. On device the backend is
 * expo-crypto (webcrypto.ts); the tests use Node's crypto (scripts/webcrypto-polyfill.test.mjs).
 */

export type DigestName = 'SHA-256' | 'SHA-384' | 'SHA-512';

export interface WebCryptoBackend {
  /** Cryptographically secure random bytes (expo-crypto `getRandomBytes` on device). */
  getRandomBytes(byteCount: number): Uint8Array;
  /** Digest of `data` (expo-crypto `digest` on device). */
  digest(algorithm: DigestName, data: BufferSource): Promise<ArrayBuffer>;
}

/** What `installWebCrypto` had to add (all false when the platform already had everything). */
export interface InstallReport {
  crypto: boolean;
  getRandomValues: boolean;
  subtle: boolean;
  textEncoder: boolean;
}

/** The WebCrypto spec caps one getRandomValues call at 65 536 bytes. */
const MAX_RANDOM_BYTES = 65536;
const DIGEST_NAMES: readonly string[] = ['SHA-256', 'SHA-384', 'SHA-512'];

function webCryptoError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

function makeGetRandomValues(backend: WebCryptoBackend) {
  return function getRandomValues<T extends ArrayBufferView | null>(array: T): T {
    const view = array as ArrayBufferView | null;
    if (
      !ArrayBuffer.isView(view) ||
      view instanceof DataView ||
      view instanceof Float32Array ||
      view instanceof Float64Array
    ) {
      throw webCryptoError('TypeMismatchError', 'getRandomValues expects an integer typed array');
    }
    if (view.byteLength > MAX_RANDOM_BYTES) {
      throw webCryptoError('QuotaExceededError', `getRandomValues cannot fill more than ${MAX_RANDOM_BYTES} bytes`);
    }
    // Fill through a byte view so any integer array (auth-js passes a Uint32Array) works, whatever the native layer accepts.
    new Uint8Array(view.buffer, view.byteOffset, view.byteLength).set(backend.getRandomBytes(view.byteLength));
    return array;
  };
}

function makeDigest(backend: WebCryptoBackend) {
  return async function digest(algorithm: string | { name: string }, data: BufferSource): Promise<ArrayBuffer> {
    const name = (typeof algorithm === 'string' ? algorithm : algorithm.name).toUpperCase();
    if (!DIGEST_NAMES.includes(name)) {
      throw webCryptoError('NotSupportedError', `Unsupported digest algorithm: ${name}`);
    }
    return backend.digest(name as DigestName, data);
  };
}

/** Minimal UTF-8 TextEncoder (`encode` only: it is all auth-js uses). Lone surrogates become U+FFFD, as in the spec. */
class Utf8Encoder {
  readonly encoding = 'utf-8';

  encode(input: string = ''): Uint8Array {
    const bytes: number[] = [];
    for (const char of String(input)) {
      let codePoint = char.codePointAt(0) as number;
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) codePoint = 0xfffd;
      if (codePoint < 0x80) {
        bytes.push(codePoint);
      } else if (codePoint < 0x800) {
        bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
      } else if (codePoint < 0x10000) {
        bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
      } else {
        bytes.push(
          0xf0 | (codePoint >> 18),
          0x80 | ((codePoint >> 12) & 0x3f),
          0x80 | ((codePoint >> 6) & 0x3f),
          0x80 | (codePoint & 0x3f),
        );
      }
    }
    return new Uint8Array(bytes);
  }
}

/**
 * Adds `crypto`, `crypto.getRandomValues`, `crypto.subtle.digest` and `TextEncoder` to `target` when absent.
 * Never replaces an existing one and never throws: a sealed `crypto` is left as it is (auth-js then degrades as before).
 */
export function installWebCrypto(target: object, backend: WebCryptoBackend): InstallReport {
  const report: InstallReport = { crypto: false, getRandomValues: false, subtle: false, textEncoder: false };
  const globals = target as { crypto?: Record<string, unknown> | null; TextEncoder?: unknown };

  try {
    if (globals.crypto == null) {
      Object.defineProperty(target, 'crypto', { value: {}, configurable: true, writable: true });
      report.crypto = true;
    }
    const cryptoObject = globals.crypto as Record<string, unknown>;
    if (typeof cryptoObject.getRandomValues !== 'function') {
      cryptoObject.getRandomValues = makeGetRandomValues(backend);
      report.getRandomValues = true;
    }
    if (cryptoObject.subtle == null) {
      cryptoObject.subtle = { digest: makeDigest(backend) };
      report.subtle = true;
    }
  } catch {
    // crypto exists but is frozen / non-extensible: keep whatever it already has.
  }

  try {
    if (typeof globals.TextEncoder === 'undefined') {
      Object.defineProperty(target, 'TextEncoder', { value: Utf8Encoder, configurable: true, writable: true });
      report.textEncoder = true;
    }
  } catch {
    // non-extensible global object: nothing to do.
  }

  return report;
}
