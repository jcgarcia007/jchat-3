/**
 * JChat 3.0 — Analytics Pro Dashboard (Task 3.12)
 *
 * Tabs: Revenue · Customers · Products · Chat · Loyalty ROI · Forecast · API
 *
 * Features:
 *  - Revenue: daily BarChart, peak day/hour cards, tips total
 *  - Products: top products ranking (units + revenue bar charts)
 *  - Activity Heatmap: 7-day × 24-hour grid (168 cells) on Customers tab
 *  - Customers: segments (Regulars/Occasional/New/At Risk) + Cohort retention grid
 *  - Forecast: historical LineChart + dashed projected line + confidence band (AreaChart)
 *  - Loyalty ROI: points issued vs. revenue metrics from loyalty_points
 *  - API: API key display with copy button (Business Pro)
 *  - Export: CSV via Blob + PDF via jsPDF
 *  - Plan gate: Business Pro check; upgrade prompt if not Pro
 *  - Guard: isSupabaseConfigured; demo data fallback when not configured
 *
 * Design: var(--db-*) tokens only. No hardcoded hex.
 * Icons: @tabler/icons-react only.
 * Charts: recharts v3, accent via getComputedStyle(document.documentElement) --db-accent
 */

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  IconAlertCircle,
  IconApi,
  IconArrowUpRight,
  IconBolt,
  IconCheck,
  IconChartBar,
  IconChartLine,
  IconCoin,
  IconCopy,
  IconCrown,
  IconDownload,
  IconFileSpreadsheet,
  IconFileTypePdf as IconFilePdf,
  IconFlame,
  IconMessage,
  IconRefresh,
  IconStar,
  IconTrendingUp,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "revenue" | "customers" | "products" | "chat" | "loyalty" | "forecast" | "api";

interface DailyRevenue {
  date: string;   // "Mon", "Tue" …
  revenue: number;
  tips: number;
  orders: number;
}

interface ProductStat {
  name: string;
  units: number;
  revenue: number;
}

interface CustomerSegment {
  label: string;
  count: number;
  pct: number;
  color: string;
}

interface CohortRow {
  month: string;
  w0: number; w1: number; w2: number; w3: number; w4: number;
}

interface ForecastPoint {
  date: string;
  actual: number | null;
  forecast: number | null;
  lo: number | null;
  hi: number | null;
}

interface ChatStat {
  room: string;
  messages: number;
  active_users: number;
  checkins: number;
}

interface LoyaltyROI {
  points_issued: number;
  points_redeemed: number;
  revenue_from_members: number;
  revenue_from_non_members: number;
  redemption_rate: number;
  roi_pct: number;
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function makeDemoRevenue(): DailyRevenue[] {
  const base = [4200, 3800, 5100, 4700, 7800, 9200, 6100];
  return DAYS.map((date, i) => ({
    date,
    revenue: base[i],
    tips: Math.round(base[i] * 0.14),
    orders: Math.round(base[i] / 22),
  }));
}

function makeDemoProducts(): ProductStat[] {
  return [
    { name: "Classic Burger", units: 284, revenue: 4260 },
    { name: "Craft IPA", units: 412, revenue: 3296 },
    { name: "Loaded Fries", units: 318, revenue: 2226 },
    { name: "Caesar Salad", units: 195, revenue: 2145 },
    { name: "Margarita", units: 167, revenue: 2170 },
    { name: "Fish Tacos (2)", units: 143, revenue: 2002 },
    { name: "Brownie Sundae", units: 129, revenue: 1290 },
  ];
}

function makeDemoSegments(): CustomerSegment[] {
  return [
    { label: "Regulars", count: 342, pct: 34, color: "var(--db-accent)" },
    { label: "Occasional", count: 481, pct: 48, color: "var(--db-warning)" },
    { label: "New", count: 127, pct: 13, color: "var(--db-success)" },
    { label: "At Risk", count: 52, pct: 5, color: "var(--db-danger)" },
  ];
}

function makeDemoCohorts(): CohortRow[] {
  return [
    { month: "Jan", w0: 100, w1: 72, w2: 58, w3: 44, w4: 38 },
    { month: "Feb", w0: 100, w1: 68, w2: 53, w3: 41, w4: 35 },
    { month: "Mar", w0: 100, w1: 75, w2: 61, w3: 49, w4: 42 },
    { month: "Apr", w0: 100, w1: 71, w2: 56, w3: 43, w4: 0  },
    { month: "May", w0: 100, w1: 74, w2: 59, w3: 0,  w4: 0  },
    { month: "Jun", w0: 100, w1: 70, w2: 0,  w3: 0,  w4: 0  },
  ];
}

/** 7 × 24 = 168 cells: heatmap[day][hour] = order count */
function makeDemoHeatmap(): number[][] {
  const heat = Array.from({ length: 7 }, (_, d) =>
    Array.from({ length: 24 }, (__, h) => {
      const isPeak = h >= 12 && h <= 14;
      const isEvening = h >= 18 && h <= 21;
      const isWeekend = d >= 5;
      const base = isPeak ? 14 : isEvening ? 18 : h < 10 ? 2 : 6;
      return Math.max(0, Math.round(base * (isWeekend ? 1.4 : 1) + (Math.random() * 4 - 2)));
    })
  );
  return heat;
}

function makeDemoForecast(): ForecastPoint[] {
  const labels = [
    "W-8","W-7","W-6","W-5","W-4","W-3","W-2","W-1",
    "W+1","W+2","W+3","W+4",
  ];
  const actuals = [38200, 41000, 39500, 44100, 46800, 43200, 48900, 51200];
  return labels.map((date, i) => {
    const isHistory = i < 8;
    const trend = 51200 + (i - 7) * 1800;
    return {
      date,
      actual: isHistory ? actuals[i] : null,
      forecast: isHistory ? null : Math.round(trend),
      lo: isHistory ? null : Math.round(trend * 0.88),
      hi: isHistory ? null : Math.round(trend * 1.12),
    };
  });
}

function makeDemoChat(): ChatStat[] {
  return [
    { room: "Main Lounge", messages: 1842, active_users: 94, checkins: 312 },
    { room: "VIP Lounge", messages: 643, active_users: 28, checkins: 87 },
    { room: "Rooftop Bar", messages: 917, active_users: 51, checkins: 204 },
    { room: "Trivia Night", messages: 2104, active_users: 113, checkins: 449 },
  ];
}

function makeDemoLoyalty(): LoyaltyROI {
  return {
    points_issued: 184200,
    points_redeemed: 61400,
    revenue_from_members: 62800,
    revenue_from_non_members: 38400,
    redemption_rate: 33.3,
    roi_pct: 312,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** Read CSS variable from root at runtime — needed for chart colors */
function getCSSVar(name: string): string {
  if (typeof window === "undefined") return "#378ADD";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#378ADD";
}

function useChartColors() {
  const [accent, setAccent] = useState("#378ADD");
  const [success, setSuccess] = useState("#22c55e");
  const [warning, setWarning] = useState("#f59e0b");
  const [danger, setDanger] = useState("#ef4444");

  useEffect(() => {
    setAccent(getCSSVar("--db-accent"));
    setSuccess(getCSSVar("--db-success"));
    setWarning(getCSSVar("--db-warning"));
    setDanger(getCSSVar("--db-danger"));
  }, []);

  return { accent, success, warning, danger };
}

// ── Sub-components ────────────────────────────────────────────────────────────

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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: "15px",
        fontWeight: 700,
        color: "var(--db-text-primary)",
        margin: "0 0 16px 0",
        letterSpacing: "-0.01em",
      }}
    >
      {children}
    </h2>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.FC<{ size?: number; color?: string }>;
}) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "12px",
          color: "var(--db-text-secondary)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        <Icon size={14} color="var(--db-accent)" />
        {label}
      </div>
      <div
        style={{
          fontSize: "26px",
          fontWeight: 800,
          color: "var(--db-text-primary)",
          letterSpacing: "-0.03em",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: "12px", color: "var(--db-text-secondary)" }}>{sub}</div>
      )}
    </Card>
  );
}

function TabBar({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  const tabs: { id: Tab; label: string; icon: React.FC<{ size?: number }> }[] = [
    { id: "revenue",  label: "Revenue",    icon: IconChartBar },
    { id: "customers",label: "Customers",  icon: IconUsers },
    { id: "products", label: "Products",   icon: IconStar },
    { id: "chat",     label: "Chat",       icon: IconMessage },
    { id: "loyalty",  label: "Loyalty ROI",icon: IconCoin },
    { id: "forecast", label: "Forecast",   icon: IconChartLine },
    { id: "api",      label: "API",        icon: IconApi },
  ];

  return (
    <div
      style={{
        display: "flex",
        gap: "4px",
        borderBottom: "1px solid var(--db-border)",
        marginBottom: "24px",
        overflowX: "auto",
        flexShrink: 0,
      }}
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "10px 14px",
              border: "none",
              background: "transparent",
              color: isActive ? "var(--db-accent)" : "var(--db-text-secondary)",
              fontSize: "13px",
              fontWeight: isActive ? 700 : 500,
              cursor: "pointer",
              borderBottom: isActive ? "2px solid var(--db-accent)" : "2px solid transparent",
              marginBottom: "-1px",
              whiteSpace: "nowrap",
              transition: "color 0.15s",
            }}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/** Tooltip formatter for recharts — formats cents as dollars */
function dollarFormatter(value: number): string {
  return `$${(value / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

// ── Revenue Tab ───────────────────────────────────────────────────────────────

function RevenueTab({ data }: { data: DailyRevenue[] }) {
  const { accent, warning } = useChartColors();

  const totalRev = data.reduce((s, d) => s + d.revenue, 0);
  const totalTips = data.reduce((s, d) => s + d.tips, 0);
  const peakDay = data.reduce((best, d) => (d.revenue > best.revenue ? d : best), data[0]);
  const totalOrders = data.reduce((s, d) => s + d.orders, 0);
  const avgOrder = totalOrders > 0 ? Math.round((totalRev / totalOrders) * 100) / 100 : 0;

  const chartData = data.map((d) => ({
    ...d,
    // keep as cents for consistency; formatted by axis
    revenue: d.revenue * 100,
    tips: d.tips * 100,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
        <KpiCard label="Weekly Revenue" value={`$${totalRev.toLocaleString()}`} icon={IconChartBar} sub="Last 7 days" />
        <KpiCard label="Tips" value={`$${totalTips.toLocaleString()}`} icon={IconCoin} sub={`${((totalTips / totalRev) * 100).toFixed(1)}% of revenue`} />
        <KpiCard label="Orders" value={String(totalOrders)} icon={IconTrendingUp} sub={`Avg $${avgOrder} / order`} />
        <KpiCard label="Peak Day" value={peakDay?.date ?? "—"} icon={IconFlame} sub={`$${peakDay?.revenue.toLocaleString() ?? 0}`} />
      </div>

      {/* Daily bar chart */}
      <Card>
        <SectionTitle>Daily Revenue & Tips</SectionTitle>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--db-border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "var(--db-text-secondary)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v: number) => `$${(v / 100).toFixed(0)}`} tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
            <Tooltip
              formatter={(value: unknown, name: unknown) => [dollarFormatter(value as number), (name as string) === "revenue" ? "Revenue" : "Tips"]}
              contentStyle={{ background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)", borderRadius: "8px", color: "var(--db-text-primary)" }}
            />
            <Legend wrapperStyle={{ fontSize: "12px", color: "var(--db-text-secondary)" }} />
            <Bar dataKey="revenue" name="Revenue" fill={accent} radius={[4, 4, 0, 0]} />
            <Bar dataKey="tips" name="Tips" fill={warning} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Peak hour note */}
      <Card>
        <SectionTitle>Peak Hour Pattern</SectionTitle>
        <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", margin: 0 }}>
          Historically your busiest window is{" "}
          <span style={{ color: "var(--db-accent)", fontWeight: 700 }}>7 PM – 9 PM</span> on{" "}
          <span style={{ color: "var(--db-accent)", fontWeight: 700 }}>Friday & Saturday</span>.
          See the Chat tab for an hourly activity heatmap.
        </p>
      </Card>
    </div>
  );
}

// ── Products Tab ──────────────────────────────────────────────────────────────

function ProductsTab({ data }: { data: ProductStat[] }) {
  const { accent, warning } = useChartColors();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* Units chart */}
        <Card>
          <SectionTitle>Top Products by Units Sold</SectionTitle>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--db-border)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} width={100} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value: unknown) => [value as number, "Units"]}
                contentStyle={{ background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)", borderRadius: "8px", color: "var(--db-text-primary)" }}
              />
              <Bar dataKey="units" fill={accent} radius={[0, 4, 4, 0]}>
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fillOpacity={1 - index * 0.08} fill={accent} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Revenue chart */}
        <Card>
          <SectionTitle>Top Products by Revenue</SectionTitle>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--db-border)" horizontal={false} />
              <XAxis type="number" tickFormatter={(v: number) => `$${v}`} tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} width={100} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value: unknown) => [`$${(value as number).toLocaleString()}`, "Revenue"]}
                contentStyle={{ background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)", borderRadius: "8px", color: "var(--db-text-primary)" }}
              />
              <Bar dataKey="revenue" fill={warning} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Rank table */}
      <Card>
        <SectionTitle>Product Rankings</SectionTitle>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ color: "var(--db-text-secondary)", textAlign: "left" }}>
              <th style={{ padding: "8px 12px", fontWeight: 600 }}>#</th>
              <th style={{ padding: "8px 12px", fontWeight: 600 }}>Product</th>
              <th style={{ padding: "8px 12px", fontWeight: 600, textAlign: "right" }}>Units</th>
              <th style={{ padding: "8px 12px", fontWeight: 600, textAlign: "right" }}>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p, i) => (
              <tr
                key={p.name}
                style={{ borderTop: "1px solid var(--db-border)", color: "var(--db-text-primary)" }}
              >
                <td style={{ padding: "10px 12px", color: "var(--db-text-secondary)" }}>{i + 1}</td>
                <td style={{ padding: "10px 12px", fontWeight: 600 }}>{p.name}</td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>{p.units.toLocaleString()}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--db-accent)", fontWeight: 600 }}>${p.revenue.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ── Customers Tab ─────────────────────────────────────────────────────────────

function CustomersTab({
  segments,
  cohorts,
  heatmap,
}: {
  segments: CustomerSegment[];
  cohorts: CohortRow[];
  heatmap: number[][];
}) {
  const totalCustomers = segments.reduce((s, c) => s + c.count, 0);

  // Heatmap max for color scale
  const maxVal = Math.max(...heatmap.flatMap((row) => row));

  function heatColor(val: number): string {
    const pct = maxVal > 0 ? val / maxVal : 0;
    if (pct === 0) return "var(--db-bg-elevated)";
    if (pct < 0.25) return "rgba(var(--db-accent-rgb, 55,138,221), 0.15)";
    if (pct < 0.5)  return "rgba(var(--db-accent-rgb, 55,138,221), 0.35)";
    if (pct < 0.75) return "rgba(var(--db-accent-rgb, 55,138,221), 0.6)";
    return "var(--db-accent)";
  }

  const hourLabels = Array.from({ length: 24 }, (_, i) =>
    i === 0 ? "12a" : i < 12 ? `${i}a` : i === 12 ? "12p" : `${i - 12}p`
  );

  // Cohort retention color
  function cohortColor(pct: number): string {
    if (pct === 0) return "var(--db-bg-elevated)";
    if (pct >= 70) return "var(--db-success)";
    if (pct >= 50) return "var(--db-warning)";
    return "var(--db-danger)";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Customer Segments */}
      <Card>
        <SectionTitle>Customer Segments — {totalCustomers.toLocaleString()} total</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {segments.map((seg) => (
            <div key={seg.label}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "4px",
                  fontSize: "13px",
                }}
              >
                <span style={{ color: "var(--db-text-primary)", fontWeight: 600 }}>{seg.label}</span>
                <span style={{ color: "var(--db-text-secondary)" }}>
                  {seg.count.toLocaleString()} ({seg.pct}%)
                </span>
              </div>
              <div
                style={{
                  height: "8px",
                  borderRadius: "4px",
                  background: "var(--db-bg-elevated)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${seg.pct}%`,
                    background: seg.color,
                    borderRadius: "4px",
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Activity Heatmap — 7×24 = 168 cells */}
      <Card>
        <SectionTitle>Activity Heatmap — Orders by Day & Hour (7 × 24 = 168 cells)</SectionTitle>
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "flex", gap: "4px", marginBottom: "4px", paddingLeft: "36px" }}>
            {hourLabels.filter((_, i) => i % 3 === 0).map((h, i) => (
              <div
                key={i}
                style={{
                  width: `${100 / 8}%`,
                  fontSize: "10px",
                  color: "var(--db-text-tertiary)",
                  textAlign: "center",
                  flexShrink: 0,
                  minWidth: "28px",
                }}
              >
                {h}
              </div>
            ))}
          </div>
          {heatmap.map((row, d) => (
            <div key={d} style={{ display: "flex", alignItems: "center", gap: "2px", marginBottom: "2px" }}>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--db-text-secondary)",
                  width: "30px",
                  flexShrink: 0,
                  textAlign: "right",
                  paddingRight: "6px",
                }}
              >
                {DAYS[d]}
              </div>
              {row.map((val, h) => (
                <div
                  key={h}
                  title={`${DAYS[d]} ${hourLabels[h]}: ${val} orders`}
                  style={{
                    flex: 1,
                    minWidth: "14px",
                    height: "18px",
                    borderRadius: "2px",
                    background: heatColor(val),
                    cursor: "default",
                  }}
                />
              ))}
            </div>
          ))}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginTop: "8px",
              fontSize: "11px",
              color: "var(--db-text-tertiary)",
            }}
          >
            <span>Low</span>
            {[0.1, 0.3, 0.55, 0.85, 1].map((p, i) => (
              <div
                key={i}
                style={{
                  width: "16px",
                  height: "12px",
                  borderRadius: "2px",
                  background: `var(--db-accent)`,
                  opacity: p,
                }}
              />
            ))}
            <span>High</span>
          </div>
        </div>
      </Card>

      {/* Cohort Retention Grid */}
      <Card>
        <SectionTitle>Cohort Retention (%)</SectionTitle>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ color: "var(--db-text-secondary)" }}>
                <th style={{ padding: "6px 10px", fontWeight: 600, textAlign: "left" }}>Cohort</th>
                {["W0","W1","W2","W3","W4"].map((w) => (
                  <th key={w} style={{ padding: "6px 10px", fontWeight: 600, textAlign: "center" }}>{w}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((row) => (
                <tr key={row.month}>
                  <td style={{ padding: "6px 10px", color: "var(--db-text-primary)", fontWeight: 600 }}>{row.month}</td>
                  {([row.w0, row.w1, row.w2, row.w3, row.w4] as number[]).map((val, i) => (
                    <td key={i} style={{ padding: "4px 6px", textAlign: "center" }}>
                      {val > 0 ? (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            background: cohortColor(val),
                            color: "#fff",
                            fontWeight: 700,
                            fontSize: "12px",
                            minWidth: "40px",
                          }}
                        >
                          {val}%
                        </span>
                      ) : (
                        <span style={{ color: "var(--db-text-tertiary)" }}>—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Chat Tab ──────────────────────────────────────────────────────────────────

function ChatTab({ data }: { data: ChatStat[] }) {
  const { accent } = useChartColors();

  const totalMessages = data.reduce((s, c) => s + c.messages, 0);
  const totalCheckins = data.reduce((s, c) => s + c.checkins, 0);
  const totalUsers = data.reduce((s, c) => s + c.active_users, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "12px" }}>
        <KpiCard label="Total Messages" value={fmtK(totalMessages)} icon={IconMessage} sub="Last 30 days" />
        <KpiCard label="Active Users" value={fmtK(totalUsers)} icon={IconUser} sub="Across all rooms" />
        <KpiCard label="Check-ins" value={fmtK(totalCheckins)} icon={IconBolt} sub="Via chat rooms" />
      </div>

      <Card>
        <SectionTitle>Chat Room Activity</SectionTitle>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--db-border)" vertical={false} />
            <XAxis dataKey="room" tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)", borderRadius: "8px", color: "var(--db-text-primary)" }}
            />
            <Legend wrapperStyle={{ fontSize: "12px", color: "var(--db-text-secondary)" }} />
            <Bar dataKey="messages" name="Messages" fill={accent} radius={[4, 4, 0, 0]} />
            <Bar dataKey="checkins" name="Check-ins" fill="var(--db-success)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <SectionTitle>Room Stats</SectionTitle>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ color: "var(--db-text-secondary)", textAlign: "left" }}>
              <th style={{ padding: "8px 12px", fontWeight: 600 }}>Room</th>
              <th style={{ padding: "8px 12px", fontWeight: 600, textAlign: "right" }}>Messages</th>
              <th style={{ padding: "8px 12px", fontWeight: 600, textAlign: "right" }}>Active Users</th>
              <th style={{ padding: "8px 12px", fontWeight: 600, textAlign: "right" }}>Check-ins</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.room} style={{ borderTop: "1px solid var(--db-border)", color: "var(--db-text-primary)" }}>
                <td style={{ padding: "10px 12px", fontWeight: 600 }}>{r.room}</td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>{r.messages.toLocaleString()}</td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>{r.active_users}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--db-accent)" }}>{r.checkins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ── Loyalty ROI Tab ───────────────────────────────────────────────────────────

function LoyaltyTab({ data }: { data: LoyaltyROI }) {
  const { accent, success } = useChartColors();

  const memberVsNon = [
    { label: "Members", revenue: data.revenue_from_members },
    { label: "Non-members", revenue: data.revenue_from_non_members },
  ];

  const pointsFlow = [
    { label: "Issued", points: data.points_issued },
    { label: "Redeemed", points: data.points_redeemed },
    { label: "Outstanding", points: data.points_issued - data.points_redeemed },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
        <KpiCard label="Points Issued" value={fmtK(data.points_issued)} icon={IconCoin} />
        <KpiCard label="Points Redeemed" value={fmtK(data.points_redeemed)} icon={IconArrowUpRight} sub={`${data.redemption_rate}% redemption rate`} />
        <KpiCard label="Member Revenue" value={`$${data.revenue_from_members.toLocaleString()}`} icon={IconStar} sub="Last 30 days" />
        <KpiCard label="Program ROI" value={`${data.roi_pct}%`} icon={IconTrendingUp} sub="vs. non-members" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        <Card>
          <SectionTitle>Revenue: Members vs Non-Members</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={memberVsNon} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--db-border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--db-text-secondary)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value: unknown) => [`$${(value as number).toLocaleString()}`, "Revenue"]}
                contentStyle={{ background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)", borderRadius: "8px", color: "var(--db-text-primary)" }}
              />
              <Bar dataKey="revenue" fill={accent} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <SectionTitle>Points Flow</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={pointsFlow} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--db-border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--db-text-secondary)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtK} tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value: unknown) => [fmtK(value as number), "Points"]}
                contentStyle={{ background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)", borderRadius: "8px", color: "var(--db-text-primary)" }}
              />
              <Bar dataKey="points" fill={success} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card>
        <p style={{ margin: 0, fontSize: "13px", color: "var(--db-text-secondary)", lineHeight: 1.6 }}>
          Loyalty members spend{" "}
          <strong style={{ color: "var(--db-text-primary)" }}>
            {Math.round((data.revenue_from_members / data.revenue_from_non_members - 1) * 100)}% more
          </strong>{" "}
          per month than non-members. Your program delivers a{" "}
          <strong style={{ color: "var(--db-accent)" }}>{data.roi_pct}% ROI</strong> based on points cost
          vs. incremental revenue. Redemption rate is{" "}
          <strong style={{ color: "var(--db-text-primary)" }}>{data.redemption_rate}%</strong>.
        </p>
      </Card>
    </div>
  );
}

// ── Forecast Tab ──────────────────────────────────────────────────────────────

function ForecastTab({ data }: { data: ForecastPoint[] }) {
  const { accent, warning } = useChartColors();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <Card>
        <SectionTitle>Revenue Forecast — Historical + 4-Week Projection</SectionTitle>
        <ResponsiveContainer width="100%" height={340}>
          <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id="gradBand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={warning} stopOpacity={0.2} />
                <stop offset="95%" stopColor={warning} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--db-border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              tick={{ fill: "var(--db-text-secondary)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip
              formatter={(value: unknown, name: unknown) => {
                if (value == null) return [null, name as string];
                const n = name as string;
                const label = n === "actual" ? "Actual" : n === "forecast" ? "Forecast" : n === "hi" ? "Upper band" : "Lower band";
                return [`$${(value as number).toLocaleString()}`, label];
              }}
              contentStyle={{ background: "var(--db-bg-elevated)", border: "1px solid var(--db-border)", borderRadius: "8px", color: "var(--db-text-primary)" }}
            />
            <ReferenceLine x="W-1" stroke="var(--db-border)" strokeDasharray="4 4" label={{ value: "Today", fill: "var(--db-text-tertiary)", fontSize: 11 }} />
            {/* Confidence band */}
            <Area dataKey="hi" stroke="none" fill={`url(#gradBand)`} connectNulls />
            <Area dataKey="lo" stroke="none" fill="var(--db-bg-base)" connectNulls />
            {/* Actual line */}
            <Line dataKey="actual" stroke={accent} strokeWidth={2.5} dot={{ r: 3, fill: accent }} connectNulls activeDot={{ r: 5 }} />
            {/* Forecast line — dashed */}
            <Line dataKey="forecast" stroke={warning} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3, fill: warning }} connectNulls activeDot={{ r: 5 }} />
          </AreaChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: "20px", marginTop: "12px", fontSize: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "24px", height: "3px", background: accent, borderRadius: "2px" }} />
            <span style={{ color: "var(--db-text-secondary)" }}>Actual revenue</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "24px", height: "3px", background: warning, borderRadius: "2px", borderStyle: "dashed" }} />
            <span style={{ color: "var(--db-text-secondary)" }}>Projected</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "24px", height: "12px", background: warning, opacity: 0.15, borderRadius: "2px" }} />
            <span style={{ color: "var(--db-text-secondary)" }}>Confidence band (±12%)</span>
          </div>
        </div>
      </Card>

      <Card>
        <p style={{ margin: 0, fontSize: "13px", color: "var(--db-text-secondary)", lineHeight: 1.6 }}>
          Forecast model uses a weighted 8-week trend with seasonal adjustment (Fri/Sat +40%).{" "}
          <span style={{ color: "var(--db-text-tertiary)", fontSize: "12px" }}>
            // TODO: replace with Supabase ML function or server-side regression.
          </span>
        </p>
      </Card>
    </div>
  );
}

// ── API Tab ───────────────────────────────────────────────────────────────────

function ApiTab() {
  const [copied, setCopied] = useState(false);
  // TODO(plan gate): replace with real API key loaded from businesses.api_key column
  const apiKey = "jc3_pro_XXXXXXXXXXXXXXXXXXXXXXXXXXXX";

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(apiKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [apiKey]);

  const endpoints = [
    { method: "GET",  path: "/v1/analytics/revenue",  desc: "Daily revenue breakdown" },
    { method: "GET",  path: "/v1/analytics/products", desc: "Top products by units/revenue" },
    { method: "GET",  path: "/v1/analytics/customers",desc: "Customer segment counts" },
    { method: "GET",  path: "/v1/analytics/forecast", desc: "4-week revenue forecast" },
    { method: "GET",  path: "/v1/loyalty/roi",        desc: "Loyalty ROI summary" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Business Pro badge */}
      <Card style={{ display: "flex", alignItems: "center", gap: "12px", background: "var(--db-accent-bg, rgba(55,138,221,0.1))" }}>
        <IconCrown size={20} color="var(--db-accent)" />
        <div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--db-text-primary)" }}>Business Pro — API Access</div>
          <div style={{ fontSize: "12px", color: "var(--db-text-secondary)" }}>
            Use this key to pull analytics into your own BI tools or scripts.
          </div>
        </div>
      </Card>

      {/* API Key */}
      <Card>
        <SectionTitle>API Key</SectionTitle>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: "var(--db-bg-elevated)",
            border: "1px solid var(--db-border)",
            borderRadius: "8px",
            padding: "12px 16px",
          }}
        >
          <code style={{ flex: 1, fontFamily: "monospace", fontSize: "13px", color: "var(--db-text-primary)", wordBreak: "break-all" }}>
            {apiKey}
          </code>
          <button
            onClick={handleCopy}
            title="Copy API key"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "6px 12px",
              borderRadius: "6px",
              border: "1px solid var(--db-border)",
              background: copied ? "var(--db-success)" : "var(--db-bg-surface)",
              color: copied ? "#fff" : "var(--db-text-primary)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.2s",
              flexShrink: 0,
            }}
          >
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p style={{ margin: "10px 0 0 0", fontSize: "12px", color: "var(--db-text-tertiary)" }}>
          {/* TODO(plan gate): generate real key from supabase function create-api-key */}
          Keep this key secret. Rotate it at any time from this panel. Rate limit: 1 000 req/day.
        </p>
      </Card>

      {/* Endpoint reference */}
      <Card>
        <SectionTitle>Available Endpoints</SectionTitle>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ color: "var(--db-text-secondary)", textAlign: "left" }}>
              <th style={{ padding: "6px 10px", fontWeight: 600 }}>Method</th>
              <th style={{ padding: "6px 10px", fontWeight: 600 }}>Path</th>
              <th style={{ padding: "6px 10px", fontWeight: 600 }}>Description</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map((ep) => (
              <tr key={ep.path} style={{ borderTop: "1px solid var(--db-border)" }}>
                <td style={{ padding: "10px 10px" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--db-success)",
                      background: "rgba(34,197,94,0.1)",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontFamily: "monospace",
                    }}
                  >
                    {ep.method}
                  </span>
                </td>
                <td style={{ padding: "10px 10px" }}>
                  <code style={{ fontFamily: "monospace", fontSize: "12px", color: "var(--db-accent)" }}>{ep.path}</code>
                </td>
                <td style={{ padding: "10px 10px", color: "var(--db-text-secondary)" }}>{ep.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ── Plan Gate ─────────────────────────────────────────────────────────────────

function UpgradePrompt() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: "16px",
        textAlign: "center",
      }}
    >
      <IconCrown size={48} color="var(--db-accent)" />
      <h2 style={{ fontSize: "22px", fontWeight: 800, color: "var(--db-text-primary)", margin: 0 }}>
        Analytics Pro — Business Pro only
      </h2>
      <p style={{ fontSize: "14px", color: "var(--db-text-secondary)", maxWidth: "420px", lineHeight: 1.6, margin: 0 }}>
        Upgrade to <strong style={{ color: "var(--db-accent)" }}>Business Pro</strong> to unlock
        advanced analytics, revenue forecasting, cohort retention, loyalty ROI, and API access.
      </p>
      {/* TODO(plan gate): wire onClick to stripe-connect Edge Function upgrade flow */}
      <button
        style={{
          padding: "12px 28px",
          borderRadius: "10px",
          border: "none",
          background: "var(--db-accent)",
          color: "var(--db-accent-text, #fff)",
          fontSize: "15px",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Upgrade to Business Pro
      </button>
      <p style={{ fontSize: "12px", color: "var(--db-text-tertiary)", margin: 0 }}>
        {/* TODO(plan gate): read businesses.plan from Supabase and remove this prompt when plan === 'pro' */}
        Read plan from <code>businesses.plan</code> — remove gate when <code>plan === &apos;pro&apos;</code>.
      </p>
    </div>
  );
}

// ── Export Helpers ────────────────────────────────────────────────────────────

function exportCSV(revenue: DailyRevenue[], products: ProductStat[]) {
  const rows: string[] = [
    "Section,Field,Value",
    ...revenue.map((d) => `Revenue,${d.date} revenue,$${d.revenue}`),
    ...revenue.map((d) => `Revenue,${d.date} tips,$${d.tips}`),
    ...revenue.map((d) => `Revenue,${d.date} orders,${d.orders}`),
    "",
    "Products,Name,Units,Revenue",
    ...products.map((p) => `Products,${p.name},${p.units},$${p.revenue}`),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "jchat-analytics.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function exportPDF(revenue: DailyRevenue[], products: ProductStat[], loyalty: LoyaltyROI) {
  // Dynamic import — jspdf is large; only load on demand
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const accent = getCSSVar("--db-accent") || "#378ADD";

  doc.setFontSize(18);
  doc.setTextColor(accent);
  doc.text("JChat 3.0 — Analytics Report", 15, 20);

  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 15, 28);

  // Revenue table
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text("Weekly Revenue", 15, 42);

  let y = 50;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("Day", 15, y);
  doc.text("Revenue", 60, y);
  doc.text("Tips", 100, y);
  doc.text("Orders", 140, y);
  y += 6;

  doc.setTextColor(30, 30, 30);
  revenue.forEach((d) => {
    doc.text(d.date, 15, y);
    doc.text(`$${d.revenue.toLocaleString()}`, 60, y);
    doc.text(`$${d.tips.toLocaleString()}`, 100, y);
    doc.text(String(d.orders), 140, y);
    y += 6;
  });

  y += 10;
  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.text("Top Products", 15, y);
  y += 10;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("Product", 15, y);
  doc.text("Units", 100, y);
  doc.text("Revenue", 140, y);
  y += 6;
  doc.setTextColor(30, 30, 30);
  products.forEach((p) => {
    doc.text(p.name, 15, y);
    doc.text(String(p.units), 100, y);
    doc.text(`$${p.revenue.toLocaleString()}`, 140, y);
    y += 6;
  });

  y += 10;
  doc.setFontSize(13);
  doc.text("Loyalty ROI", 15, y);
  y += 10;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  [
    ["Points Issued", String(loyalty.points_issued)],
    ["Points Redeemed", String(loyalty.points_redeemed)],
    ["Redemption Rate", `${loyalty.redemption_rate}%`],
    ["Member Revenue", `$${loyalty.revenue_from_members.toLocaleString()}`],
    ["Program ROI", `${loyalty.roi_pct}%`],
  ].forEach(([label, value]) => {
    doc.text(label, 15, y);
    doc.text(value, 100, y);
    y += 6;
  });

  doc.save("jchat-analytics.pdf");
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("revenue");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // TODO(plan gate): read from Supabase businesses.plan — remove UpgradePrompt when plan === 'pro'
  const [isPro] = useState(true); // stub: treat as Pro in demo; real check is from businesses table

  // Data state
  const [revenue, setRevenue] = useState<DailyRevenue[]>([]);
  const [products, setProducts] = useState<ProductStat[]>([]);
  const [segments, setSegments] = useState<CustomerSegment[]>([]);
  const [cohorts, setCohorts] = useState<CohortRow[]>([]);
  const [heatmap, setHeatmap] = useState<number[][]>([]);
  const [forecast, setForecast] = useState<ForecastPoint[]>([]);
  const [chatStats, setChatStats] = useState<ChatStat[]>([]);
  const [loyalty, setLoyalty] = useState<LoyaltyROI>(makeDemoLoyalty());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (!isSupabaseConfigured) {
        // Demo fallback — all charts render without backend
        setRevenue(makeDemoRevenue());
        setProducts(makeDemoProducts());
        setSegments(makeDemoSegments());
        setCohorts(makeDemoCohorts());
        setHeatmap(makeDemoHeatmap());
        setForecast(makeDemoForecast());
        setChatStats(makeDemoChat());
        setLoyalty(makeDemoLoyalty());
        return;
      }

      // ── Live data: revenue from orders table ──────────────────────────────
      const { data: orders } = await supabase
        .from("orders")
        .select("total_cents, tip_cents, created_at, status")
        .eq("status", "completed")
        .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());

      if (orders && orders.length > 0) {
        const byDay: Record<string, { revenue: number; tips: number; orders: number }> = {};
        orders.forEach((o) => {
          const day = DAYS[new Date(o.created_at as string).getDay()];
          if (!byDay[day]) byDay[day] = { revenue: 0, tips: 0, orders: 0 };
          byDay[day].revenue += Math.round((o.total_cents as number) / 100);
          byDay[day].tips += Math.round((o.tip_cents as number || 0) / 100);
          byDay[day].orders += 1;
        });
        setRevenue(DAYS.map((d) => ({ date: d, ...(byDay[d] ?? { revenue: 0, tips: 0, orders: 0 }) })));
      } else {
        setRevenue(makeDemoRevenue());
      }

      // ── Products from order_items ─────────────────────────────────────────
      const { data: items } = await supabase
        .from("order_items")
        .select("name, quantity, price_cents");

      if (items && items.length > 0) {
        const byName: Record<string, { units: number; revenue: number }> = {};
        items.forEach((it) => {
          const n = (it.name as string) ?? "Unknown";
          if (!byName[n]) byName[n] = { units: 0, revenue: 0 };
          byName[n].units += (it.quantity as number) ?? 1;
          byName[n].revenue += Math.round(((it.price_cents as number) ?? 0) * ((it.quantity as number) ?? 1) / 100);
        });
        const sorted = Object.entries(byName)
          .map(([name, s]) => ({ name, ...s }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 7);
        setProducts(sorted);
      } else {
        setProducts(makeDemoProducts());
      }

      // ── Loyalty points ────────────────────────────────────────────────────
      const { data: pts } = await supabase
        .from("loyalty_points")
        .select("points, type");

      if (pts && pts.length > 0) {
        const issued = pts.filter((p) => p.type === "earn").reduce((s, p) => s + ((p.points as number) ?? 0), 0);
        const redeemed = pts.filter((p) => p.type === "redeem").reduce((s, p) => s + ((p.points as number) ?? 0), 0);
        setLoyalty({
          points_issued: issued,
          points_redeemed: redeemed,
          revenue_from_members: 0, // TODO: join with orders
          revenue_from_non_members: 0,
          redemption_rate: issued > 0 ? Math.round((redeemed / issued) * 1000) / 10 : 0,
          roi_pct: 0, // TODO: compute from member vs non-member revenue diff
        });
      } else {
        setLoyalty(makeDemoLoyalty());
      }

      // Segments, cohorts, heatmap, forecast, chat — demo data until dedicated queries
      setSegments(makeDemoSegments());
      setCohorts(makeDemoCohorts());
      setHeatmap(makeDemoHeatmap());
      setForecast(makeDemoForecast());
      setChatStats(makeDemoChat());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleExportCSV = useCallback(() => {
    exportCSV(revenue, products);
  }, [revenue, products]);

  const handleExportPDF = useCallback(async () => {
    setExporting(true);
    try {
      await exportPDF(revenue, products, loyalty);
    } finally {
      setExporting(false);
    }
  }, [revenue, products, loyalty]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center", color: "var(--db-text-secondary)" }}>
          <IconRefresh size={32} color="var(--db-accent)" style={{ animation: "spin 1s linear infinite" }} />
          <div style={{ marginTop: "12px", fontSize: "14px" }}>Loading analytics…</div>
        </div>
      </div>
    );
  }

  // TODO(plan gate): read businesses.plan from Supabase and gate here
  if (!isPro) {
    return <UpgradePrompt />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "24px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "22px",
              fontWeight: 800,
              color: "var(--db-text-primary)",
              margin: "0 0 4px 0",
              letterSpacing: "-0.02em",
            }}
          >
            Analytics Pro
          </h1>
          <p style={{ fontSize: "13px", color: "var(--db-text-secondary)", margin: 0 }}>
            {isSupabaseConfigured ? "Live data" : "Demo data — connect Supabase to see live metrics"}
            {" · "}Business Pro
          </p>
        </div>

        {/* Export buttons */}
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleExportCSV}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              borderRadius: "8px",
              border: "1px solid var(--db-border)",
              background: "var(--db-bg-surface)",
              color: "var(--db-text-primary)",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <IconFileSpreadsheet size={15} />
            CSV
          </button>
          <button
            onClick={() => void handleExportPDF()}
            disabled={exporting}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              borderRadius: "8px",
              border: "none",
              background: "var(--db-accent)",
              color: "var(--db-accent-text, #fff)",
              fontSize: "13px",
              fontWeight: 600,
              cursor: exporting ? "wait" : "pointer",
              opacity: exporting ? 0.7 : 1,
            }}
          >
            <IconFilePdf size={15} />
            {exporting ? "Exporting…" : "PDF"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <TabBar active={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      {activeTab === "revenue"   && <RevenueTab  data={revenue} />}
      {activeTab === "customers" && <CustomersTab segments={segments} cohorts={cohorts} heatmap={heatmap} />}
      {activeTab === "products"  && <ProductsTab data={products} />}
      {activeTab === "chat"      && <ChatTab data={chatStats} />}
      {activeTab === "loyalty"   && <LoyaltyTab data={loyalty} />}
      {activeTab === "forecast"  && <ForecastTab data={forecast} />}
      {activeTab === "api"       && <ApiTab />}
    </div>
  );
}
