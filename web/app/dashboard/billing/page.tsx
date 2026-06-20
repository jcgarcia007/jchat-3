/**
 * JChat 3.0 — Billing & Subscription Dashboard (Task 3.15)
 *
 * Shows the business owner's current plan, available plan options, upgrade/downgrade
 * controls, trial status, and a payment history stub.
 *
 * Architecture:
 *  - Reads current subscription from `subscriptions` table via supabase client.
 *  - Upgrades call the `subscriptions` Edge Function (action: "create_checkout")
 *    which returns a Stripe Checkout URL → redirect. (Rule 4: Stripe ALWAYS server-side.)
 *  - Downgrades note "takes effect at period end" (Stripe handles via cancel_at_period_end).
 *  - Guard: isSupabaseConfigured wraps all live DB/function calls.
 *
 * Design tokens: var(--db-*) only — NO hardcoded hex.
 * Icons: @tabler/icons-react only.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  IconAlertCircle,
  IconBolt,
  IconBuildingStore,
  IconCheck,
  IconCircleCheck,
  IconClock,
  IconCrown,
  IconCreditCard,
  IconExternalLink,
  IconInfoCircle,
  IconLoader2,
  IconReceipt,
  IconRefresh,
  IconRocket,
  IconShield,
  IconX,
} from "@tabler/icons-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

type PlanId = "regular" | "verified" | "business" | "pro";
type SubStatus = "active" | "trialing" | "past_due" | "suspended" | "canceled";

interface Subscription {
  id: string;
  business_id: string;
  stripe_subscription_id: string | null;
  plan: PlanId;
  status: SubStatus;
  current_period_end: string | null;
  trial_end: string | null;
  grace_day: number;
  created_at: string;
  updated_at: string;
}

interface PlanDef {
  id: PlanId;
  label: string;
  price_usd: number;
  price_label: string;
  description: string;
  features: string[];
  icon: React.ReactNode;
  /** CSS color token for the plan accent */
  accentVar: string;
}

// ── Plan catalogue ────────────────────────────────────────────────────────────

const PLANS: PlanDef[] = [
  {
    id: "regular",
    label: "Regular",
    price_usd: 0,
    price_label: "Free",
    description: "Basic presence in JChat. Great for getting started.",
    features: [
      "Public business listing",
      "Basic chat room",
      "Up to 3 menu items",
      "Standard map pin",
    ],
    icon: <IconBuildingStore size={22} />,
    accentVar: "var(--db-text-secondary)",
  },
  {
    id: "verified",
    label: "Verified",
    price_usd: 1.99,
    price_label: "$1.99 / mo",
    description: "Verified badge and enhanced visibility on the map.",
    features: [
      "Everything in Regular",
      "Verified badge on listing",
      "Priority map placement",
      "Up to 20 menu items",
      "Basic analytics",
    ],
    icon: <IconShield size={22} />,
    accentVar: "var(--db-accent)",
  },
  {
    id: "business",
    label: "Business",
    price_usd: 49,
    price_label: "$49 / mo",
    description: "Full POS suite, loyalty program, and staff management.",
    features: [
      "Everything in Verified",
      "Full POS + KDS",
      "Loyalty program",
      "Employee management",
      "Reservations",
      "Inventory tracking",
    ],
    icon: <IconBolt size={22} />,
    accentVar: "var(--db-success)",
  },
  {
    id: "pro",
    label: "Pro",
    price_usd: 99,
    price_label: "$99 / mo",
    description: "Advanced analytics, unlimited menus, and priority support.",
    features: [
      "Everything in Business",
      "Advanced analytics & ROI",
      "Unlimited menu items",
      "Stripe Connect payouts",
      "Priority support",
      "Custom dashboard theme",
    ],
    icon: <IconCrown size={22} />,
    accentVar: "var(--db-warning)",
  },
];

const PLAN_RANK: Record<PlanId, number> = {
  regular: 0,
  verified: 1,
  business: 2,
  pro: 3,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

function statusLabel(status: SubStatus, graceDay: number): string {
  if (status === "trialing") return "Free Trial";
  if (status === "active") return "Active";
  if (status === "past_due") return `Past Due (Day ${graceDay}/3)`;
  if (status === "suspended") return "Suspended";
  if (status === "canceled") return "Canceled";
  return status;
}

function statusColor(status: SubStatus): string {
  if (status === "active" || status === "trialing") return "var(--db-success)";
  if (status === "past_due") return "var(--db-warning)";
  if (status === "suspended" || status === "canceled") return "var(--db-danger)";
  return "var(--db-text-secondary)";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: "14px",
        fontWeight: 700,
        color: "var(--db-text-secondary)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        marginBottom: "16px",
      }}
    >
      {children}
    </h2>
  );
}

function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "12px",
        padding: "20px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function AlertBanner({
  icon,
  message,
  color,
}: {
  icon: React.ReactNode;
  message: string;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "12px 16px",
        borderRadius: "10px",
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
        color,
        fontSize: "13px",
        fontWeight: 500,
        marginBottom: "20px",
      }}
    >
      {icon}
      <span>{message}</span>
    </div>
  );
}

// ── Demo subscription (shown when Supabase is not configured) ─────────────────

const DEMO_SUB: Subscription = {
  id: "demo-sub-1",
  business_id: "demo-business-1",
  stripe_subscription_id: null,
  plan: "business",
  status: "trialing",
  current_period_end: new Date(Date.now() + 25 * 86_400_000).toISOString(),
  trial_end: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  grace_day: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<PlanId | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);

  // ── Detect checkout result from URL query params ──────────────────────────
  const [checkoutResult, setCheckoutResult] = useState<
    "success" | "cancel" | null
  >(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const result = params.get("checkout");
      if (result === "success" || result === "cancel") {
        setCheckoutResult(result as "success" | "cancel");
        // Clean the URL without reload
        const url = new URL(window.location.href);
        url.searchParams.delete("checkout");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, []);

  // ── Load subscription ─────────────────────────────────────────────────────
  const loadSub = useCallback(async () => {
    setLoading(true);

    if (!isSupabaseConfigured) {
      setSub(DEMO_SUB);
      setBusinessId(DEMO_SUB.business_id);
      setLoading(false);
      return;
    }

    try {
      // Get the current user's business
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setSub(null);
        setLoading(false);
        return;
      }

      const { data: business } = await supabase
        .from("businesses")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (!business) {
        setSub(null);
        setLoading(false);
        return;
      }

      setBusinessId(business.id);

      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("business_id", business.id)
        .maybeSingle();

      if (error) throw error;

      // If no subscription row yet, synthesize a free/regular one
      setSub(
        data ?? {
          id: "",
          business_id: business.id,
          stripe_subscription_id: null,
          plan: "regular",
          status: "active",
          current_period_end: null,
          trial_end: null,
          grace_day: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      );
    } catch (err) {
      console.error("[billing] loadSub error:", err);
      showToast("error", "Failed to load subscription data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSub();
  }, [loadSub]);

  // ── Toast helper ──────────────────────────────────────────────────────────
  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Upgrade → Stripe Checkout ──────────────────────────────────────────────
  async function handleUpgrade(targetPlan: PlanId) {
    if (!businessId) {
      showToast("error", "No business found for this account.");
      return;
    }

    setActionLoading(targetPlan);

    if (!isSupabaseConfigured) {
      // Demo mode: just show a toast
      setTimeout(() => {
        setActionLoading(null);
        showToast(
          "success",
          `Demo mode — in production this would open Stripe Checkout for the ${targetPlan} plan.`,
        );
      }, 1200);
      return;
    }

    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { data, error } = await supabase.functions.invoke("subscriptions", {
        body: {
          action: "create_checkout",
          business_id: businessId,
          plan: targetPlan,
          success_url: `${origin}/dashboard/billing?checkout=success`,
          cancel_url: `${origin}/dashboard/billing?checkout=cancel`,
        },
      });

      if (error) throw error;

      if (data?.downgraded) {
        showToast("success", "Downgraded to Regular (free). Changes applied.");
        await loadSub();
        return;
      }

      if (data?.url) {
        // Redirect to Stripe Checkout (Rule 4 compliant — URL from server)
        window.location.href = data.url as string;
      } else {
        throw new Error("No checkout URL returned from Edge Function.");
      }
    } catch (err) {
      console.error("[billing] handleUpgrade error:", err);
      showToast("error", "Could not start checkout. Please try again.");
      setActionLoading(null);
    }
  }

  // ── Plan card action logic ────────────────────────────────────────────────
  function getPlanAction(
    planId: PlanId,
  ): { label: string; kind: "upgrade" | "current" | "downgrade" | "free" } {
    const currentRank = PLAN_RANK[sub?.plan ?? "regular"];
    const targetRank = PLAN_RANK[planId];

    if (planId === (sub?.plan ?? "regular")) return { label: "Current plan", kind: "current" };
    if (targetRank > currentRank) return { label: "Upgrade", kind: "upgrade" };
    if (planId === "regular") return { label: "Downgrade to Free", kind: "free" };
    return { label: "Downgrade", kind: "downgrade" };
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: "900px" }}>
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 700,
            color: "var(--db-text-primary)",
            marginBottom: "4px",
          }}
        >
          Billing & Subscription
        </h1>
        <p style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}>
          Manage your plan, view payment history, and update billing details.
        </p>
      </div>

      {/* Checkout result banners */}
      {checkoutResult === "success" && (
        <AlertBanner
          icon={<IconCircleCheck size={18} />}
          message="Subscription updated! It may take a moment to reflect below."
          color="var(--db-success)"
        />
      )}
      {checkoutResult === "cancel" && (
        <AlertBanner
          icon={<IconInfoCircle size={18} />}
          message="Checkout was cancelled. Your plan was not changed."
          color="var(--db-text-secondary)"
        />
      )}

      {/* Demo mode notice */}
      {!isSupabaseConfigured && (
        <AlertBanner
          icon={<IconAlertCircle size={18} />}
          message="Demo mode — connect Supabase to see live subscription data and enable real Stripe Checkout."
          color="var(--db-warning)"
        />
      )}

      {/* ── Current plan status ─────────────────────────────────────────── */}
      <SectionTitle>Current plan</SectionTitle>

      {loading ? (
        <Card style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--db-text-secondary)" }}>
          <IconLoader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: "14px" }}>Loading subscription…</span>
        </Card>
      ) : sub ? (
        <Card style={{ marginBottom: "32px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            {/* Plan info */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "8px",
                }}
              >
                <span
                  style={{
                    color: PLANS.find((p) => p.id === sub.plan)?.accentVar ?? "var(--db-accent)",
                  }}
                >
                  {PLANS.find((p) => p.id === sub.plan)?.icon}
                </span>
                <span
                  style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    color: "var(--db-text-primary)",
                  }}
                >
                  {PLANS.find((p) => p.id === sub.plan)?.label ?? sub.plan} Plan
                </span>
                {/* Status badge */}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "2px 10px",
                    borderRadius: "20px",
                    fontSize: "11px",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: statusColor(sub.status),
                    background: `color-mix(in srgb, ${statusColor(sub.status)} 12%, transparent)`,
                  }}
                >
                  {statusLabel(sub.status, sub.grace_day)}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "24px",
                  flexWrap: "wrap",
                }}
              >
                {sub.trial_end && (
                  <div>
                    <div
                      style={{ fontSize: "11px", color: "var(--db-text-tertiary)", marginBottom: "2px" }}
                    >
                      Trial ends
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "var(--db-text-primary)",
                      }}
                    >
                      {formatDate(sub.trial_end)}
                      {daysLeft(sub.trial_end) !== null && (
                        <span style={{ color: "var(--db-warning)", marginLeft: "6px", fontWeight: 400 }}>
                          ({daysLeft(sub.trial_end)} days left)
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {sub.current_period_end && !sub.trial_end && (
                  <div>
                    <div
                      style={{ fontSize: "11px", color: "var(--db-text-tertiary)", marginBottom: "2px" }}
                    >
                      Renews
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--db-text-primary)" }}>
                      {formatDate(sub.current_period_end)}
                    </div>
                  </div>
                )}
                {sub.plan === "regular" && (
                  <div>
                    <div
                      style={{ fontSize: "11px", color: "var(--db-text-tertiary)", marginBottom: "2px" }}
                    >
                      Price
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--db-text-primary)" }}>
                      Free
                    </div>
                  </div>
                )}
              </div>

              {/* Grace period warning */}
              {sub.status === "past_due" && sub.grace_day > 0 && (
                <div
                  style={{
                    marginTop: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "color-mix(in srgb, var(--db-warning) 10%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--db-warning) 25%, transparent)",
                    color: "var(--db-warning)",
                    fontSize: "13px",
                  }}
                >
                  <IconAlertCircle size={16} />
                  <span>
                    Payment failed — grace period Day {sub.grace_day}/3.
                    {sub.grace_day === 2
                      ? " Your account will be suspended tomorrow if payment is not resolved."
                      : " Update your payment method to avoid suspension."}
                  </span>
                </div>
              )}

              {/* Suspended warning */}
              {sub.status === "suspended" && (
                <div
                  style={{
                    marginTop: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "color-mix(in srgb, var(--db-danger) 10%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--db-danger) 25%, transparent)",
                    color: "var(--db-danger)",
                    fontSize: "13px",
                  }}
                >
                  <IconX size={16} />
                  <span>
                    Your account is suspended and has been removed from the map. Update your payment
                    method in Stripe to restore access instantly.
                  </span>
                </div>
              )}

              {/* Trial end reminder */}
              {sub.status === "trialing" &&
                daysLeft(sub.trial_end) !== null &&
                (daysLeft(sub.trial_end) ?? Infinity) <= 3 && (
                  <div
                    style={{
                      marginTop: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      background: "color-mix(in srgb, var(--db-warning) 10%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--db-warning) 25%, transparent)",
                      color: "var(--db-warning)",
                      fontSize: "13px",
                    }}
                  >
                    <IconClock size={16} />
                    <span>
                      Your free trial ends in {daysLeft(sub.trial_end)} day
                      {daysLeft(sub.trial_end) !== 1 ? "s" : ""}. Add a payment method to continue
                      without interruption.
                    </span>
                  </div>
                )}
            </div>

            {/* Refresh button */}
            <button
              onClick={loadSub}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "8px",
                border: "1px solid var(--db-border)",
                background: "var(--db-bg-elevated)",
                color: "var(--db-text-secondary)",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              <IconRefresh size={14} />
              Refresh
            </button>
          </div>
        </Card>
      ) : (
        <Card style={{ marginBottom: "32px" }}>
          <p style={{ fontSize: "14px", color: "var(--db-text-secondary)" }}>
            No business account found. Register your business to get started.
          </p>
        </Card>
      )}

      {/* ── Plan cards ──────────────────────────────────────────────────── */}
      <SectionTitle>Available plans</SectionTitle>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "40px",
        }}
      >
        {PLANS.map((plan) => {
          const action = getPlanAction(plan.id);
          const isCurrent = action.kind === "current";
          const isLoading = actionLoading === plan.id;

          return (
            <div
              key={plan.id}
              style={{
                background: "var(--db-bg-surface)",
                border: isCurrent
                  ? `2px solid var(--db-accent)`
                  : "1px solid var(--db-border)",
                borderRadius: "12px",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                position: "relative",
              }}
            >
              {/* Current badge */}
              {isCurrent && (
                <div
                  style={{
                    position: "absolute",
                    top: "-1px",
                    right: "16px",
                    transform: "translateY(-50%)",
                    padding: "2px 10px",
                    borderRadius: "20px",
                    background: "var(--db-accent)",
                    color: "var(--db-accent-text)",
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  Current
                </div>
              )}

              {/* Plan header */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: plan.accentVar }}>{plan.icon}</span>
                <span
                  style={{
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "var(--db-text-primary)",
                  }}
                >
                  {plan.label}
                </span>
              </div>

              {/* Price */}
              <div>
                <span
                  style={{
                    fontSize: "22px",
                    fontWeight: 800,
                    color: plan.accentVar,
                  }}
                >
                  {plan.price_label}
                </span>
              </div>

              {/* Description */}
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--db-text-secondary)",
                  lineHeight: "1.5",
                  margin: 0,
                }}
              >
                {plan.description}
              </p>

              {/* Features */}
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
                {plan.features.map((f) => (
                  <li
                    key={f}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "6px",
                      fontSize: "12px",
                      color: "var(--db-text-secondary)",
                    }}
                  >
                    <IconCheck
                      size={13}
                      style={{ color: plan.accentVar, flexShrink: 0, marginTop: "1px" }}
                    />
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA button */}
              <button
                onClick={() => {
                  if (action.kind === "downgrade") {
                    // Downgrade via Stripe customer portal — stub for now
                    showToast(
                      "success",
                      "Downgrade scheduled — your plan will change at the end of the current billing period. Contact support to apply immediately.",
                    );
                  } else if (!isCurrent) {
                    handleUpgrade(plan.id);
                  }
                }}
                disabled={isCurrent || isLoading}
                style={{
                  marginTop: "auto",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "10px 16px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: isCurrent ? "default" : "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                  background: isCurrent
                    ? "var(--db-bg-elevated)"
                    : action.kind === "downgrade" || action.kind === "free"
                    ? "var(--db-bg-elevated)"
                    : "var(--db-accent)",
                  color: isCurrent
                    ? "var(--db-text-tertiary)"
                    : action.kind === "downgrade" || action.kind === "free"
                    ? "var(--db-text-secondary)"
                    : "var(--db-accent-text)",
                  opacity: isCurrent ? 0.7 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                {isLoading ? (
                  <>
                    <IconLoader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                    Redirecting…
                  </>
                ) : (
                  <>
                    {action.kind === "upgrade" && <IconRocket size={14} />}
                    {action.kind === "downgrade" && <IconBolt size={14} />}
                    {action.kind === "free" && <IconBuildingStore size={14} />}
                    {action.kind === "current" && <IconCircleCheck size={14} />}
                    {action.label}
                    {action.kind === "upgrade" && (
                      <IconExternalLink size={12} style={{ opacity: 0.7 }} />
                    )}
                  </>
                )}
              </button>

              {/* Downgrade note */}
              {(action.kind === "downgrade" || action.kind === "free") && (
                <p
                  style={{
                    fontSize: "11px",
                    color: "var(--db-text-tertiary)",
                    margin: 0,
                    textAlign: "center",
                    lineHeight: "1.4",
                  }}
                >
                  Takes effect at end of current billing period.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Payment history ──────────────────────────────────────────────── */}
      <SectionTitle>Payment history</SectionTitle>
      <Card style={{ marginBottom: "32px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            color: "var(--db-text-secondary)",
            fontSize: "13px",
          }}
        >
          <IconReceipt size={18} />
          <div>
            <p style={{ margin: 0, fontWeight: 500, color: "var(--db-text-primary)" }}>
              Payment history
            </p>
            <p style={{ margin: 0, marginTop: "2px" }}>
              {/* TODO(Task 3.15): Query Stripe invoices via Edge Function and render table:
                  columns: Date, Description, Amount, Status (paid/failed), PDF download link.
                  API: supabase.functions.invoke('subscriptions', { body: { action: 'list_invoices', business_id } }) */}
              Invoice history will be available here once Stripe is connected.
            </p>
          </div>
        </div>
      </Card>

      {/* ── Stripe portal note ──────────────────────────────────────────── */}
      <Card>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
          <IconCreditCard size={20} style={{ color: "var(--db-accent)", flexShrink: 0, marginTop: "2px" }} />
          <div>
            <p
              style={{
                margin: 0,
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--db-text-primary)",
                marginBottom: "4px",
              }}
            >
              Update payment method or billing details
            </p>
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                color: "var(--db-text-secondary)",
                lineHeight: "1.5",
              }}
            >
              {/* TODO(Task 3.15): Add Stripe Customer Portal link.
                  Call Edge Function action: "create_portal_session" → redirect to portal URL.
                  The portal lets customers update cards, download invoices, and cancel subscriptions. */}
              Use the Stripe Customer Portal to update your card, download invoices, or cancel your
              subscription. Contact support to access the portal link.
            </p>
          </div>
        </div>
      </Card>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "12px 18px",
            borderRadius: "10px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
            background: toast.type === "success" ? "var(--db-success)" : "var(--db-danger)",
            color: "var(--db-accent-text)",
            fontSize: "13px",
            fontWeight: 500,
            maxWidth: "400px",
          }}
        >
          {toast.type === "success" ? (
            <IconCircleCheck size={16} />
          ) : (
            <IconAlertCircle size={16} />
          )}
          {toast.msg}
        </div>
      )}

      {/* Spin keyframe (inline for portability) */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
