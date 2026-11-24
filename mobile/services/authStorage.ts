/**
 * Where the Supabase session is stored — web (and anything without a platform file): AsyncStorage, as before.
 * Devices use authStorage.native.ts (expo-secure-store, chunked; see secureSessionStore.ts).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const authStorage = AsyncStorage;
