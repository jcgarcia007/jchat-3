/**
 * JChat 3.0 — Biometric helpers (M2)
 *
 * Thin wrappers around expo-local-authentication + an AsyncStorage opt-in flag.
 * The app-lock gate (LockScreen) and the Settings toggle both consume these.
 *
 * Design decisions (see M2):
 *  - Biometric app-lock is OPT-IN (off by default), stored locally per device.
 *  - The lock only engages on COLD START (handled in AuthContext), never on a
 *    fresh login or when returning from background.
 *  - No custom passcode fallback: if Face ID / Touch ID fails, the user signs out.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

/** Local flag key — whether the user opted into biometric app-lock on this device. */
const BIOMETRIC_ENABLED_KEY = '@jchat/biometric_enabled';

/** Local flag key — whether we already showed the post-login enrollment prompt. */
const BIOMETRIC_PROMPTED_KEY = '@jchat/biometric_prompted';

/** ¿Ya se le mostró el prompt de enrolamiento al usuario en este device? */
export async function wasBiometricPrompted(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(BIOMETRIC_PROMPTED_KEY)) === 'true';
  } catch {
    return false;
  }
}

/** Marcar que ya se mostró el prompt (independiente de si aceptó o no). */
export async function setBiometricPrompted(): Promise<void> {
  try {
    await AsyncStorage.setItem(BIOMETRIC_PROMPTED_KEY, 'true');
  } catch {
    // best-effort
  }
}

/**
 * Etiqueta legible del método biométrico disponible en el device, para el copy.
 * Devuelve 'face' | 'fingerprint' | 'generic'. El componente mapea a i18n.
 */
export async function biometricKind(): Promise<'face' | 'fingerprint' | 'generic'> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint';
    return 'generic';
  } catch {
    return 'generic';
  }
}

/** True only if the device has biometric hardware AND the user has enrolled a face/fingerprint. */
export async function canUseBiometrics(): Promise<boolean> {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hasHardware && isEnrolled;
}

/**
 * Prompt the native biometric dialog once. Returns true on success.
 * Cancels/failures return false (the caller decides what to do). No passcode
 * fallback is offered (`disableDeviceFallback: true`) — product decision.
 */
export async function authenticateBiometric(promptMessage: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    disableDeviceFallback: true,
    cancelLabel: undefined,
  });
  return result.success;
}

/** Read the local opt-in flag. Defaults to false (biometric lock is opt-in). */
export async function isBiometricEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY)) === 'true';
  } catch {
    return false;
  }
}

/** Persist the local opt-in flag. */
export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
    } else {
      await AsyncStorage.removeItem(BIOMETRIC_ENABLED_KEY);
    }
  } catch {
    // Best-effort; a failed write just means the lock stays in its prior state.
  }
}
