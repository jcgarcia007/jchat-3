/**
 * JChat 3.0 — hCaptcha service (decisión D-38)
 *
 * Envuelve el SDK oficial `@hcaptcha/react-native-hcaptcha` (ConfirmHcaptcha,
 * modo `invisible`) y expone un hook reusable:
 *
 *     const { captchaEnabled, getCaptchaToken, CaptchaGate } = useCaptcha();
 *
 * El consumidor DEBE renderizar `{CaptchaGate}` en su árbol (renderiza `null`
 * salvo cuando el reto está visible) y llamar a `getCaptchaToken()` EN EL SUBMIT.
 *
 * ── Por qué en el submit y no al montar ─────────────────────────────────────
 * El token de hCaptcha es de UN SOLO USO y expira (~120 s). El SDK de RN no tiene
 * un `onExpire` equivalente al de la web, así que no se precarga: se pide justo
 * antes de la llamada a Supabase y se descarta tras cada intento (éxito o fallo).
 *
 * ── Kill-switch ─────────────────────────────────────────────────────────────
 * Si la sitekey está vacía o es el placeholder "PENDIENTE_SITEKEY",
 * `captchaEnabled` es `false` y `getCaptchaToken()` resuelve `null` de inmediato
 * sin montar nada. Esto permite desarrollar sin la key real.
 *
 * ── Semántica de retorno (INVARIANTE: la promesa SIEMPRE se settle) ──────────
 *   • resolve(token: string) → verificación superada.
 *   • resolve(null)          → cancelado por el usuario, O kill-switch.
 *                              El consumidor distingue ambos con `captchaEnabled`.
 *   • reject(CaptchaError)   → fallo distinguible por `.code`:
 *        'expired'     el token caducó antes de usarse → reintentar.
 *        'timeout'     el reto no respondió en GLOBAL_TIMEOUT_MS.
 *        'network'     el WebView falló al cargar / error del SDK.
 *        'unavailable' el componente no estaba montado (ref null).
 *        'busy'        ya hay una verificación en curso.
 *
 * IMPORTANTE: el CAPTCHA de Supabase es global y hoy está APAGADO. Con él apagado
 * Supabase ignora el `captchaToken`, así que enviar el token siempre es seguro.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import ConfirmHcaptcha from '@hcaptcha/react-native-hcaptcha';

// ---------------------------------------------------------------------------
// Config — sitekey desde app.config.ts → extra.hcaptchaSiteKey
// (EXPO_PUBLIC_HCAPTCHA_SITEKEY). La SECRET key NUNCA vive en el cliente:
// va sólo en el dashboard de Supabase.
// ---------------------------------------------------------------------------
const PLACEHOLDER_SITEKEY = 'PENDIENTE_SITEKEY';

const SITE_KEY: string =
  (Constants.expoConfig?.extra?.hcaptchaSiteKey as string | undefined)?.trim() ?? '';

/** True cuando hay una sitekey real configurada (no vacía, no placeholder). */
export const isCaptchaEnabled: boolean =
  SITE_KEY.length > 0 && SITE_KEY !== PLACEHOLDER_SITEKEY;

// Hostname que hCaptcha valida contra la lista de hosts de la sitekey. Usamos
// jchat.cloud en web y móvil → un solo dominio que registrar en el panel de hCaptcha.
const BASE_URL = 'https://jchat.cloud';

// Timeout global de seguridad. Mayor que el timeout de CARGA del SDK (15 s) para no
// pisarlo: cubre el caso de que el WebView cargue pero luego no emita (p. ej. la app
// pasa a background en mitad del reto), que el SDK no maneja.
const GLOBAL_TIMEOUT_MS = 30000;

// ---------------------------------------------------------------------------
// Errores distinguibles — el consumidor mapea `.code` a un mensaje i18n concreto.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Tipo estructural del evento de onMessage.
// `CustomWebViewMessageEvent` del SDK no se exporta; este supertipo mínimo es
// contravariantemente compatible con la prop `onMessage`.
// ---------------------------------------------------------------------------
type HcaptchaEvent = {
  nativeEvent: { data: string };
  success?: boolean;
  markUsed?: () => void;
  reset?: () => void;
};

type Settler = {
  resolve: (token: string | null) => void;
  reject: (err: CaptchaError) => void;
};

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

export function useCaptcha(): UseCaptcha {
  const { i18n } = useTranslation();
  const captchaRef = useRef<ConfirmHcaptcha>(null);
  const settlerRef = useRef<Settler | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Punto ÚNICO de terminación: cancela el timer global, limpia settlerRef, cierra el
  // modal y aplica resolve/reject. Idempotente: si no hay settler pendiente, no hace nada.
  // Garantiza el invariante: tras settle(), settlerRef.current === null.
  const settle = useCallback((apply: (s: Settler) => void) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const s = settlerRef.current;
    settlerRef.current = null;
    captchaRef.current?.hide();
    if (s) apply(s);
  }, []);

  // Cleanup al desmontar: si el usuario abandona la pantalla en mitad de un reto,
  // cancela el timeout global. Sin esto, 30 s después dispararía sobre un componente
  // desmontado → hide() nulo + Alert encima de OTRA pantalla.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const onMessage = useCallback(
    (event: HcaptchaEvent) => {
      const data = event?.nativeEvent?.data;

      // Reto visible; NO terminal. Seguimos esperando; el timeout global cubre el cuelgue.
      if (data === 'open') return;

      // Token: success === true y payload largo (el SDK usa length > 35).
      if (event?.success === true && typeof data === 'string' && data.length > 35) {
        event.markUsed?.(); // cancela el timer de expiración interno del SDK
        settle((s) => s.resolve(data));
        return;
      }

      // Cancelación del usuario (backdrop / botón atrás / cerrar reto).
      if (data === 'cancel' || data === 'challenge-closed') {
        settle((s) => s.resolve(null));
        return;
      }

      // Token expirado antes de usarse → reintentable, distinto de cancelación.
      if (data === 'expired') {
        settle((s) => s.reject(new CaptchaError('expired')));
        return;
      }

      // 'error', 'loading timeout', 'sms-open-failed', cualquier otro → fallo de red/carga.
      settle((s) => s.reject(new CaptchaError('network')));
    },
    [settle],
  );

  const getCaptchaToken = useCallback((): Promise<string | null> => {
    // Kill-switch: sin sitekey real, no montamos nada.
    if (!isCaptchaEnabled) return Promise.resolve(null);

    // Una verificación a la vez.
    if (settlerRef.current) {
      return Promise.reject(new CaptchaError('busy'));
    }

    return new Promise<string | null>((resolve, reject) => {
      // BUG-guard: si el componente no está montado, NO uses optional chaining para
      // llamar show() (dejaría la promesa sin settle). Rechaza de inmediato.
      if (!captchaRef.current) {
        reject(new CaptchaError('unavailable'));
        return;
      }

      settlerRef.current = { resolve, reject };

      // Timeout global de seguridad: si nada emite, terminamos igual.
      timeoutRef.current = setTimeout(() => {
        settle((s) => s.reject(new CaptchaError('timeout')));
      }, GLOBAL_TIMEOUT_MS);

      captchaRef.current.show();
    });
  }, [settle]);

  // Idioma del reto derivado del idioma activo de i18n (app bilingüe EN/ES).
  const languageCode = i18n.language?.toLowerCase().startsWith('es') ? 'es' : 'en';

  const CaptchaGate = useMemo<React.ReactElement | null>(() => {
    if (!isCaptchaEnabled) return null;
    return (
      <ConfirmHcaptcha
        ref={captchaRef}
        siteKey={SITE_KEY}
        size="invisible"
        baseUrl={BASE_URL}
        languageCode={languageCode}
        onMessage={onMessage}
      />
    );
  }, [onMessage, languageCode]);

  return { captchaEnabled: isCaptchaEnabled, getCaptchaToken, CaptchaGate };
}
