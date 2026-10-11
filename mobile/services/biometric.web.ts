/**
 * JChat 3.0 — Biometric helpers (web). Same exports as biometric.ts; the browser has no
 * app-lock biometrics, so nothing is available and no prompt is ever due.
 */

export async function wasBiometricPrompted(): Promise<boolean> {
  return true;
}

export async function setBiometricPrompted(): Promise<void> {}

export async function biometricKind(): Promise<'face' | 'fingerprint' | 'generic'> {
  return 'generic';
}

/** isAvailable: false — never offered on web. */
export async function canUseBiometrics(): Promise<boolean> {
  return false;
}

export async function authenticateBiometric(_promptMessage: string): Promise<boolean> {
  return false;
}

export async function isBiometricEnabled(): Promise<boolean> {
  return false;
}

export async function setBiometricEnabled(_enabled: boolean): Promise<void> {}
