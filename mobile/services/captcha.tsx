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
 * ── Semántica de retorno ────────────────────────────────────────────────────
 *   • token (string)      → verificación superada.
 *   • null                → cancelado por el usuario / expirado, O kill-switch.
 *                           El consumidor distingue ambos casos con `captchaEnabled`.
 *   • Promise rechazada    → fallo de carga/red (p. ej. WiFi malo). Mensaje accionable.
 *
 * IMPORTANTE: el CAPTCHA de Supabase es global y hoy está APAGADO. Con él apagado
 * Supabase ignora el `captchaToken`, así que enviar el token siempre es seguro.
 */

import React, { useCallback, useMemo, useRef } from 'react';
import Constants from 'expo-constants';
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

const BASE_URL = 'https://hcaptcha.com';

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
  reject: (err: Error) => void;
};

export type UseCaptcha = {
  /** Hay sitekey real: hay que pedir token y abortar si el usuario cancela. */
  captchaEnabled: boolean;
  /**
   * Muestra el reto invisible y resuelve con el token, o `null` si el usuario
   * cancela/expira (o si el kill-switch está activo). Rechaza si falla la carga/red.
   */
  getCaptchaToken: () => Promise<string | null>;
  /** Elemento a renderizar en el árbol del consumidor (null si el captcha está off). */
  CaptchaGate: React.ReactElement | null;
};

export function useCaptcha(): UseCaptcha {
  const captchaRef = useRef<ConfirmHcaptcha>(null);
  const settlerRef = useRef<Settler | null>(null);

  // Cierra el modal y limpia el settler pendiente en una sola operación.
  const settle = useCallback(
    (fn: (s: Settler) => void) => {
      const s = settlerRef.current;
      settlerRef.current = null;
      captchaRef.current?.hide();
      if (s) fn(s);
    },
    [],
  );

  const onMessage = useCallback(
    (event: HcaptchaEvent) => {
      const data = event?.nativeEvent?.data;

      // Reto visible; seguimos esperando la respuesta del usuario.
      if (data === 'open') return;

      // Token: success === true y payload largo (el SDK usa length > 35).
      if (event?.success === true && typeof data === 'string' && data.length > 35) {
        event.markUsed?.(); // cancela el timer de expiración del SDK
        settle((s) => s.resolve(data));
        return;
      }

      // Cancelación del usuario (backdrop / botón atrás / cerrar reto).
      if (data === 'cancel' || data === 'challenge-closed') {
        settle((s) => s.resolve(null));
        return;
      }

      // Token expirado antes de usarse.
      if (data === 'expired') {
        settle((s) => s.resolve(null));
        return;
      }

      // 'error', 'loading timeout', 'sms-open-failed', cualquier otro → fallo real.
      settle((s) => s.reject(new Error(typeof data === 'string' ? data : 'error')));
    },
    [settle],
  );

  const getCaptchaToken = useCallback((): Promise<string | null> => {
    // Kill-switch: sin sitekey real, no montamos nada.
    if (!isCaptchaEnabled) return Promise.resolve(null);

    // Una verificación a la vez.
    if (settlerRef.current) {
      return Promise.reject(new Error('captcha-busy'));
    }

    return new Promise<string | null>((resolve, reject) => {
      settlerRef.current = { resolve, reject };
      captchaRef.current?.show();
    });
  }, []);

  const CaptchaGate = useMemo<React.ReactElement | null>(() => {
    if (!isCaptchaEnabled) return null;
    return (
      <ConfirmHcaptcha
        ref={captchaRef}
        siteKey={SITE_KEY}
        size="invisible"
        baseUrl={BASE_URL}
        onMessage={onMessage}
      />
    );
  }, [onMessage]);

  return { captchaEnabled: isCaptchaEnabled, getCaptchaToken, CaptchaGate };
}
