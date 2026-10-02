import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

export type AppearancePreference = 'dark' | 'light' | 'system';

const APPEARANCE_STORAGE_KEY = 'appearance.preference';

function isAppearancePreference(value: string | null): value is AppearancePreference {
  return value === 'dark' || value === 'light' || value === 'system';
}

export async function applyAppearance(preference: AppearancePreference): Promise<void> {
  Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, preference);
}

export async function loadStoredAppearance(): Promise<AppearancePreference | null> {
  const stored = await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY);
  return isAppearancePreference(stored) ? stored : null;
}
