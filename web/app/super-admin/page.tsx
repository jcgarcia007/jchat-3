/**
 * JChat 3.0 — Super Admin Overview (Task 3.13)
 *
 * Metrics: MRR, ARR, total users, DAU/MAU, churn rate, active businesses.
 * Alerts summary bar.
 * Cmd+K command palette (client-side keydown → modal nav list).
 *
 * TODO(roles): gate via admin_roles / users.role — currently renders for any
 *   authenticated user reaching /super-admin.
 *
 * Tokens: var(--bg-*) / var(--text-*) / var(--color-*) / var(--border-*)
 * NO hardcoded hex. Icons: @tabler/icons-react only.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  IconShield,
  IconUsers,
  IconBuildingStore,
  IconCurrencyDollar,
  IconAlertTriangle,
  IconSearch,
  IconLoader2,
  IconX,
  IconArrowRight,
  IconChartBar,
  IconBell,
  IconUserCheck,
  IconBroadcast,
  IconUsersGroup,
  IconMapPin,
  IconReceiptRefund,
  IconTrendingUp,
  IconTrendingDown,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { formatCompact } from "@/lib/currency";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OverviewMetrics {
  totalUsers: number;
  activeBusinesses: number;
  mrr: number; // cents
  arr: number; // cents
  dau: number;
  mau: number;
  churnRate: number; // 0-100 percent
  openAlerts: number;
  pendingVerifications: number;
  openDisputes: number;
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_METRICS: OverviewMetrics = {
  totalUsers: 12_847,
  activeBusinesses: 384,
  mrr: 2_394_00, // $2,394.00
  arr: 28_728_00,
  dau: 3_210,
  mau: 9_540,
  churnRate: 2.4,
  openAlerts: 7,
  pendingVerifications: 12,
  openDisputes: 3,
};

// ─── Nav items for Cmd+K palette ─────────────────────────────────────────────

// labelKey is a dotted path into the "superAdmin" namespace — most of these
// are the exact same nav labels as the shell (Ch0), reused via shell.navX;
// "Verification Queue" is worded differently here, so it gets its own key.
const PALETTE_ITEMS = [
  { labelKey: "shell.navOverview", href: "/super-admin", icon: IconShield },
  { labelKey: "shell.navUsers", href: "/super-admin/users", icon: IconUsers },
  { labelKey: "shell.navBusinesses", href: "/super-admin/businesses", icon: IconBuildingStore },
  { labelKey: "overview.paletteVerificationQueue", href: "/super-admin/verification", icon: IconUserCheck },
  { labelKey: "shell.navRevenue", href: "/super-admin/revenue", icon: IconChartBar },
  { labelKey: "shell.navAlerts", href: "/super-admin/alerts", icon: IconBell },
  { labelKey: "shell.navTeam", href: "/super-admin/team", icon: IconUsersGroup },
  { labelKey: "shell.navAnnouncements", href: "/super-admin/announcements", icon: IconBroadcast },
  { labelKey: "shell.navPublicLocations", href: "/super-admin/locations", icon: IconMapPin },
  { labelKey: "shell.navDisputes", href: "/super-admin/disputes", icon: IconReceiptRefund },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(a: number, b: number): string {
  if (b === 0) return "—";
  return `${((a / b) * 100).toFixed(0)}%`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuperAdminOverviewPage() {
  const t = useTranslations("superAdmin");
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const paletteInputRef = useRef<HTMLInputElement>(null);

  // ── Load metrics ──────────────────────────────────────────────────────────

  const loadMetrics = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setMetrics(DEMO_METRICS);
      setLoading(false);
      return;
    }

    try {
      const [
        { count: userCount },
        { count: bizCount },
        { data: subs },
        { count: alerts },
        { count: verifications },
        { count: disputes },
      ] = await Promise.all([
        supabase.from("users").select("id", { count: "exact", head: true }),
        supabase
          .from("businesses")
          .select("id", { count: "exact", head: true })
          .eq("status", "active"),
        supabase
          .from("subscriptions")
          .select("plan, status")
          .eq("status", "active"),
        supabase
          .from("security_logs")
          .select("id", { count: "exact", head: true }),
          // TODO: security_logs has no 'resolved' column; counting all logs until migration adds it
        supabase
          .from("business_verifications")
          .select("id", { count: "exact", head: true })
          .eq("identity_status", "pending"),
        supabase
          .from("disputes")
          .select("id", { count: "exact", head: true })
          .eq("status", "escalated"),
      ]);

      // Derive MRR from active subscriptions (rough: starter=$29, pro=$79, enterprise=$199)
      const planPrices: Record<string, number> = {
        starter: 2900,
        pro: 7900,
        enterprise: 19900,
        basic: 2900,
      };
      const mrr = (subs ?? []).reduce((sum, s) => {
        return sum + (planPrices[s.plan] ?? 2900);
      }, 0);

      setMetrics({
        totalUsers: userCount ?? 0,
        activeBusinesses: bizCount ?? 0,
        mrr,
        arr: mrr * 12,
        dau: 0, // TODO: derive from active_sessions or events table
        mau: 0,
        churnRate: 0, // TODO: derive from subscription cancellations
        openAlerts: alerts ?? 0,
        pendingVerifications: verifications ?? 0,
        openDisputes: disputes ?? 0,
      });
    } catch {
      setMetrics(DEMO_METRICS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  // ── Cmd+K listener ────────────────────────────────────────────────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        setPaletteQuery("");
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (paletteOpen) {
      setTimeout(() => paletteInputRef.current?.focus(), 50);
    }
  }, [paletteOpen]);

  const paletteItems = useMemo(
    () => PALETTE_ITEMS.map((item) => ({ ...item, label: t(item.labelKey) })),
    [t],
  );

  const filteredItems = paletteItems.filter((item) =>
    item.label.toLowerCase().includes(paletteQuery.toLowerCase())
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const m = metrics ?? DEMO_METRICS;

  return (
    <div style={{ maxWidth: "960px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "28px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <IconShield
            size={22}
            stroke={1.6}
            style={{ color: "var(--color-brand)" }}
          />
          <h1
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            {t("overview.title")}
          </h1>
        </div>
        <button
          onClick={() => {
            setPaletteOpen(true);
            setPaletteQuery("");
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "7px 14px",
            borderRadius: "8px",
            border: "1px solid var(--border-subtle)",
            background: "var(--bg-elevated, var(--bg-surface))",
            color: "var(--text-secondary)",
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          <IconSearch size={14} stroke={1.6} />
          {t("overview.quickNavButton")}
          <kbd
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "2px",
              padding: "1px 5px",
              borderRadius: "4px",
              border: "1px solid var(--border-subtle)",
              fontSize: "11px",
              fontFamily: "var(--font-geist-mono, monospace)",
              color: "var(--text-tertiary)",
              background: "var(--bg-surface)",
            }}
          >
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Demo banner */}
      {!isSupabaseConfigured && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 14px",
            borderRadius: "8px",
            background: "rgba(245,158,11,0.08)",
            border: "1px solid var(--color-warning)",
            color: "var(--color-warning)",
            fontSize: "13px",
            marginBottom: "20px",
          }}
        >
          <IconAlertTriangle size={15} stroke={1.6} />
          {t("overview.demoBanner")}
        </div>
      )}

      {loading && (
        <div
          style={{ display: "flex", justifyContent: "center", padding: "60px" }}
        >
          <IconLoader2
            size={28}
            stroke={1.6}
            style={{
              color: "var(--color-brand)",
              animation: "spin 1s linear infinite",
            }}
          />
        </div>
      )}

      {!loading && (
        <>
          {/* KPI grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "14px",
              marginBottom: "28px",
            }}
          >
            <KpiCard
              label={t("overview.kpiMrrLabel")}
              value={formatCompact(m.mrr)}
              sub={t("overview.kpiMrrSub")}
              icon={IconCurrencyDollar}
              color="var(--color-brand)"
            />
            <KpiCard
              label={t("overview.kpiArrLabel")}
              value={formatCompact(m.arr)}
              sub={t("overview.kpiArrSub")}
              icon={IconTrendingUp}
              color="var(--color-success)"
            />
            <KpiCard
              label={t("overview.kpiTotalUsersLabel")}
              value={m.totalUsers.toLocaleString()}
              sub={t("overview.kpiDauMauSub", { pct: pct(m.dau, m.mau) })}
              icon={IconUsers}
              color="var(--color-brand-purple)"
            />
            <KpiCard
              label={t("overview.kpiActiveBusinessesLabel")}
              value={m.activeBusinesses.toLocaleString()}
              sub={t("overview.kpiActiveBusinessesSub")}
              icon={IconBuildingStore}
              color="var(--color-gold)"
            />
            <KpiCard
              label={t("overview.kpiChurnRateLabel")}
              value={`${m.churnRate.toFixed(1)}%`}
              sub={t("overview.kpiChurnRateSub")}
              icon={IconTrendingDown}
              color={m.churnRate > 5 ? "var(--color-danger)" : "var(--color-success)"}
            />
          </div>

          {/* Alerts summary */}
          {(m.openAlerts > 0 || m.pendingVerifications > 0 || m.openDisputes > 0) && (
            <div
              style={{
                background: "rgba(239,68,68,0.06)",
                border: "1px solid var(--color-danger)",
                borderRadius: "10px",
                padding: "16px 20px",
                marginBottom: "24px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "10px",
                }}
              >
                <IconAlertTriangle
                  size={16}
                  stroke={1.6}
                  style={{ color: "var(--color-danger)" }}
                />
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 700,
                    color: "var(--color-danger)",
                  }}
                >
                  {t("overview.alertsSectionTitle")}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                {m.openAlerts > 0 && (
                  <AlertBadge
                    count={m.openAlerts}
                    label={t("overview.securityAlertsLabel")}
                    href="/super-admin/alerts"
                  />
                )}
                {m.pendingVerifications > 0 && (
                  <AlertBadge
                    count={m.pendingVerifications}
                    label={t("overview.pendingVerificationsLabel")}
                    href="/super-admin/verification"
                  />
                )}
                {m.openDisputes > 0 && (
                  <AlertBadge
                    count={m.openDisputes}
                    label={t("overview.escalatedDisputesLabel")}
                    href="/super-admin/disputes"
                  />
                )}
              </div>
            </div>
          )}

          {/* Quick links grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: "10px",
            }}
          >
            {paletteItems.filter((i) => i.href !== "/super-admin").map((item) => {
              const ItemIcon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "14px 16px",
                    borderRadius: "10px",
                    border: "1px solid var(--border-subtle)",
                    background: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    textDecoration: "none",
                    fontSize: "14px",
                    fontWeight: 500,
                    transition: "border-color 0.12s",
                  }}
                >
                  <ItemIcon
                    size={16}
                    stroke={1.6}
                    style={{ color: "var(--color-brand)", flexShrink: 0 }}
                  />
                  <span style={{ flex: 1 }}>{item.label}</span>
                  <IconArrowRight
                    size={14}
                    stroke={1.6}
                    style={{ color: "var(--text-tertiary)", flexShrink: 0 }}
                  />
                </Link>
              );
            })}
          </div>
        </>
      )}

      {/* ── Cmd+K Palette ─────────────────────────────────────────────────── */}
      {paletteOpen && (
        <>
          <div
            onClick={() => setPaletteOpen(false)}
            aria-hidden="true"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              zIndex: 60,
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("overview.paletteAriaLabel")}
            style={{
              position: "fixed",
              top: "20%",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 70,
              width: "min(520px, calc(100vw - 32px))",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "14px",
              boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
              overflow: "hidden",
            }}
          >
            {/* Search input */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "14px 16px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <IconSearch
                size={16}
                stroke={1.6}
                style={{ color: "var(--text-tertiary)", flexShrink: 0 }}
              />
              <input
                ref={paletteInputRef}
                type="text"
                placeholder={t("overview.paletteGoToPlaceholder")}
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  outline: "none",
                  fontSize: "15px",
                  color: "var(--text-primary)",
                }}
              />
              <button
                onClick={() => setPaletteOpen(false)}
                aria-label={t("overview.paletteCloseAriaLabel")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-tertiary)",
                  display: "flex",
                  padding: "2px",
                }}
              >
                <IconX size={16} stroke={1.6} />
              </button>
            </div>

            {/* Results */}
            <div style={{ padding: "8px 0", maxHeight: "320px", overflowY: "auto" }}>
              {filteredItems.length === 0 && (
                <div
                  style={{
                    padding: "20px",
                    textAlign: "center",
                    fontSize: "13px",
                    color: "var(--text-tertiary)",
                  }}
                >
                  {t("overview.paletteNoResults", { query: paletteQuery })}
                </div>
              )}
              {filteredItems.map((item) => {
                const PIcon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setPaletteOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 16px",
                      color: "var(--text-primary)",
                      textDecoration: "none",
                      fontSize: "14px",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.background =
                        "var(--bg-elevated, var(--bg-overlay))";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.background =
                        "transparent";
                    }}
                  >
                    <PIcon
                      size={15}
                      stroke={1.6}
                      style={{ color: "var(--color-brand)", flexShrink: 0 }}
                    />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ size?: number; stroke?: number; style?: React.CSSProperties }>;
  color: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "12px",
        padding: "18px 20px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "10px",
        }}
      >
        <Icon size={16} stroke={1.6} style={{ color }} />
        <span
          style={{
            fontSize: "12px",
            fontWeight: 700,
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: "26px",
          fontWeight: 700,
          color: "var(--text-primary)",
          lineHeight: 1.1,
          marginBottom: "4px",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{sub}</div>
    </div>
  );
}

function AlertBadge({
  count,
  label,
  href,
}: {
  count: number;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "5px 10px",
        borderRadius: "20px",
        background: "rgba(239,68,68,0.12)",
        border: "1px solid var(--color-danger)",
        color: "var(--color-danger)",
        fontSize: "12px",
        fontWeight: 600,
        textDecoration: "none",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: "20px",
          height: "20px",
          borderRadius: "20px",
          background: "var(--color-danger)",
          color: "var(--bg-surface-light)",
          fontSize: "11px",
          fontWeight: 700,
          padding: "0 4px",
        }}
      >
        {count}
      </span>
      {label}
      <IconArrowRight size={12} stroke={2} />
    </Link>
  );
}
