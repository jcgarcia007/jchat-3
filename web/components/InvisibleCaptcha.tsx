"use client";

/**
 * JChat 3.0 — Invisible hCaptcha (web, decisión D-38)
 *
 * Envuelve el SDK oficial `@hcaptcha/react-hcaptcha` en modo `invisible` y expone
 * un handle imperativo reusable vía ref:
 *
 *     const captchaRef = useRef<InvisibleCaptchaHandle>(null);
 *     ...
 *     <InvisibleCaptcha ref={captchaRef} />
 *     ...
 *     const token = await captchaRef.current?.getToken();  // en el submit
 *     await supabase.auth.signInWithPassword({ email, password,
 *       options: { captchaToken: token ?? undefined } });
 *
 * ── getToken() ──────────────────────────────────────────────────────────────
 * Devuelve el token (reusa el pre-verificado si lo hay, si no ejecuta el reto) y
 * SIEMPRE resetea el widget después (token de UN SOLO USO): un intento fallido —
 * p. ej. contraseña incorrecta — ya quemó el token, el siguiente pide uno nuevo.
 *
 * ── Kill-switch ─────────────────────────────────────────────────────────────
 * Si NEXT_PUBLIC_HCAPTCHA_SITEKEY falta o es "PENDIENTE_SITEKEY", el componente no
 * renderiza nada y getToken() devuelve null (mismo patrón que el móvil). Permite
 * desarrollar sin la key real; el CAPTCHA de Supabase está global-OFF y de todas
 * formas ignora el token, así que enviar null hoy es seguro.
 *
 * ── Reusabilidad ────────────────────────────────────────────────────────────
 * Pensado también para el checkout de invitado (D-37): MenuPageClient lo usará con
 * supabase.auth.signInAnonymously({ options: { captchaToken } }).
 */

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";

const PLACEHOLDER_SITEKEY = "PENDIENTE_SITEKEY";

const SITE_KEY = (process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY ?? "").trim();

/** True cuando hay una sitekey real configurada (no vacía, no placeholder). */
export const isCaptchaEnabled: boolean =
  SITE_KEY.length > 0 && SITE_KEY !== PLACEHOLDER_SITEKEY;

export type InvisibleCaptchaHandle = {
  /**
   * Resuelve con el token de hCaptcha, o null si el captcha está desactivado
   * (kill-switch) o si el reto falla/cancela. Resetea el widget tras consumirlo.
   */
  getToken: () => Promise<string | null>;
  /** Resetea el widget manualmente (normalmente no hace falta: getToken ya lo hace). */
  reset: () => void;
};

const InvisibleCaptcha = forwardRef<InvisibleCaptchaHandle>(function InvisibleCaptcha(_props, ref) {
  const captchaRef = useRef<HCaptcha>(null);
  // Token pre-verificado (si hCaptcha resolvió por adelantado vía onVerify).
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const reset = useCallback(() => {
    captchaRef.current?.resetCaptcha();
    setCaptchaToken(null);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      async getToken(): Promise<string | null> {
        if (!isCaptchaEnabled) return null;
        try {
          let token = captchaToken;
          if (!token) {
            const res = await captchaRef.current?.execute({ async: true });
            token = res?.response ?? null;
          }
          return token;
        } catch {
          // Reto cerrado / expirado / error de red. Devolvemos null; con el captcha
          // activado Supabase rechazará el intento, que se muestra como error normal.
          return null;
        } finally {
          // UN SOLO USO: reset SIEMPRE, haya éxito o fallo posterior de auth.
          captchaRef.current?.resetCaptcha();
          setCaptchaToken(null);
        }
      },
      reset,
    }),
    [captchaToken, reset],
  );

  if (!isCaptchaEnabled) return null;

  return (
    <HCaptcha
      ref={captchaRef}
      sitekey={SITE_KEY}
      size="invisible"
      onVerify={(token) => setCaptchaToken(token)}
      onExpire={() => setCaptchaToken(null)}
    />
  );
});

export default InvisibleCaptcha;
