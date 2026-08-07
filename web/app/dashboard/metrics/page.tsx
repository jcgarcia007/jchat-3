"use client";

/**
 * JChat 3.0 — KDS Time Metrics
 *
 * Read-only page: shows average queue / prep / pickup times for the active
 * business, broken down by station and listing the 5 slowest menu items.
 *
 * Data source: RPC pos_kds_metrics(p_business_id, p_from, p_to)
 * → { overall, by_station[], slowest_prep[] }
 *
 * DO NOT touch payments, KDS order flow, or the mobile POS.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  IconChartBar,
  IconRefresh,
  IconAlertCircle,
  IconClock,
  IconChefHat,
  IconGlass,
} from "@tabler/icons-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveBusiness } from "@/lib/business";
import { NoBusinessCTA } from "@/components/dashboard/NoBusinessCTA";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OverallMetrics {
  count: number;
  queue_secs: number | null;
  prep_secs: number | null;
  pickup_secs: number | null;
}

interface StationMetrics {
  station: string;
  count: number;
  queue_secs: number | null;
  prep_secs: number | null;
  pickup_secs: number | null;
}

interface SlowestItem {
  name: string;
  count: number;
  prep_secs: number | null;
}

interface KdsMetricsResult {
  overall: OverallMetrics;
  by_station: StationMetrics[];
  slowest_prep: SlowestItem[];
}

type DateRange = "today" | "7d" | "30d";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Formats a seconds value to a human-readable string (e.g. "3m 42s").
 *  Returns "—" for null / undefined / NaN. */
function fmtSecs(secs: number | null | undefined): string {
  if (secs == null || !isFinite(secs)) return "—";
  const total = Math.round(secs);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/** Calculates ISO from/to strings for a given date range. */
function calcRange(range: DateRange): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  let from: Date;
  if (range === "today") {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (range === "7d") {
    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else {
    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  return { from: from.toISOString(), to };
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_DATA: KdsMetricsResult = {
  overall: { count: 142, queue_secs: 95, prep_secs: 480, pickup_secs: 72 },
  by_station: [
    { station: "kitchen", count: 98,  queue_secs: 110, prep_secs: 540, pickup_secs: 80 },
    { station: "bar",     count: 44,  queue_secs: 65,  prep_secs: 360, pickup_secs: 55 },
  ],
  slowest_prep: [
    { name: "Wagyu Burger",     count: 12, prep_secs: 960 },
    { name: "Seafood Paella",   count: 8,  prep_secs: 900 },
    { name: "Beef Wellington",  count: 5,  prep_secs: 840 },
    { name: "Truffle Risotto",  count: 15, prep_secs: 720 },
    { name: "Rack of Lamb",     count: 7,  prep_secs: 660 },
  ],
};

// ── Main component ────────────────────────────────────────────────────────────

export default function MetricsPage() {
  const t = useTranslations("dashboardCommon");

  const [range, setRange]                   = useState<DateRange>("7d");
  const [metrics, setMetrics]               = useState<KdsMetricsResult | null>(null);
  const [loading, setLoading]               = useState(true);
  const [needsRegister, setNeedsRegister]   = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  const loadMetrics = useCallback(
    async (selectedRange: DateRange) => {
      setLoading(true);
      setError(null);

      if (!isSupabaseConfigured) {
        // Demo mode — simulate a short delay then show demo data
        await new Promise((r) => setTimeout(r, 400));
        setMetrics(DEMO_DATA);
        setLoading(false);
        return;
      }

      try {
        const res = await resolveActiveBusiness();
        if (!res.ok) {
          if (res.reason === "no_business" || res.reason === "unauthenticated") {
            setNeedsRegister(true);
          } else {
            setError(res.message);
          }
          setLoading(false);
          return;
        }

        const { from, to } = calcRange(selectedRange);

        // pos_kds_metrics is not in the generated types; cast to any.
        const { data, error: rpcErr } = await (supabase as unknown as {
          rpc(
            fn: "pos_kds_metrics",
            params: { p_business_id: string; p_from: string; p_to: string },
          ): Promise<{ data: KdsMetricsResult | null; error: { message: string } | null }>;
        }).rpc("pos_kds_metrics", {
          p_business_id: res.business.id,
          p_from: from,
          p_to: to,
        });

        if (rpcErr) throw rpcErr;
        setMetrics(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("metricsErrorLoad"));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void loadMetrics(range);
  }, [loadMetrics, range]);

  // ── Early exits ────────────────────────────────────────────────────────────

  if (!loading && needsRegister) {
    return (
      <div style={{ maxWidth: "960px" }}>
        <PageHeader t={t} />
        <NoBusinessCTA message={t("metricsNoBusinessMessage")} />
      </div>
    );
  }

  const overall  = metrics?.overall ?? null;
  const isEmpty  = !loading && overall != null && overall.count === 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: "960px" }}>
      {/* Header + range picker */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "20px",
        }}
      >
        <PageHeader t={t} />
        <RangePicker range={range} onChange={setRange} t={t} />
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "10px 14px", borderRadius: "var(--db-radius)",
            background: "rgba(239,68,68,0.12)", color: "var(--db-danger)",
            fontSize: "13px", marginBottom: "16px",
          }}
        >
          <IconAlertCircle size={15} />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "40px", color: "var(--db-text-secondary)", fontSize: "14px",
          }}
        >
          <IconRefresh size={18} style={{ animation: "spin 1s linear infinite" }} />
          {t("metricsLoading")}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div
          style={{
            textAlign: "center", padding: "60px 24px",
            background: "var(--db-bg-surface)", borderRadius: "var(--db-radius-card)",
            border: "1px solid var(--db-border)",
          }}
        >
          <IconClock size={36} color="var(--db-text-tertiary)" style={{ marginBottom: "12px" }} />
          <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--db-text-primary)", margin: "0 0 6px" }}>
            {t("metricsEmpty")}
          </p>
          <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: 0 }}>
            {t("metricsEmptySub")}
          </p>
        </div>
      )}

      {/* Main content */}
      {!loading && !isEmpty && metrics && (
        <>
          {/* Section 1 — Summary cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "14px",
              marginBottom: "24px",
            }}
          >
            <MetricCard
              label={t("metricsCardQueue")}
              sub={t("metricsCardQueueSub")}
              value={fmtSecs(overall?.queue_secs)}
              accent="var(--db-warning)"
            />
            <MetricCard
              label={t("metricsCardPrep")}
              sub={t("metricsCardPrepSub")}
              value={fmtSecs(overall?.prep_secs)}
              accent="var(--db-accent)"
            />
            <MetricCard
              label={t("metricsCardPickup")}
              sub={t("metricsCardPickupSub")}
              value={fmtSecs(overall?.pickup_secs)}
              accent="var(--db-success)"
            />
            <MetricCard
              label={t("metricsCardItems")}
              sub={`${t("metricsRangeToday").toLowerCase()} / ${t("metricsRange7d").toLowerCase()} / ${t("metricsRange30d").toLowerCase()}`}
              value={String(overall?.count ?? 0)}
              accent="var(--db-text-secondary)"
              large={false}
            />
          </div>

          {/* Section 2 — By station */}
          {metrics.by_station.length > 0 && (
            <SectionCard title={t("metricsStationsTitle")} style={{ marginBottom: "24px" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr>
                      {[
                        t("metricsColStation"),
                        t("metricsColItems"),
                        t("metricsColQueue"),
                        t("metricsColPrep"),
                        t("metricsColPickup"),
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left", padding: "8px 12px",
                            borderBottom: "1px solid var(--db-border)",
                            color: "var(--db-text-tertiary)",
                            fontWeight: 600, fontSize: "11px",
                            letterSpacing: "0.04em", textTransform: "uppercase",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.by_station.map((row) => {
                      const isKitchen = row.station === "kitchen";
                      const Icon = isKitchen ? IconChefHat : IconGlass;
                      const label = isKitchen
                        ? t("metricsStationKitchen")
                        : row.station === "bar"
                        ? t("metricsStationBar")
                        : row.station;
                      return (
                        <tr
                          key={row.station}
                          style={{ borderBottom: "1px solid var(--db-border)" }}
                        >
                          <td style={{ padding: "10px 12px" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <Icon size={14} color="var(--db-accent)" />
                              <span style={{ fontWeight: 600, color: "var(--db-text-primary)" }}>
                                {label}
                              </span>
                            </span>
                          </td>
                          <td style={{ padding: "10px 12px", color: "var(--db-text-primary)" }}>
                            {row.count}
                          </td>
                          <td style={{ padding: "10px 12px", color: "var(--db-text-primary)" }}>
                            {fmtSecs(row.queue_secs)}
                          </td>
                          <td style={{ padding: "10px 12px", color: "var(--db-text-primary)", fontWeight: 600 }}>
                            {fmtSecs(row.prep_secs)}
                          </td>
                          <td style={{ padding: "10px 12px", color: "var(--db-text-primary)" }}>
                            {fmtSecs(row.pickup_secs)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* Section 3 — Top 5 slowest */}
          {metrics.slowest_prep.length > 0 && (
            <SectionCard title={t("metricsSlowestTitle")}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr>
                      {[
                        "#",
                        t("metricsSlowestColItem"),
                        t("metricsSlowestColCount"),
                        t("metricsSlowestColPrep"),
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left", padding: "8px 12px",
                            borderBottom: "1px solid var(--db-border)",
                            color: "var(--db-text-tertiary)",
                            fontWeight: 600, fontSize: "11px",
                            letterSpacing: "0.04em", textTransform: "uppercase",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.slowest_prep.map((item, idx) => (
                      <tr
                        key={item.name}
                        style={{ borderBottom: "1px solid var(--db-border)" }}
                      >
                        <td
                          style={{
                            padding: "10px 12px",
                            color: "var(--db-text-tertiary)",
                            fontWeight: 700,
                            width: "32px",
                          }}
                        >
                          {idx + 1}
                        </td>
                        <td style={{ padding: "10px 12px", color: "var(--db-text-primary)", fontWeight: 500 }}>
                          {item.name}
                        </td>
                        <td style={{ padding: "10px 12px", color: "var(--db-text-secondary)" }}>
                          {item.count}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: "999px",
                              background: "rgba(239,68,68,0.10)",
                              color: "var(--db-danger)",
                              fontWeight: 700,
                              fontSize: "12px",
                            }}
                          >
                            {fmtSecs(item.prep_secs)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

type TFunc = ReturnType<typeof useTranslations>;

function PageHeader({ t }: { t: TFunc }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "2px" }}>
        <IconChartBar size={22} color="var(--db-accent)" />
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
          {t("metricsPageTitle")}
        </h1>
      </div>
      <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", margin: 0 }}>
        {t("metricsSubtitle")}
      </p>
    </div>
  );
}

function RangePicker({
  range,
  onChange,
  t,
}: {
  range: DateRange;
  onChange: (r: DateRange) => void;
  t: TFunc;
}) {
  const options: { value: DateRange; label: string }[] = [
    { value: "today", label: t("metricsRangeToday") },
    { value: "7d",    label: t("metricsRange7d")    },
    { value: "30d",   label: t("metricsRange30d")   },
  ];

  return (
    <div
      style={{
        display: "flex",
        gap: "4px",
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "var(--db-radius)",
        padding: "3px",
        flexShrink: 0,
      }}
    >
      {options.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          style={{
            padding: "5px 14px",
            borderRadius: "calc(var(--db-radius) - 2px)",
            border: "none",
            background: range === value ? "var(--db-accent)" : "transparent",
            color: range === value ? "var(--db-accent-text)" : "var(--db-text-secondary)",
            fontSize: "12px",
            fontWeight: range === value ? 700 : 400,
            cursor: "pointer",
            transition: "background 0.15s, color 0.15s",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function MetricCard({
  label,
  sub,
  value,
  accent,
  large = true,
}: {
  label: string;
  sub: string;
  value: string;
  accent: string;
  large?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "var(--db-radius-card)",
        padding: "18px 20px",
        borderTop: `3px solid ${accent}`,
      }}
    >
      <div
        style={{
          fontSize: large ? "28px" : "22px",
          fontWeight: 700,
          color: "var(--db-text-primary)",
          lineHeight: 1.1,
          marginBottom: "6px",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--db-text-primary)", marginBottom: "2px" }}>
        {label}
      </div>
      <div style={{ fontSize: "11px", color: "var(--db-text-tertiary)" }}>
        {sub}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
  style: extraStyle,
}: {
  title: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "var(--db-bg-surface)",
        border: "1px solid var(--db-border)",
        borderRadius: "var(--db-radius-card)",
        overflow: "hidden",
        ...extraStyle,
      }}
    >
      <div
        style={{
          padding: "14px 18px 10px",
          borderBottom: "1px solid var(--db-border)",
        }}
      >
        <h2 style={{ fontSize: "14px", fontWeight: 700, color: "var(--db-text-primary)", margin: 0 }}>
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}
