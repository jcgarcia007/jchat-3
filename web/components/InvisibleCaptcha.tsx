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

/**
 * Resultado de getToken() — discrimina los DOS motivos por los que no hay token, para
 * que el consumidor aborte en 'failed' pero proceda en 'disabled' (kill-switch):
 *   · 'ok'       → reto superado; usa `token`.
 *   · 'disabled' → captcha apagado (sin sitekey real); procede sin token.
 *   · 'failed'   → reto cancelado/expirado/erróneo; ABORTA el submit.
 */
export type CaptchaResult =
  | { status: "ok"; token: string }
  | { status: "disabled" }
  | { status: "failed" };

export type InvisibleCaptchaHandle = {
  /**
   * Ejecuta el reto y devuelve un {@link CaptchaResult}. Resetea el widget tras
   * consumirlo (token de UN SOLO USO), haya éxito o fallo posterior de auth.
   */
  getToken: () => Promise<CaptchaResult>;
  /** Resetea el widget manualmente (normalmente no hace falta: getToken ya lo hace). */
  reset: () => void;
};

const InvisibleCaptcha = forwardRef<InvisibleCaptchaHandle>(function InvisibleCaptcha(_props, ref) {
  const captchaRef = useRef<HCaptcha>(null);
  // Token pre-verificado (si hCaptcha resolvió por adelantado vía onVerify).
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  // Gate de "listo": el widget invisible carga su script/iframe de forma
  // asíncrona. Ejecutar execute() antes de que cargue lanza error → un "failed"
  // espurio en el PRIMER intento (sobre todo cuando getToken se dispara al montar
  // la pantalla de pago). Esperamos al onLoad de hCaptcha antes de ejecutar; si
  // tarda demasiado, fail-open (intentamos igual y, si falla, el llamador reintenta).
  const readyRef = useRef(false);
  const readyWaitersRef = useRef<Array<() => void>>([]);

  const markReady = useCallback(() => {
    readyRef.current = true;
    const waiters = readyWaitersRef.current;
    readyWaitersRef.current = [];
    waiters.forEach((w) => w());
  }, []);

  const waitForReady = useCallback((timeoutMs = 4000): Promise<void> => {
    if (readyRef.current) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const t = setTimeout(resolve, timeoutMs); // fail-open: intentar de todas formas
      readyWaitersRef.current.push(() => {
        clearTimeout(t);
        resolve();
      });
    });
  }, []);

  const reset = useCallback(() => {
    captchaRef.current?.resetCaptcha();
    setCaptchaToken(null);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      async getToken(): Promise<CaptchaResult> {
        // Kill-switch: sin sitekey real, el consumidor procede sin token.
        if (!isCaptchaEnabled) return { status: "disabled" };
        try {
          await waitForReady(); // no ejecutar antes de que el widget haya cargado
          let token = captchaToken;
          if (!token) {
            const res = await captchaRef.current?.execute({ async: true });
            token = res?.response ?? null;
          }
          // Sin token con el captcha activado = el reto no se completó → abortar arriba.
          return token ? { status: "ok", token } : { status: "failed" };
        } catch {
          // Reto cerrado / expirado / error de red → abortar el submit arriba.
          return { status: "failed" };
        } finally {
          // UN SOLO USO: reset SIEMPRE, haya éxito o fallo posterior de auth.
          captchaRef.current?.resetCaptcha();
          setCaptchaToken(null);
        }
      },
      reset,
    }),
    [captchaToken, reset, waitForReady],
  );

  if (!isCaptchaEnabled) return null;

  return (
    <HCaptcha
      ref={captchaRef}
      sitekey={SITE_KEY}
      size="invisible"
      onLoad={markReady}
      onVerify={(token) => setCaptchaToken(token)}
      onExpire={() => setCaptchaToken(null)}
    />
  );
});

export default InvisibleCaptcha;
