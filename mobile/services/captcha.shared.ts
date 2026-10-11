/**
 * JChat 3.0 — hCaptcha: pieces shared by captcha.tsx (native SDK) and captcha.web.tsx
 * (@hcaptcha/react-hcaptcha). Sitekey, kill-switch, typed errors and i18n key mapping live
 * here so both platforms expose exactly the same contract (see captcha.tsx header).
 */

import type React from 'react';
import Constants from 'expo-constants';

const PLACEHOLDER_SITEKEY = 'PENDIENTE_SITEKEY';

export const SITE_KEY: string =
  (Constants.expoConfig?.extra?.hcaptchaSiteKey as string | undefined)?.trim() ?? '';

/** True cuando hay una sitekey real configurada (no vacía, no placeholder). */
export const isCaptchaEnabled: boolean =
  SITE_KEY.length > 0 && SITE_KEY !== PLACEHOLDER_SITEKEY;

export type CaptchaErrorCode = 'busy' | 'network' | 'timeout' | 'unavailable' | 'expired';

export class CaptchaError extends Error {
  code: CaptchaErrorCode;
  constructor(code: CaptchaErrorCode) {
    super(code);
    this.name = 'CaptchaError';
    this.code = code;
  }
}

/**
 * Mapea un error de `getCaptchaToken()` a las claves i18n (namespace 'auth') del
 * Alert. Centralizado para que LoginScreen y RegisterStep2 no dupliquen el switch.
 */
export function captchaErrorI18nKeys(err: unknown): { titleKey: string; messageKey: string } {
  const code: CaptchaErrorCode = err instanceof CaptchaError ? err.code : 'network';
  switch (code) {
    case 'expired':
      return { titleKey: 'captcha.expiredTitle', messageKey: 'captcha.expiredMessage' };
    case 'timeout':
      return { titleKey: 'captcha.timeoutTitle', messageKey: 'captcha.timeoutMessage' };
    case 'busy':
      return { titleKey: 'captcha.busyTitle', messageKey: 'captcha.busyMessage' };
    case 'network':
    case 'unavailable':
    default:
      return { titleKey: 'captcha.errorTitle', messageKey: 'captcha.errorMessage' };
  }
}

export type UseCaptcha = {
  /** Hay sitekey real: hay que pedir token y abortar si el usuario cancela. */
  captchaEnabled: boolean;
  /**
   * Muestra el reto invisible y resuelve con el token, o `null` si el usuario
   * cancela (o si el kill-switch está activo). Rechaza con `CaptchaError` (ver
   * `.code`) en expiración, timeout, fallo de red o si el componente no está montado.
   */
  getCaptchaToken: () => Promise<string | null>;
  /** Elemento a renderizar en el árbol del consumidor (null si el captcha está off). */
  CaptchaGate: React.ReactElement | null;
};
