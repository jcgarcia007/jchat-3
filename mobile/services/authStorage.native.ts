/**
 * Where the Supabase session is stored on iOS / Android (H-005): Keychain / Keystore through expo-secure-store, in chunks, with a one-time migration from
 * AsyncStorage. The logic lives in secureSessionStore.ts (unit-tested). The web build resolves authStorage.ts instead.
 *
 * AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: readable by a background token refresh after the first unlock, never restored to another device from a backup.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createSecureSessionStorage } from './secureSessionStore';

const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export const authStorage = createSecureSessionStorage({
  secure: {
    getItem: (key) => SecureStore.getItemAsync(key, options),
    setItem: (key, value) => SecureStore.setItemAsync(key, value, options),
    removeItem: (key) => SecureStore.deleteItemAsync(key, options),
  },
  legacy: AsyncStorage,
});
