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
import socialEn from './locales/en/social.json';
import socialEs from './locales/es/social.json';
import posEn from './locales/en/pos.json';
import posEs from './locales/es/pos.json';
import feedEn from './locales/en/feed.json';
import feedEs from './locales/es/feed.json';
import onboardingEn from './locales/en/onboarding.json';
import onboardingEs from './locales/es/onboarding.json';
import reviewsEn from './locales/en/reviews.json';
import reviewsEs from './locales/es/reviews.json';
import loyaltyEn from './locales/en/loyalty.json';
import loyaltyEs from './locales/es/loyalty.json';
import eventsEn from './locales/en/events.json';
import eventsEs from './locales/es/events.json';
import reservationsEn from './locales/en/reservations.json';
import reservationsEs from './locales/es/reservations.json';
import nearbyEn from './locales/en/nearby.json';
import nearbyEs from './locales/es/nearby.json';
import mapEn from './locales/en/map.json';
import mapEs from './locales/es/map.json';

export type SupportedLanguage = 'en' | 'es';

const SUPPORTED: readonly SupportedLanguage[] = ['en', 'es'];
const FALLBACK: SupportedLanguage = 'en';

export const resources = {
  en: { common: en, auth: authEn, chat: chatEn, profile: profileEn, settings: settingsEn, social: socialEn, pos: posEn, feed: feedEn, onboarding: onboardingEn, reviews: reviewsEn, loyalty: loyaltyEn, events: eventsEn, reservations: reservationsEn, nearby: nearbyEn, map: mapEn },
  es: { common: es, auth: authEs, chat: chatEs, profile: profileEs, settings: settingsEs, social: socialEs, pos: posEs, feed: feedEs, onboarding: onboardingEs, reviews: reviewsEs, loyalty: loyaltyEs, events: eventsEs, reservations: reservationsEs, nearby: nearbyEs, map: mapEs },
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
  ns: ['common', 'auth', 'chat', 'profile', 'settings', 'social', 'pos', 'feed', 'onboarding', 'reviews', 'loyalty', 'events', 'reservations', 'nearby', 'map'],
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
