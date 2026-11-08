/**
 * JChat 3.0 — Business-plan checkout, shared by /pricing and /pricing/business.
 *
 * Owns the consent checkbox, the promo-code validation and the Stripe Checkout hand-off (Edge Function `subscriptions`, action
 * `create_checkout`). Extracted from app/pricing/page.tsx with NO change of behavior: /pricing keeps sending the monthly interval.
 * Payments stay server-side: this only asks the EF for a Checkout URL and redirects to it.
 *
 * All messages come from the `pricing` i18n namespace (pricing.business.*, pricing.promoErrors.*, pricing.errors.*).
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { CheckoutPlanId } from "@/lib/plans";
import type { BillingInterval } from "@/lib/businessPricing";

// ── Edge Function error reader (duck-typed, same as billing) ────────────────
// Solo extrae la clave/estado del error para mapearla; la UI traduce (friendlyPromoError / errors.*).

type FnCtx = { status?: unknown; json?: unknown; clone?: unknown; text?: unknown };

async function readFunctionError(error: unknown): Promise<string> {
  // Internal use only (matching stable error keys): this text is never shown to the user.
  const fallback = error instanceof Error ? error.message : "";
  const ctx = (error as { context?: unknown })?.context as FnCtx | undefined;
  if (!ctx || typeof ctx !== "object") return fallback;
  const source: FnCtx = typeof ctx.clone === "function" ? (ctx.clone as () => FnCtx)() : ctx;

  if (typeof source.json === "function") {
    try {
      const body = await (source.json as () => Promise<unknown>)();
      const msg = (body as { error?: unknown })?.error;
      if (typeof msg === "string" && msg.length > 0) return msg;
    } catch {
      // fall through
    }
  }
  if (typeof source.text === "function") {
    try {
      const raw = await (source.text as () => Promise<string>)();
      if (raw) {
        try {
          const body = JSON.parse(raw);
          const msg = (body as { error?: unknown })?.error;
          if (typeof msg === "string" && msg.length > 0) return msg;
        } catch {
          if (raw.length < 300) return raw;
        }
      }
    } catch {
      // nothing more
    }
  }
  return fallback;
}

export interface PromoInfo {
  plan: string;
  trial_days: number;
}

export interface UseBusinessCheckoutOptions {
  /** Where the login sends the user back to (`?next=`), e.g. "/pricing" or "/pricing/business". */
  nextPath: string;
}

export function useBusinessCheckout({ nextPath }: UseBusinessCheckoutOptions) {
  const router = useRouter();
  const t = useTranslations("pricing");

  const [loadingPlan, setLoadingPlan] = useState<CheckoutPlanId | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoInfo, setPromoInfo] = useState<PromoInfo | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  // Consentimiento expreso de renovación automática. Arranca en FALSE a propósito:
  // la ley exige una casilla separada y SIN marcar, no enterrada en los términos.
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Promo error messages ─────────────────────────────────────────────────
  // Traduce los códigos de error del servidor (RPC validate_promo_code y Edge Function)
  // a lenguaje claro. El servidor manda claves estables; la UI decide cómo se leen.
  function friendlyPromoError(raw: string): string {
    if (raw.includes("CODE_NOT_FOUND")) return t("promoErrors.notFound");
    if (raw.includes("CODE_ALREADY_USED")) return t("promoErrors.alreadyUsed");
    if (raw.includes("CODE_INACTIVE")) return t("promoErrors.inactive");
    if (raw.includes("CODE_EXPIRED")) return t("promoErrors.expired");
    if (raw.includes("CODE_PLAN_MISMATCH")) return t("promoErrors.planMismatch");
    if (raw.includes("NOT_AUTHENTICATED")) return t("promoErrors.loginRequired");
    // La migración 088 revocó EXECUTE a `anon`: sin sesión, Postgres corta con
    // "permission denied ... (42501)" ANTES de entrar en la función, así que la rama
    // NOT_AUTHENTICATED de dentro nunca llega a ejecutarse. Red de seguridad.
    if (raw.includes("permission denied")) return t("promoErrors.loginRequired");
    return t("promoErrors.generic");
  }

  // ── Promo code validation ────────────────────────────────────────────────
  // Valida SIN consumir: solo informa qué otorgaría. El canje real lo hace Stripe
  // al completarse el checkout (ver D-71).
  async function checkPromo(code: string) {
    setPromoError(null);
    setPromoInfo(null);
    if (!isSupabaseConfigured || code.length === 0) return;
    setPromoChecking(true);

    // La página es pública. Sin sesión la RPC fallaría por permisos con un error que no
    // le dice nada al usuario, así que preguntamos primero y damos el motivo real.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setPromoChecking(false);
      setPromoError(t("promoErrors.loginRequired"));
      return;
    }

    const { data, error: rpcErr } = await supabase.rpc("validate_promo_code", { p_code: code });
    setPromoChecking(false);
    if (rpcErr) {
      setPromoError(friendlyPromoError(rpcErr.message ?? ""));
      return;
    }
    const res = data as unknown as
      | { valid: boolean; reason?: string; plan?: string; trial_days?: number }
      | null;
    if (!res?.valid) {
      setPromoError(friendlyPromoError(res?.reason ?? ""));
      return;
    }
    setPromoInfo({ plan: res.plan ?? "", trial_days: res.trial_days ?? 0 });
  }

  // ── Business plan checkout ───────────────────────────────────────────────
  // `interval` defaults to "month": /pricing never sends another one.
  async function handleSubscribe(planId: CheckoutPlanId, interval: BillingInterval = "month") {
    setError(null);
    // Un botón deshabilitado es solo apariencia — se puede saltar desde el navegador.
    // Esta comprobación es la que de verdad impide llegar a Stripe sin haber aceptado.
    if (!consentAccepted) {
      setError(t("business.errorAutoRenew"));
      return;
    }
    if (!isSupabaseConfigured) {
      setError(t("business.errorUnavailable"));
      return;
    }
    setLoadingPlan(planId);
    try {
      // Validate the session SERVER-SIDE before touching the EF. getSession() only reads
      // localStorage and can hand back a stale/expired token → the invoke would then fire
      // with a dead JWT and surface "Failed to send a request…". getUser() confirms with
      // the server; a null user means not (or no longer) logged in → go to login.
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoadingPlan(null);
        router.push(`/auth/login?next=${encodeURIComponent(nextPath)}`);
        return;
      }

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { data, error: fnErr } = await supabase.functions.invoke("subscriptions", {
        body: {
          action: "create_checkout",
          plan: planId,
          interval,
          success_url: `${origin}/dashboard/billing?checkout=success`,
          cancel_url: `${origin}/dashboard/billing?checkout=cancel`,
          // Solo se manda si el código es válido Y es de ESTE plan. La Edge Function
          // lo vuelve a validar server-side: esto es comodidad, no confianza.
          ...(promoInfo && promoInfo.plan === planId ? { promo_code: promoCode.trim() } : {}),
        },
      });

      if (fnErr) {
        const raw = await readFunctionError(fnErr);
        // Los errores de código promocional vienen como clave estable desde la EF.
        // El texto del servidor NUNCA se muestra: solo claves conocidas o el genérico traducido.
        setError(raw.includes("CODE_") ? friendlyPromoError(raw) : t("errors.checkoutFailed"));
        setLoadingPlan(null);
        return;
      }

      if (data?.url) {
        window.location.href = data.url as string;
      } else {
        setError(t("errors.noCheckoutUrl"));
        setLoadingPlan(null);
      }
    } catch (e) {
      console.error("[useBusinessCheckout] handleSubscribe error:", e);
      setError(t("errors.checkoutFailed"));
      setLoadingPlan(null);
    }
  }

  return {
    loadingPlan,
    error,
    setError,
    consentAccepted,
    setConsentAccepted,
    promoCode,
    setPromoCode,
    promoInfo,
    setPromoInfo,
    promoError,
    setPromoError,
    promoChecking,
    checkPromo,
    handleSubscribe,
  };
}
