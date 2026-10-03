/**
 * JChat 3.0 — Language picked on the login screen (before there is an account).
 *
 * The ES · EN selector stores the explicit choice locally so it survives an app restart while
 * signed out. On the FIRST sign-in, AuthContext saves it to the account (updateMyLanguage), lets it
 * win over users.language, and then clears this mark (from then on the account value rules).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const LANGUAGE_CHOICE_KEY = '@jchat/language_choice';

export type LanguageChoice = 'en' | 'es';

export async function getLanguageChoice(): Promise<LanguageChoice | null> {
  try {
    const value = await AsyncStorage.getItem(LANGUAGE_CHOICE_KEY);
    return value === 'en' || value === 'es' ? value : null;
  } catch {
    return null;
  }
}

export async function setLanguageChoice(language: LanguageChoice): Promise<void> {
  try {
    await AsyncStorage.setItem(LANGUAGE_CHOICE_KEY, language);
  } catch {
    // best-effort: the in-memory language still changed
  }
}

export async function clearLanguageChoice(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LANGUAGE_CHOICE_KEY);
  } catch {
    // best-effort
  }
}
