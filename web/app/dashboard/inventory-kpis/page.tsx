/**
 * JChat 3.0 — Inventory KPIs (Dashboard) · Fase B1
 *
 * Four read-only profitability / efficiency KPI cards driven by the
 * `inventory_kpis` RPC (migration 131):
 *
 *   1. Cost of Goods %  (pour_cost_pct)
 *   2. Inventory Value  (inventory_value_cents)
 *   3. Turnover         (turnover)
 *   4. Days on Hand     (days_on_hand)
 *
 * The RPC is SECURITY DEFINER and raises 'forbidden' (42501) for anyone who is
 * neither the owner nor an employee with `inventory_manage`. This page performs
 * NO writes. NULL values (denominator = 0) are displayed as "—", never as 0.
 *
 * Modeled after: web/app/dashboard/inventory-report/page.tsx
 */

"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { IconGauge, IconPackage, IconRefresh, IconClock } from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { formatCents } from "@/lib/currency";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

// ── Types ─────────────────────────────────────────────────────────────────────

type RangePreset = "30d" | "7d" | "month" | "custom";

interface KpiRow {
  total_revenue_cents: number;
  costed_revenue_cents: number;
  cogs_cents: number;
  pour_cost_pct: number | null;
  coverage_pct: number | null;
  inventory_value_cents: number;
  turnover: number | null;
  days_on_hand: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function localDayStart(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/**
 * Resolves the preset to [start, end). `end` is EXCLUSIVE — the RPC filters
 * with `created_at < p_to` — so "up to today" = start of tomorrow.
 */
function getRange(preset: RangePreset, customStart: string, customEnd: string): { start: Date; end: Date } {
  const today = localDayStart();
  const tomorrow = addDays(today, 1);

  if (preset === "7d")    return { start: addDays(today, -6), end: tomorrow };
  if (preset === "month") return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: tomorrow };
  if (preset === "custom") {
    const start = customStart ? new Date(`${customStart}T00:00:00`) : addDays(today, -29);
    const end   = customEnd   ? addDays(new Date(`${customEnd}T00:00:00`), 1) : tomorrow;
    return { start, end };
  }
  return { start: addDays(today, -29), end: tomorrow }; // "30d" (default)
}

/** True when the RPC refused the caller (owner / inventory_manage gate). */
function isForbidden(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42501" || (err.message ?? "").toLowerCase().includes("forbidden");
}

// ── Range picker (shared logic from inventory-report) ─────────────────────────

function DateRangePicker({
  preset,
  customStart,
  customEnd,
  onPreset,
  onCustomStart,
  onCustomEnd,
  t,
}: {
  preset: RangePreset;
  customStart: string;
  customEnd: string;
  onPreset: (p: RangePreset) => void;
  onCustomStart: (v: string) => void;
  onCustomEnd: (v: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const presets: { key: RangePreset; label: string }[] = [
    { key: "30d",    label: t("invReportRange30d") },
    { key: "7d",     label: t("invReportRange7d") },
    { key: "month",  label: t("invReportRangeMonth") },
    { key: "custom", label: t("invReportRangeCustom") },
  ];

  const btnBase: React.CSSProperties = {
    padding: "5px 12px",
    borderRadius: "999px",
    fontSize: "12px",
    border: "1px solid var(--db-border)",
    cursor: "pointer",
    transition: "all 0.15s",
  };

  const inputStyle: React.CSSProperties = {
    padding: "4px 8px",
    borderRadius: "6px",
    border: "1px solid var(--db-border)",
    background: "var(--db-bg-elevated)",
    color: "var(--db-text-primary)",
    fontSize: "12px",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "24px" }}>
      {presets.map(({ key, label }) => {
        const active = preset === key;
        return (
          <button
            key={key}
            onClick={() => onPreset(key)}
            style={{
              ...btnBase,
              fontWeight: active ? 700 : 500,
              background: active
                ? "color-mix(in srgb, var(--db-accent) 12%, transparent)"
                : "var(--db-bg-elevated)",
              borderColor: active ? "var(--db-accent)" : "var(--db-border)",
              color: active ? "var(--db-accent)" : "var(--db-text-secondary)",
            }}
          >
            {label}
          </button>
        );
      })}
      {preset === "custom" && (
        <>
          <label style={{ fontSize: "12px", color: "var(--db-text-secondary)" }}>{t("salesRangeFrom")}</label>
          <input type="date" value={customStart} onChange={(e) => onCustomStart(e.target.value)} style={inputStyle} />
          <label style={{ fontSize: "12px", color: "var(--db-text-secondary)" }}>{t("salesRangeTo")}</label>
          <input type="date" value={customEnd} onChange={(e) => onCustomEnd(e.target.value)} style={inputStyle} />
        </>
      )}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  icon,
  label,
  value,
  valueColor,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  valueColor: string;
  /** Optional badge / hint rendered below the figure. */
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        flex: "1 1 200px",
        padding: "20px",
        borderRadius: "var(--db-radius-card)",
        border: "1px solid var(--db-border)",
        background: "var(--db-bg-elevated)",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span aria-hidden="true" style={{ color: "var(--db-text-tertiary)", display: "flex" }}>
          {icon}
        </span>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--db-text-tertiary)",
          }}
        >
          {label}
        </span>
      </div>

      {/* Figure */}
      <div
        style={{
          fontSize: "28px",
          fontWeight: 700,
          color: valueColor,
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>

      {/* Optional badge / hint */}
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InventoryKpisPage() {
  const t      = useTranslations("dashboardCommon");
  const locale = useLocale();

  const [preset, setPreset]           = useState<RangePreset>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd]     = useState("");

  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [forbidden, setForbidden]   = useState(false);
  const [noBusiness, setNoBusiness] = useState(false);
  const [kpis, setKpis]             = useState<KpiRow | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    let active = true;

    void (async () => {
      try {
        setLoading(true);
        setError(false);
        setForbidden(false);

        const res = await resolveActiveBusiness();
        if (!active) return;
        if (!res.ok) { setNoBusiness(true); setLoading(false); return; }

        const { start, end } = getRange(preset, customStart, customEnd);
        const { data, error: rpcErr } = await supabase.rpc("inventory_kpis", {
          p_business_id: res.business.id,
          p_from: start.toISOString(),
          p_to:   end.toISOString(),
        });
        if (!active) return;

        if (rpcErr) {
          if (isForbidden(rpcErr)) setForbidden(true);
          else setError(true);
          setKpis(null);
          return;
        }

        // The RPC always returns exactly one row; treat an empty array as null.
        setKpis(data && data.length > 0 ? (data[0] as KpiRow) : null);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [preset, customStart, customEnd]);

  // ── Derived values ───────────────────────────────────────────────────────────

  // "Empty" means no costed revenue at all — all derived metrics will be "—".
  const isEmpty = kpis !== null && kpis.costed_revenue_cents === 0 && kpis.total_revenue_cents === 0;

  // Pour cost: colour indicator
  function pourCostColor(): string {
    if (kpis?.pour_cost_pct == null) return "var(--db-text-primary)";
    return kpis.pour_cost_pct > 24 ? "var(--db-warning)" : "var(--db-success)";
  }

  // Null-safe formatter: returns "—" for null/undefined, formatted string otherwise
  function fmt(v: number | null | undefined, decimals: number): string {
    if (v == null) return "—";
    return v.toFixed(decimals);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (noBusiness) {
    return <div><NoBusinessCTA /></div>;
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
          {t("invKpisTitle")}
        </h1>
        <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "4px 0 0" }}>
          {t("invKpisSubtitle")}
        </p>
      </div>

      {/* Range picker */}
      <DateRangePicker
        preset={preset}
        customStart={customStart}
        customEnd={customEnd}
        onPreset={setPreset}
        onCustomStart={setCustomStart}
        onCustomEnd={setCustomEnd}
        t={t}
      />

      {/* Loading */}
      {loading && (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--db-text-secondary)", fontSize: "13px" }}>
          {t("invKpisLoading")}
        </div>
      )}

      {/* Forbidden */}
      {!loading && forbidden && (
        <div style={{ padding: "48px 24px", textAlign: "center" }}>
          <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--db-text-primary)", margin: 0 }}>
            {t("invKpisForbidden")}
          </p>
          <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: "6px 0 0" }}>
            {t("invKpisForbiddenHint")}
          </p>
        </div>
      )}

      {/* Generic error */}
      {!loading && !forbidden && error && (
        <div style={{ padding: "24px", textAlign: "center", color: "var(--db-danger)", fontSize: "13px" }}>
          {t("invKpisError")}
        </div>
      )}

      {/* KPI cards */}
      {!loading && !forbidden && !error && kpis !== null && (
        <>
          {/* Friendly empty notice */}
          {isEmpty && (
            <div style={{ marginBottom: "20px", padding: "16px 20px", borderRadius: "var(--db-radius-card)", border: "1px solid var(--db-border)", background: "var(--db-bg-elevated)" }}>
              <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--db-text-primary)", margin: 0 }}>
                {t("invKpisEmpty")}
              </p>
              <p style={{ fontSize: "12px", color: "var(--db-text-secondary)", margin: "4px 0 0", maxWidth: "440px" }}>
                {t("invKpisEmptyHint")}
              </p>
            </div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
            {/* 1. Cost of Goods % */}
            <KpiCard
              icon={<IconGauge size={15} />}
              label={t("invKpisPourCost")}
              value={kpis.pour_cost_pct != null ? `${fmt(kpis.pour_cost_pct, 1)}%` : "—"}
              valueColor={pourCostColor()}
            >
              {/* Coverage badge */}
              {kpis.coverage_pct != null && (
                <span
                  style={{
                    display: "inline-block",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--db-text-secondary)",
                    background: "color-mix(in srgb, var(--db-accent) 10%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--db-accent) 25%, transparent)",
                    borderRadius: "4px",
                    padding: "2px 7px",
                    width: "fit-content",
                  }}
                >
                  {t("invKpisCoverage", { pct: fmt(kpis.coverage_pct, 1) })}
                </span>
              )}
              {/* Target reference */}
              <span style={{ fontSize: "11px", color: "var(--db-text-tertiary)" }}>
                {t("invKpisPourCostMeta")}
              </span>
            </KpiCard>

            {/* 2. Inventory Value */}
            <KpiCard
              icon={<IconPackage size={15} />}
              label={t("invKpisInvValue")}
              value={formatCents(kpis.inventory_value_cents, locale)}
              valueColor="var(--db-text-primary)"
            />

            {/* 3. Turnover */}
            <KpiCard
              icon={<IconRefresh size={15} />}
              label={t("invKpisTurnover")}
              value={fmt(kpis.turnover, 2)}
              valueColor={kpis.turnover != null ? "var(--db-text-primary)" : "var(--db-text-tertiary)"}
            />

            {/* 4. Days on Hand */}
            <KpiCard
              icon={<IconClock size={15} />}
              label={t("invKpisDaysOnHand")}
              value={fmt(kpis.days_on_hand, 1)}
              valueColor={kpis.days_on_hand != null ? "var(--db-text-primary)" : "var(--db-text-tertiary)"}
            />
          </div>

          {/* Footnote: turnover/days are approximate */}
          <p
            style={{
              marginTop: "20px",
              fontSize: "11px",
              color: "var(--db-text-tertiary)",
              maxWidth: "560px",
            }}
          >
            {t("invKpisFootnote")}
          </p>
        </>
      )}
    </div>
  );
}
