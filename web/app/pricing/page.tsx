/**
 * JChat 3.0 — Public pricing page (/pricing).
 *
 * PUBLIC: outside /dashboard, so the dashboard auth gate never touches it. Anyone can
 * view the plans without a session. "Suscribirme" checks for a session: with one →
 * Stripe Checkout (via the `subscriptions` Edge Function); without one → send to login
 * and return here (?next=/pricing) — the EF needs a JWT, so we never checkout logged-out.
 *
 * Simple version (prices + button). The polished login→checkout return flow is a later tanda.
 *
 * NOTE(unify): the PLANS catalogue below is DUPLICATED from
 * web/app/dashboard/billing/page.tsx (same prices/features). Not extracted to a shared
 * component yet because billing's card grid is coupled to its own state AND billing is
 * being reworked on a parallel branch — extracting now would collide. Unify later.
 *
 * Tokens: GLOBAL only (--bg-*, --text-*, --color-*, --border-subtle). The --db-* theme
 * vars exist only inside the dashboard, so a public page cannot use them.
 */

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconBuildingStore,
  IconShield,
  IconBolt,
  IconCrown,
  IconCheck,
  IconLoader2,
  IconExternalLink,
  IconAlertCircle,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ── Plan catalogue (duplicated — see NOTE(unify) above) ─────────────────────────

type PlanId = "regular" | "verified" | "business" | "pro";

interface PlanDef {
  id: PlanId;
  label: string;
  priceLabel: string;
  description: string;
  features: string[];
  icon: React.ReactNode;
  accentVar: string;
  paid: boolean;
}

const PLANS: PlanDef[] = [
  {
    id: "regular",
    label: "Regular",
    priceLabel: "Gratis",
    description: "Presencia básica en JChat. Ideal para empezar.",
    features: [
      "Ficha pública del negocio",
      "Sala de chat básica",
      "Hasta 3 ítems de menú",
      "Pin estándar en el mapa",
    ],
    icon: <IconBuildingStore size={22} />,
    accentVar: "var(--text-tertiary)",
    paid: false,
  },
  {
    id: "verified",
    label: "Verified",
    priceLabel: "$1.99 / mes",
    description: "Insignia de verificado y más visibilidad en el mapa.",
    features: [
      "Todo lo de Regular",
      "Insignia de verificado",
      "Prioridad en el mapa",
      "Hasta 20 ítems de menú",
      "Analíticas básicas",
    ],
    icon: <IconShield size={22} />,
    accentVar: "var(--color-brand)",
    paid: true,
  },
  {
    id: "business",
    label: "Business",
    priceLabel: "$49 / mes",
    description: "POS completo, programa de lealtad y gestión de personal.",
    features: [
      "Todo lo de Verified",
      "POS + KDS completo",
      "Programa de lealtad",
      "Gestión de empleados",
      "Reservas",
      "Control de inventario",
    ],
    icon: <IconBolt size={22} />,
    accentVar: "var(--color-success)",
    paid: true,
  },
  {
    id: "pro",
    label: "Pro",
    priceLabel: "$99 / mes",
    description: "Analíticas avanzadas, menú ilimitado y soporte prioritario.",
    features: [
      "Todo lo de Business",
      "Analíticas avanzadas y ROI",
      "Ítems de menú ilimitados",
      "Payouts con Stripe Connect",
      "Soporte prioritario",
      "Tema de panel personalizado",
    ],
    icon: <IconCrown size={22} />,
    accentVar: "var(--color-gold)",
    paid: true,
  },
];

// ── Edge Function error reader (duck-typed, same as billing) ────────────────────

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

// ── Page ────────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe(planId: PlanId) {
    setError(null);
    if (!isSupabaseConfigured) {
      setError("La suscripción no está disponible en este entorno.");
      return;
    }
    setLoadingPlan(planId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      // No session → the Edge Function needs a JWT. Send to login and come back.
      if (!session) {
        router.push("/auth/login?next=/pricing");
        return;
      }

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { data, error: fnErr } = await supabase.functions.invoke("subscriptions", {
        body: {
          action: "create_checkout",
          plan: planId,
          success_url: `${origin}/dashboard/billing`,
          cancel_url: `${origin}/pricing`,
        },
      });

      if (fnErr) {
        setError(await readFunctionError(fnErr));
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

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        color: "var(--text-primary)",
        padding: "48px 20px",
      }}
    >
      <div style={{ maxWidth: "1040px", margin: "0 auto" }}>
        {/* Header */}
        <header style={{ textAlign: "center", marginBottom: "40px" }}>
          <h1 style={{ fontSize: "32px", fontWeight: 800, margin: "0 0 10px" }}>
            Planes para tu negocio
          </h1>
          <p
            style={{
              fontSize: "15px",
              color: "var(--text-secondary)",
              maxWidth: "560px",
              margin: "0 auto",
              lineHeight: 1.5,
            }}
          >
            Elige el plan que se ajusta a tu negocio. Una sola suscripción cubre todos tus
            negocios. Cambia o cancela cuando quieras.
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

        {/* Plan grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
            gap: "16px",
          }}
        >
          {PLANS.map((plan) => {
            const busy = loadingPlan === plan.id;
            return (
              <div
                key={plan.id}
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "12px",
                  padding: "20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: plan.accentVar }}>{plan.icon}</span>
                  <span style={{ fontSize: "17px", fontWeight: 700 }}>{plan.label}</span>
                </div>

                {/* Price */}
                <div style={{ fontSize: "22px", fontWeight: 800 }}>{plan.priceLabel}</div>

                {/* Description */}
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                  {plan.description}
                </p>

                {/* Features */}
                <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0", display: "flex", flexDirection: "column", gap: "6px" }}>
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
                      <IconCheck size={13} style={{ color: plan.accentVar, flexShrink: 0, marginTop: "1px" }} />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <button
                  onClick={() =>
                    plan.paid
                      ? void handleSubscribe(plan.id)
                      : router.push("/auth/register?next=/dashboard")
                  }
                  disabled={busy}
                  style={{
                    marginTop: "auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    padding: "10px 16px",
                    borderRadius: "8px",
                    border: plan.paid ? "none" : "1px solid var(--border-subtle)",
                    background: plan.paid ? "var(--color-brand)" : "var(--bg-elevated)",
                    color: plan.paid ? "#fff" : "var(--text-secondary)",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: busy ? "wait" : "pointer",
                    opacity: busy ? 0.7 : 1,
                  }}
                >
                  {busy ? (
                    <>
                      <IconLoader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                      Redirigiendo…
                    </>
                  ) : plan.paid ? (
                    <>
                      Suscribirme
                      <IconExternalLink size={12} style={{ opacity: 0.7 }} />
                    </>
                  ) : (
                    "Empezar gratis"
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
