/**
 * JChat 3.0 — i18n foundation (Tanda 1A, móvil)
 *
 * i18next + react-i18next (estándar de Expo). NO usa I18nextProvider —
 * `initReactI18next` conecta React internamente. Un solo namespace: 'common'.
 * Idioma inicial = locale del device (expo-localization), acotado a en/es con
 * fallback 'en'. La preferencia del usuario en BD (users.language) tiene prioridad
 * y se aplica tras el login vía changeAppLanguage() (ver AuthContext).
 *
 * Importar este módulo por su efecto (init) UNA vez, como primer import de App.tsx:
 *   import './i18n';
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from './locales/en/common.json';
import es from './locales/es/common.json';
import authEn from './locales/en/auth.json';
import authEs from './locales/es/auth.json';
import chatEn from './locales/en/chat.json';
import chatEs from './locales/es/chat.json';
import profileEn from './locales/en/profile.json';
import profileEs from './locales/es/profile.json';
import settingsEn from './locales/en/settings.json';
import settingsEs from './locales/es/settings.json';

export type SupportedLanguage = 'en' | 'es';

const SUPPORTED: readonly SupportedLanguage[] = ['en', 'es'];
const FALLBACK: SupportedLanguage = 'en';

export const resources = {
  en: { common: en, auth: authEn, chat: chatEn, profile: profileEn, settings: settingsEn },
  es: { common: es, auth: authEs, chat: chatEs, profile: profileEs, settings: settingsEs },
} as const;

/** Device language clamped to a supported one (expo-localization, SDK 56 API). */
function deviceLanguage(): SupportedLanguage {
  const code = getLocales()[0]?.languageCode ?? FALLBACK;
  return (SUPPORTED as readonly string[]).includes(code)
    ? (code as SupportedLanguage)
    : FALLBACK;
}

void i18n.use(initReactI18next).init({
  resources,
  lng: deviceLanguage(),
  fallbackLng: FALLBACK,
  ns: ['common', 'auth', 'chat', 'profile', 'settings'],
  defaultNS: 'common',
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
});

/** Switch the app language at runtime (no-op if already active or unsupported). */
export function changeAppLanguage(lang: SupportedLanguage): void {
  if (!(SUPPORTED as readonly string[]).includes(lang)) return;
  if (i18n.language !== lang) {
    void i18n.changeLanguage(lang);
  }
}

export default i18n;
