/**
 * JChat 3.0 — hCaptcha service (web) — same contract as captcha.tsx.
 *
 * Wraps @hcaptcha/react-hcaptcha in invisible mode and exposes `useCaptcha()` with the
 * same return shape and the same semantics as the native hook (see captcha.tsx header):
 *   • resolve(token)       → verification passed.
 *   • resolve(null)        → user closed the challenge, or kill-switch (no real sitekey).
 *   • reject(CaptchaError) → 'expired' | 'timeout' | 'network' | 'unavailable' | 'busy'.
 * The token is single-use, so it is requested at submit time and the widget is reset
 * after every attempt. Sitekey comes from EXPO_PUBLIC_HCAPTCHA_SITEKEY (via app config).
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import {
  CaptchaError,
  SITE_KEY,
  captchaErrorI18nKeys,
  isCaptchaEnabled,
  type CaptchaErrorCode,
  type UseCaptcha,
} from './captcha.shared';

export { CaptchaError, captchaErrorI18nKeys, isCaptchaEnabled };
export type { CaptchaErrorCode, UseCaptcha };

const GLOBAL_TIMEOUT_MS = 30000;

/** hCaptcha's execute() rejects with a string code ('challenge-closed', 'challenge-expired', ...). */
function rejectionCode(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return '';
}

export function useCaptcha(): UseCaptcha {
  const { i18n } = useTranslation();
  const widgetRef = useRef<HCaptcha>(null);
  const busyRef = useRef(false);

  const getCaptchaToken = useCallback(async (): Promise<string | null> => {
    if (!isCaptchaEnabled) return null;
    if (busyRef.current) throw new CaptchaError('busy');

    const widget = widgetRef.current;
    if (!widget || !widget.isReady()) throw new CaptchaError('unavailable');

    busyRef.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CaptchaError('timeout')), GLOBAL_TIMEOUT_MS);
      });
      const { response } = await Promise.race([widget.execute({ async: true }), timeout]);
      return response;
    } catch (err) {
      if (err instanceof CaptchaError) throw err;
      const code = rejectionCode(err);
      if (code === 'challenge-closed') return null;
      if (code === 'challenge-expired') throw new CaptchaError('expired');
      throw new CaptchaError('network');
    } finally {
      if (timer) clearTimeout(timer);
      busyRef.current = false;
      widget.resetCaptcha();
    }
  }, []);

  const languageCode = i18n.language?.toLowerCase().startsWith('es') ? 'es' : 'en';

  const CaptchaGate = useMemo<React.ReactElement | null>(() => {
    if (!isCaptchaEnabled) return null;
    return (
      <HCaptcha ref={widgetRef} sitekey={SITE_KEY} size="invisible" languageOverride={languageCode} />
    );
  }, [languageCode]);

  return { captchaEnabled: isCaptchaEnabled, getCaptchaToken, CaptchaGate };
}
