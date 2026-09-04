/**
 * JChat 3.0 — Public pricing page (/pricing).
 *
 * PUBLIC: outside /dashboard, so the dashboard auth gate never touches it. Anyone can
 * view the plans without a session. "Suscribirme" checks for a session: with one →
 * Stripe Checkout (via the `subscriptions` Edge Function); without one → send to login
 * and return here (?next=/pricing) — the EF needs a JWT, so we never checkout logged-out.
 *
 * TWO SECTIONS:
 *   §1 "Para ti"     — SOCIAL_PLANS (free/verified/pro_social). Checkout fase 2; por
 *                       ahora: free→registro, verified/pro→"próximamente" (disabled).
 *   §2 "Para tu negocio" — OFFERED_PLANS (business/pro/custom). Checkout YA funciona.
 *
 * Plans come from the shared catalogue web/lib/plans.ts. This page maps its OWN
 * color/icon per plan id (see ACCENT/ICONS) because it uses GLOBAL tokens
 * (--bg-*, --text-*, --color-*, --border-subtle); the --db-* dashboard vars do not
 * exist on a public page.
 *
 * Bilingüe via next-intl (cookie jchat-lang, namespace "pricing").
 */

"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  IconBuildingStore,
  IconBolt,
  IconCrown,
  IconCheck,
  IconLoader2,
  IconExternalLink,
  IconAlertCircle,
  IconTicket,
  IconUser,
  IconBadge,
  IconSparkles,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  OFFERED_PLANS,
  SALES_EMAIL,
  SOCIAL_PLANS,
  type SocialPlanId,
  type OfferedPlanId,
  type CheckoutPlanId,
} from "@/lib/plans";
import LanguageSwitcher from "@/components/LanguageSwitcher";

// ── Business plan presentation: color + icon per plan id ──────────────────
// GLOBAL tokens only (--color-*, --bg-*, --text-*). No --db-*.

const ACCENT: Record<OfferedPlanId, string> = {
  business: "var(--color-success)",
  pro: "var(--color-gold)",
  custom: "var(--color-brand)",
};

const ICONS: Record<OfferedPlanId, React.ReactNode> = {
  business: <IconBolt size={22} />,
  pro: <IconCrown size={22} />,
  custom: <IconBuildingStore size={22} />,
};

// ── Social plan presentation ───────────────────────────────────────────────

const SOCIAL_ACCENT: Record<SocialPlanId, string> = {
  free: "var(--color-success)",
  verified: "var(--color-brand)",
  pro_social: "var(--color-gold)",
};

const SOCIAL_ICONS: Record<SocialPlanId, React.ReactNode> = {
  free: <IconUser size={22} />,
  verified: <IconBadge size={22} />,
  pro_social: <IconCrown size={22} />,
};

// ── Edge Function error reader (duck-typed, same as billing) ────────────────
// IMPORTANTE: NO modificar — la lógica de checkout de negocios depende de esto.

type FnCtx = { status?: unknown; json?: unknown; clone?: unknown; text?: unknown };

async function readFunctionError(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : "Algo salió mal";
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

// ── Page ────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const router = useRouter();
  const t = useTranslations("pricing");

  // ── Space Grotesk para los encabezados de sección ────────────────────────
  useEffect(() => {
    if (!document.querySelector('[data-font="space-grotesk"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.dataset["font"] = "space-grotesk";
      link.href =
        "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700;800&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  const [loadingPlan, setLoadingPlan] = useState<CheckoutPlanId | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoInfo, setPromoInfo] = useState<{ plan: string; trial_days: number } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  // Consentimiento expreso de renovación automática. Arranca en FALSE a propósito:
  // la ley exige una casilla separada y SIN marcar, no enterrada en los términos.
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Social plan content (all text from translations) ────────────────────
  const socialContent: Record<
    SocialPlanId,
    { label: string; priceLabel: string; description: string; features: string[]; cta: string }
  > = {
    free: {
      label: t("social.free.label"),
      priceLabel: t("social.free.priceLabel"),
      description: t("social.free.description"),
      features: [t("social.free.f1"), t("social.free.f2"), t("social.free.f3")],
      cta: t("social.free.cta"),
    },
    verified: {
      label: t("social.verified.label"),
      priceLabel: t("social.verified.priceLabel"),
      description: t("social.verified.description"),
      features: [t("social.verified.f1"), t("social.verified.f2"), t("social.verified.f3")],
      cta: t("social.verified.cta"),
    },
    pro_social: {
      label: t("social.pro.label"),
      priceLabel: t("social.pro.priceLabel"),
      description: t("social.pro.description"),
      features: [t("social.pro.f1"), t("social.pro.f2"), t("social.pro.f3"), t("social.pro.f4")],
      cta: t("social.pro.cta"),
    },
  };

  // ── Promo error messages ─────────────────────────────────────────────────
  // Traduce los códigos de error del servidor (RPC validate_promo_code y Edge Function)
  // a lenguaje claro. El servidor manda claves estables; la UI decide cómo se leen.
  function friendlyPromoError(raw: string): string {
    if (raw.includes("CODE_NOT_FOUND")) return "Ese código no existe. Revísalo.";
    if (raw.includes("CODE_ALREADY_USED")) return "Ese código ya fue canjeado.";
    if (raw.includes("CODE_INACTIVE")) return "Ese código ya no está activo.";
    if (raw.includes("CODE_EXPIRED")) return "Ese código venció.";
    if (raw.includes("CODE_PLAN_MISMATCH")) return "Ese código no aplica a este plan.";
    if (raw.includes("NOT_AUTHENTICATED")) return "Inicia sesión para usar un código.";
    // La migración 088 revocó EXECUTE a `anon`: sin sesión, Postgres corta con
    // "permission denied ... (42501)" ANTES de entrar en la función, así que la rama
    // NOT_AUTHENTICATED de dentro nunca llega a ejecutarse. Red de seguridad.
    if (raw.includes("permission denied")) return "Inicia sesión para usar un código.";
    return "No se pudo aplicar el código.";
  }

  // ── Promo code validation ────────────────────────────────────────────────
  // Valida SIN consumir: solo informa qué otorgaría. El canje real lo hace Stripe
  // al completarse el checkout (ver D-71).
  async function checkPromo(code: string) {
    setPromoError(null);
    setPromoInfo(null);
    if (!isSupabaseConfigured || code.length === 0) return;
    setPromoChecking(true);

    // /pricing es pública. Sin sesión la RPC fallaría por permisos con un error que no
    // le dice nada al usuario, así que preguntamos primero y damos el motivo real.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setPromoChecking(false);
      setPromoError("Inicia sesión para usar un código.");
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
  async function handleSubscribe(planId: CheckoutPlanId) {
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
        router.push("/auth/login?next=/pricing");
        return;
      }

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { data, error: fnErr } = await supabase.functions.invoke("subscriptions", {
        body: {
          action: "create_checkout",
          plan: planId,
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
        setError(raw.includes("CODE_") ? friendlyPromoError(raw) : raw);
        setLoadingPlan(null);
        return;
      }

      if (data?.url) {
        window.location.href = data.url as string;
      } else {
        throw new Error("No se recibió la URL de checkout.");
      }
    } catch (e) {
      console.error("[pricing] handleSubscribe error:", e);
      setError(e instanceof Error ? e.message : "No se pudo iniciar el checkout.");
      setLoadingPlan(null);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
    <style>{`
      /* Space Grotesk — display headings */
      .sg { font-family: 'Space Grotesk', system-ui, sans-serif; }

      /* Featured / popular badge pulse */
      @keyframes badge-glow {
        0%,100%{ box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-brand) 25%, transparent); }
        50%    { box-shadow: 0 0 0 5px color-mix(in srgb, var(--color-brand) 8%, transparent); }
      }
      .plan-badge-glow { animation: badge-glow 2.8s ease-in-out infinite; }

      /* Spinner */
      @keyframes spin { to { transform: rotate(360deg); } }
    `}</style>
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        color: "var(--text-primary)",
        padding: "48px 20px",
      }}
    >
      <div style={{ maxWidth: "1040px", margin: "0 auto" }}>
        {/* Language switcher — top right */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
          <LanguageSwitcher />
        </div>

        {/* ══════════════════════════════════════════════════════
            §1 — PLANES SOCIALES (Para ti)
            Checkout fase 2: free→registro, verified/pro→disabled.
            ══════════════════════════════════════════════════════ */}
        <section id="social" style={{ marginBottom: "64px" }}>
          <header style={{ textAlign: "center", marginBottom: "32px" }}>
            <h1 className="sg" style={{ fontSize: "28px", fontWeight: 800, margin: "0 0 8px" }}>
              {t("social.sectionTitle")}
            </h1>
            <p
              style={{
                fontSize: "15px",
                color: "var(--text-secondary)",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {t("social.sectionSubtitle")}
            </p>
          </header>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
              maxWidth: "820px",
              margin: "0 auto",
            }}
          >
            {SOCIAL_PLANS.map((plan) => {
              const content = socialContent[plan.id];
              const accent = SOCIAL_ACCENT[plan.id];
              const isFeatured = plan.id === "verified";
              return (
                <div
                  key={plan.id}
                  className={isFeatured ? "plan-badge-glow" : undefined}
                  style={{
                    background: "var(--bg-surface)",
                    border: isFeatured
                      ? "1px solid rgba(92,124,250,0.42)"
                      : "1px solid var(--border-subtle)",
                    borderRadius: "12px",
                    padding: isFeatured ? "22px" : "20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    position: "relative",
                  }}
                >
                  {/* Featured badge */}
                  {isFeatured && (
                    <div style={{
                      position: "absolute",
                      top: "-11px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "var(--color-brand)",
                      color: "#fff",
                      fontSize: "10px",
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      padding: "3px 12px",
                      borderRadius: "99px",
                      whiteSpace: "nowrap",
                    }}>
                      {t("social.featuredBadge")}
                    </div>
                  )}
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ color: accent }}>{SOCIAL_ICONS[plan.id]}</span>
                    <span style={{ fontSize: "17px", fontWeight: 700 }}>{content.label}</span>
                  </div>

                  {/* Price */}
                  <div style={{ fontSize: "22px", fontWeight: 800 }}>{content.priceLabel}</div>

                  {/* Description */}
                  <p
                    style={{
                      fontSize: "13px",
                      color: "var(--text-secondary)",
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {content.description}
                  </p>

                  {/* Features */}
                  <ul
                    style={{
                      listStyle: "none",
                      padding: 0,
                      margin: "4px 0 0",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    {content.features.map((f) => (
                      <li
                        key={f}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "6px",
                          fontSize: "12px",
                          color: "var(--text-secondary)",
                        }}
                      >
                        <IconCheck
                          size={13}
                          style={{ color: accent, flexShrink: 0, marginTop: "1px" }}
                        />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <button
                    onClick={
                      plan.cta === "register"
                        ? () => router.push("/auth/register")
                        : undefined
                    }
                    disabled={plan.cta === "soon"}
                    style={{
                      marginTop: "auto",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      padding: "10px 16px",
                      borderRadius: "8px",
                      border: plan.cta === "register" ? "none" : "1px solid var(--border-subtle)",
                      background:
                        plan.cta === "register" ? "var(--color-brand)" : "var(--bg-elevated)",
                      color: plan.cta === "register" ? "#fff" : "var(--text-secondary)",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: plan.cta === "soon" ? "not-allowed" : "pointer",
                      opacity: plan.cta === "soon" ? 0.45 : 1,
                    }}
                  >
                    {content.cta}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════
            Separador visual entre secciones
            ══════════════════════════════════════════════════════ */}
        <div
          style={{
            maxWidth: "820px",
            margin: "0 auto 56px",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div
            style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }}
          />
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--text-tertiary)",
              whiteSpace: "nowrap",
            }}
          >
            Venue POS
          </span>
          <div
            style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }}
          />
        </div>

        {/* ══════════════════════════════════════════════════════
            §2 — PLANES DE NEGOCIO (Para tu negocio)
            Todo el checkout ya funciona — NO modificar lógica.
            ══════════════════════════════════════════════════════ */}
        <section id="negocios">
          {/* Header */}
          <header style={{ textAlign: "center", marginBottom: "40px" }}>
            <h2 className="sg" style={{ fontSize: "28px", fontWeight: 800, margin: "0 0 10px" }}>
              {t("business.sectionTitle")}
            </h2>
            <p
              style={{
                fontSize: "15px",
                color: "var(--text-secondary)",
                maxWidth: "560px",
                margin: "0 auto",
                lineHeight: 1.5,
              }}
            >
              {t("business.sectionSubtitle")}
            </p>
          </header>

          {/* Error */}
          {error && (
            <div
              role="alert"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                maxWidth: "560px",
                margin: "0 auto 24px",
                padding: "12px 16px",
                borderRadius: "10px",
                background: "color-mix(in srgb, var(--color-danger) 10%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-danger) 25%, transparent)",
                color: "var(--color-danger)",
                fontSize: "13px",
              }}
            >
              <IconAlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Consentimiento de renovación automática. Va ANTES de la grilla porque la ley
              exige divulgar los términos de forma clara ANTES de recoger datos de pago. */}
          <div
            style={{
              maxWidth: "820px",
              margin: "0 auto 20px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "12px",
              padding: "18px 20px",
            }}
          >
            <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "8px" }}>
              {t("business.consentTitle")}
            </div>
            <p
              style={{
                fontSize: "13px",
                color: "var(--text-secondary)",
                margin: "0 0 14px",
                lineHeight: 1.6,
              }}
            >
              {t("business.consentBody")}
            </p>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                cursor: "pointer",
                fontSize: "13px",
                color: "var(--text-primary)",
                lineHeight: 1.5,
              }}
            >
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(e) => {
                  setConsentAccepted(e.target.checked);
                  setError(null);
                }}
                style={{
                  marginTop: "2px",
                  width: "16px",
                  height: "16px",
                  flexShrink: 0,
                  cursor: "pointer",
                }}
              />
              <span>{t("business.consentCheck")}</span>
            </label>
          </div>

          {/* Plan grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
              gap: "16px",
              maxWidth: "820px",
              margin: "0 auto",
            }}
          >
            {OFFERED_PLANS.map((plan) => {
              const busy = loadingPlan === plan.id;
              // El plan Custom abre un mailto, no un checkout: NO exige consentimiento
              // (pedir aceptar términos de cobro para mandar un correo no tendría sentido).
              const needsConsent = plan.cta === "checkout" && !consentAccepted;
              const isPopular = plan.id === "pro";
              return (
                <div
                  key={plan.id}
                  className={isPopular ? "plan-badge-glow" : undefined}
                  style={{
                    background: "var(--bg-surface)",
                    border: isPopular
                      ? "1px solid rgba(92,124,250,0.42)"
                      : "1px solid var(--border-subtle)",
                    borderRadius: "12px",
                    padding: isPopular ? "22px" : "20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    position: "relative",
                  }}
                >
                  {/* Most popular badge */}
                  {isPopular && (
                    <div style={{
                      position: "absolute",
                      top: "-11px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "var(--color-brand)",
                      color: "#fff",
                      fontSize: "10px",
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      padding: "3px 12px",
                      borderRadius: "99px",
                      whiteSpace: "nowrap",
                    }}>
                      {t("business.popularBadge")}
                    </div>
                  )}
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ color: ACCENT[plan.id] }}>{ICONS[plan.id]}</span>
                    <span style={{ fontSize: "17px", fontWeight: 700 }}>{plan.label}</span>
                  </div>

                  {/* Price */}
                  <div style={{ fontSize: "22px", fontWeight: 800 }}>{plan.priceLabel}</div>

                  {/* Description */}
                  <p
                    style={{
                      fontSize: "13px",
                      color: "var(--text-secondary)",
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {plan.description}
                  </p>

                  {/* Features */}
                  <ul
                    style={{
                      listStyle: "none",
                      padding: 0,
                      margin: "4px 0 0",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "6px",
                          fontSize: "12px",
                          color: "var(--text-secondary)",
                        }}
                      >
                        <IconCheck
                          size={13}
                          style={{ color: ACCENT[plan.id], flexShrink: 0, marginTop: "1px" }}
                        />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <button
                    onClick={() => {
                      if (plan.cta === "contact") {
                        window.location.href = `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(
                          "Plan Custom JChat",
                        )}`;
                      } else {
                        void handleSubscribe(plan.id as CheckoutPlanId);
                      }
                    }}
                    disabled={busy || needsConsent}
                    title={
                      needsConsent ? "Marca la casilla de arriba para continuar" : undefined
                    }
                    style={{
                      marginTop: "auto",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      padding: "10px 16px",
                      borderRadius: "8px",
                      border:
                        plan.cta === "checkout" ? "none" : "1px solid var(--border-subtle)",
                      background:
                        plan.cta === "checkout" ? "var(--color-brand)" : "var(--bg-elevated)",
                      color: plan.cta === "checkout" ? "#fff" : "var(--text-secondary)",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: busy ? "wait" : needsConsent ? "not-allowed" : "pointer",
                      opacity: busy ? 0.7 : needsConsent ? 0.45 : 1,
                    }}
                  >
                    {busy ? (
                      <>
                        <IconLoader2
                          size={14}
                          style={{ animation: "spin 1s linear infinite" }}
                        />
                        {t("business.btnRedirecting")}
                      </>
                    ) : plan.cta === "checkout" ? (
                      <>
                        {t("business.btnSubscribe")}
                        <IconExternalLink size={12} style={{ opacity: 0.7 }} />
                      </>
                    ) : (
                      t("business.btnContact")
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Promo code */}
          <div
            style={{
              maxWidth: "560px",
              margin: "32px auto 0",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "12px",
              padding: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "6px",
              }}
            >
              <IconTicket size={18} style={{ color: "var(--color-brand)" }} />
              <span style={{ fontSize: "15px", fontWeight: 700 }}>
                {t("business.promoTitle")}
              </span>
            </div>
            <p
              style={{
                fontSize: "13px",
                color: "var(--text-secondary)",
                margin: "0 0 14px",
                lineHeight: 1.5,
              }}
            >
              {t("business.promoBody")}
            </p>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <input
                value={promoCode}
                onChange={(e) => {
                  const v = e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, 12);
                  setPromoCode(v);
                  setPromoInfo(null);
                  setPromoError(null);
                }}
                placeholder={t("business.promoPlaceholder")}
                maxLength={12}
                style={{
                  flex: "1 1 200px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-base)",
                  color: "var(--text-primary)",
                  fontSize: "14px",
                  fontFamily: "var(--font-mono, monospace)",
                  letterSpacing: "1px",
                }}
              />
              <button
                onClick={() => void checkPromo(promoCode.trim())}
                disabled={promoChecking || promoCode.trim().length === 0}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "10px 18px",
                  borderRadius: "8px",
                  border: "none",
                  background: "var(--color-brand)",
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: promoChecking ? "wait" : "pointer",
                  opacity:
                    promoChecking || promoCode.trim().length === 0 ? 0.6 : 1,
                }}
              >
                {promoChecking ? (
                  <IconLoader2
                    size={14}
                    style={{ animation: "spin 1s linear infinite" }}
                  />
                ) : null}
                {promoChecking ? t("business.promoChecking") : t("business.promoCheck")}
              </button>
            </div>

            {promoInfo && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginTop: "12px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  background:
                    "color-mix(in srgb, var(--color-success) 10%, transparent)",
                  border:
                    "1px solid color-mix(in srgb, var(--color-success) 25%, transparent)",
                  color: "var(--color-success)",
                  fontSize: "13px",
                }}
              >
                <IconCheck size={15} />
                <span>
                  {t("business.promoValidText", {
                    days: promoInfo.trial_days,
                    plan: promoInfo.plan,
                  })}
                </span>
              </div>
            )}

            {promoError && (
              <div
                role="alert"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginTop: "12px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  background:
                    "color-mix(in srgb, var(--color-danger) 10%, transparent)",
                  border:
                    "1px solid color-mix(in srgb, var(--color-danger) 25%, transparent)",
                  color: "var(--color-danger)",
                  fontSize: "13px",
                }}
              >
                <IconAlertCircle size={15} />
                <span>{promoError}</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
    </>
  );
}
