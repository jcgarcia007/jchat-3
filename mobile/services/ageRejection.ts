/**
 * JChat 3.0 — the device remembers an age rejection for 24 h (audit B2-13). See utils/ageRejection.ts: only a timestamp is stored.
 * Every function swallows storage errors: a device that can not store it simply does not block.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AGE_REJECTION_KEY, isAgeRejectionActive, parseAgeRejection } from '../utils/ageRejection';

export async function recordAgeRejection(now: number = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(AGE_REJECTION_KEY, String(now));
  } catch {
    // not stored → no block
  }
}

/** True while a rejection from the last 24 h is stored (an expired one is removed). */
export async function hasActiveAgeRejection(now: number = Date.now()): Promise<boolean> {
  try {
    const stored = parseAgeRejection(await AsyncStorage.getItem(AGE_REJECTION_KEY));
    if (isAgeRejectionActive(stored, now)) return true;
    if (stored !== null) await AsyncStorage.removeItem(AGE_REJECTION_KEY);
    return false;
  } catch {
    return false;
  }
}
